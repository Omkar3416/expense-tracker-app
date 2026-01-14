// src/lib/repository/transactionsRepo.ts

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import { getDataMode } from "@/lib/dataMode";

import {
  fetchUserTransactions,
  createOrReplaceTransaction,
  deleteTransactionById,
} from "@/lib/firestore/transactions";

import {
  loadTransactions,
  saveTransactions,
  migrateGuestTransactionsToUser,
} from "@/lib/storage";

import {
  enqueueTxUpsert,
  enqueueTxDelete,
  readTxQueue,
  clearTxQueue,
} from "@/lib/sync/txSyncQueue";

import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

/**
 * ✅ UID-only Firestore key rule (matches Firestore rules):
 * - user doc id = request.auth.uid
 * - path: users/{uid}/transactions/{id}
 */
function getFirestoreUserKey(uid?: string): string | null {
  if (!uid) return null;

  const u = auth.currentUser;
  if (!u) return null;

  // must match authenticated user
  if (u.uid !== uid) return null;

  return uid;
}

type ErrorInfo = { code?: string; message?: string };

function readErrorInfo(err: unknown): ErrorInfo {
  if (!err || typeof err !== "object") return {};
  const rec = err as Record<string, unknown>;

  const code = typeof rec.code === "string" ? rec.code : undefined;
  const message =
    typeof rec.message === "string"
      ? rec.message
      : err instanceof Error
      ? err.message
      : undefined;

  return { code, message };
}

/**
 * Some writes happen before auth.currentUser is ready.
 * Keep local-first behavior, but auto-flush the queue shortly after.
 */
const pendingQueueFlush = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * ✅ If flush happens while auth isn't ready, listen once and flush when auth restores.
 * No UI/behavior change — only prevents queue getting stuck.
 */
const authReadyFlushUnsubs = new Map<string, () => void>();

function safeQueueLen(uid: string): number {
  try {
    return readTxQueue(uid).length;
  } catch {
    return 0;
  }
}

async function syncTxQueueToFirestore(uid: string, userKey: string) {
  const q = readTxQueue(uid);
  if (q.length === 0) return;

  console.debug("[transactionsRepo] flushing queue", {
    uid,
    userKey,
    items: q.length,
  });

  for (const item of q) {
    if (item.kind === "upsert") {
      await createOrReplaceTransaction(userKey, item.tx);
    } else {
      await deleteTransactionById(userKey, item.id);
    }
  }

  clearTxQueue(uid);
}

async function syncLocalCacheToFirestore(userKey: string, local: Transaction[]) {
  if (local.length === 0) return;

  const remote = await fetchUserTransactions(userKey);
  const remoteIds = new Set(remote.map((t) => t.id));

  let pushed = 0;

  for (const tx of local) {
    if (!remoteIds.has(tx.id)) {
      await createOrReplaceTransaction(userKey, tx);
      pushed += 1;
    }
  }

  if (pushed > 0) {
    console.debug("[transactionsRepo] backfill local->firestore pushed", {
      uid: userKey,
      pushed,
    });
  }
}

function getEditorIdentity(): { uid: string | undefined; email: string | null } {
  const u = auth.currentUser;
  return {
    uid: u?.uid,
    email: u?.email ?? null,
  };
}

function applyAuditFields(tx: Transaction, isEdit: boolean): Transaction {
  const now = new Date().toISOString();
  const me = getEditorIdentity();

  const createdAt =
    tx.createdAt && tx.createdAt.trim().length > 0 ? tx.createdAt : now;

  const createdByUid = tx.createdByUid ?? me.uid;
  const createdByEmail =
    typeof tx.createdByEmail !== "undefined" ? tx.createdByEmail : me.email;

  if (!isEdit) {
    return {
      ...tx,
      createdAt,
      updatedAt: tx.updatedAt ?? null,
      createdByUid,
      createdByEmail,
    };
  }

  return {
    ...tx,
    createdAt,
    updatedAt: now,
    createdByUid,
    createdByEmail,
    updatedByUid: me.uid ?? tx.updatedByUid,
    updatedByEmail: me.email ?? tx.updatedByEmail,
  };
}

function ensureFlushOnAuthReady(uid: string) {
  if (typeof window === "undefined") return;
  if (authReadyFlushUnsubs.has(uid)) return;

  const unsub = onAuthStateChanged(auth, async (u) => {
    if (!u || u.uid !== uid) return;

    const existing = authReadyFlushUnsubs.get(uid);
    if (existing) {
      existing();
      authReadyFlushUnsubs.delete(uid);
    }

    const userKey = getFirestoreUserKey(uid);
    if (!userKey) {
      console.debug("[transactionsRepo] authReadyFlush: userKey still not ready", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
      });
      return;
    }

    try {
      const before = safeQueueLen(uid);
      await syncTxQueueToFirestore(uid, userKey);
      console.debug("[transactionsRepo] authReadyFlush: queue flushed", {
        uid,
        before,
        after: safeQueueLen(uid),
      });
    } catch (err: unknown) {
      const e = readErrorInfo(err);
      console.error("[transactionsRepo] authReadyFlush failed:", {
        uid,
        code: e.code,
        message: e.message,
      });
    }
  });

  authReadyFlushUnsubs.set(uid, unsub);
}

