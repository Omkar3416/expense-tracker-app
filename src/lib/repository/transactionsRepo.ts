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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * ✅ Returns Firestore userKey (emailLowercase) if allowed.
 * No UID fallback because app is email-based.
 */
function getFirestoreUserKey(uid?: string): string | null {
  if (!uid) return null;

  const u = auth.currentUser;
  if (!u) return null;

  if (u.uid !== uid) return null;
  if (u.emailVerified === false) return null;

  const email = u.email;
  if (typeof email === "string" && email.trim().length > 0) {
    return normalizeEmail(email);
  }

  // ❌ No fallback to UID (your requirement)
  return null;
}

function getEditorIdentity() {
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

  if (mode === "local") return local;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) return local;

  try {
    await syncTxQueueToFirestore(uid!, userKey);
    await syncLocalCacheToFirestore(userKey, local);

    const remote = await fetchUserTransactions(userKey);

    saveTransactions(uid, remote);
    return remote;
  } catch (err) {
    console.error("repoFetchTransactions failed:", err);
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

  if (mode === "local") return withAudit;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    if (uid) enqueueTxUpsert(uid, withAudit); // local queue for later
    return withAudit;
  }

  try {
    await createOrReplaceTransaction(userKey, withAudit);
    return withAudit;
  } catch (err) {
    console.error("repoUpsertTransaction failed:", err);
    enqueueTxUpsert(uid!, withAudit);
    return withAudit;
  }
}

export async function repoDeleteTransaction(uid: string | undefined, id: string) {
  const mode = getDataMode();

  const list = loadTransactions(uid).filter((t) => t.id !== id);
  saveTransactions(uid, list);

  if (mode === "local") return id;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    if (uid) enqueueTxDelete(uid, id);
    return id;
  }

  try {
    await deleteTransactionById(userKey, id);
    return id;
  } catch (err) {
    console.error("repoDeleteTransaction failed:", err);
    enqueueTxDelete(uid!, id);
    return id;
  }
}

/* ---------------- internal helpers ---------------- */

async function syncTxQueueToFirestore(uid: string, userKey: string) {
  const q = readTxQueue(uid);
  if (q.length === 0) return;

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

  for (const tx of local) {
    if (!remoteIds.has(tx.id)) {
      await createOrReplaceTransaction(userKey, tx);
    }
  }
}