function scheduleQueueFlush(uid: string) {
  if (typeof window === "undefined") return;
  if (pendingQueueFlush.has(uid)) return;

  const t = setTimeout(async () => {
    pendingQueueFlush.delete(uid);

    const userKey = getFirestoreUserKey(uid);
    if (!userKey) {
      console.debug("[transactionsRepo] delayed flush skipped (auth not ready)", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        hasAuthUser: !!auth.currentUser,
        queued: safeQueueLen(uid),
        mode: getDataMode(),
      });

      ensureFlushOnAuthReady(uid);
      return;
    }

    try {
      const before = safeQueueLen(uid);
      await syncTxQueueToFirestore(uid, userKey);
      console.debug("[transactionsRepo] queue flushed after delay", {
        uid,
        before,
        after: safeQueueLen(uid),
      });
    } catch (err: unknown) {
      const e = readErrorInfo(err);
      console.error("[transactionsRepo] delayed queue flush failed:", {
        uid,
        code: e.code,
        message: e.message,
      });
    }
  }, 1200);

  pendingQueueFlush.set(uid, t);
}

/* ---------------- Public Repo API ---------------- */

export async function repoFetchTransactions(uid?: string): Promise<Transaction[]> {
  const mode = getDataMode();

  if (uid) {
    try {
      migrateGuestTransactionsToUser(uid);
    } catch {
      // ignore
    }
  }

  const local = loadTransactions(uid);

  if (mode === "local") {
    console.debug("[transactionsRepo] fetch: local mode", {
      uid,
      localCount: local.length,
    });
    return local;
  }

  if (!uid) {
    console.debug("[transactionsRepo] fetch: missing uid -> firestore skipped", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
    });
    return local;
  }

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    ensureFlushOnAuthReady(uid);
    console.debug("[transactionsRepo] fetch: firestore skipped (no userKey)", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      hasAuthUser: !!auth.currentUser,
      queued: safeQueueLen(uid),
      mode,
    });
    return local;
  }

  try {
    await syncTxQueueToFirestore(uid, userKey);
    await syncLocalCacheToFirestore(userKey, local);

    const remote = await fetchUserTransactions(userKey);
    saveTransactions(uid, remote);

    console.debug("[transactionsRepo] fetch: firestore ok", {
      uid: userKey,
      remoteCount: remote.length,
      localCount: local.length,
    });

    return remote;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoFetchTransactions failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });
    return local;
  }
}

export async function repoUpsertTransaction(
  uid: string | undefined,
  tx: Transaction
): Promise<Transaction> {
  const mode = getDataMode();

  const list = loadTransactions(uid);
  const exists = list.some((x) => x.id === tx.id);

  const withAudit = applyAuditFields(tx, exists);

  const idx = list.findIndex((x) => x.id === withAudit.id);
  if (idx >= 0) list[idx] = withAudit;
  else list.unshift(withAudit);

  saveTransactions(uid, list);

  if (mode === "local") {
    console.debug("[transactionsRepo] upsert: local mode", {
      uid,
      id: withAudit.id,
      listCount: list.length,
    });
    return withAudit;
  }

  if (!uid) {
    console.debug("[transactionsRepo] upsert: missing uid -> firestore skipped", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
      id: withAudit.id,
    });
    return withAudit;
  }

  const userKey = getFirestoreUserKey(uid);

  if (!userKey) {
    enqueueTxUpsert(uid, withAudit);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    console.debug("[transactionsRepo] queued upsert (auth not ready or uid mismatch)", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
      hasAuthUser: !!auth.currentUser,
      queued: safeQueueLen(uid),
      id: withAudit.id,
    });

    return withAudit;
  }

  try {
    await createOrReplaceTransaction(userKey, withAudit);
    console.debug("[transactionsRepo] firestore upsert ok", {
      uid: userKey,
      id: withAudit.id,
    });
    return withAudit;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoUpsertTransaction failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    enqueueTxUpsert(uid, withAudit);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    return withAudit;
  }
}

export async function repoDeleteTransaction(uid: string | undefined, id: string) {
  const mode = getDataMode();

  const list = loadTransactions(uid).filter((t) => t.id !== id);
  saveTransactions(uid, list);

  if (mode === "local") {
    console.debug("[transactionsRepo] delete: local mode", { uid, id });
    return id;
  }

  if (!uid) {
    console.debug("[transactionsRepo] delete: missing uid -> firestore skipped", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
      id,
    });
    return id;
  }

  const userKey = getFirestoreUserKey(uid);

  if (!userKey) {
    enqueueTxDelete(uid, id);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    console.debug("[transactionsRepo] queued delete (auth not ready or uid mismatch)", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
      hasAuthUser: !!auth.currentUser,
      queued: safeQueueLen(uid),
      id,
    });

    return id;
  }

  try {
    await deleteTransactionById(userKey, id);
    console.debug("[transactionsRepo] firestore delete ok", { uid: userKey, id });
    return id;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoDeleteTransaction failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    enqueueTxDelete(uid, id);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    return id;
  }
}
