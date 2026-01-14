// src/lib/repository/borrowingsRepo.ts

import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";
import { getDataMode } from "@/lib/dataMode";

import {
  fetchUserBorrowings,
  createOrReplaceBorrowing,
  deleteBorrowingById,
} from "@/lib/firestore/borrowings";

import {
  loadBorrowings,
  saveBorrowings,
  migrateGuestBorrowingsToUser,
} from "@/lib/storage";

import {
  enqueueBorrowDelete,
  enqueueBorrowUpsert,
  readBorrowQueue,
  clearBorrowQueue,
} from "@/lib/sync/borrowSyncQueue";

import { auth } from "@/lib/firebaseClient";

/**
 * ✅ UID-only Firestore key rule (matches Firestore rules):
 * - UID must exist
 * - must match current authenticated user uid
 */
function getFirestoreUserKey(uid?: string): string | null {
  if (!uid) return null;

  const u = auth.currentUser;
  if (!u) return null;

  if (u.uid !== uid) return null;

  return uid;
}

/**
 * Some writes happen before auth.currentUser is ready.
 * Keep local-first behavior, but auto-flush the queue shortly after.
 */
const pendingQueueFlush = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleQueueFlush(uid: string) {
  if (typeof window === "undefined") return;
  if (pendingQueueFlush.has(uid)) return;

  const t = setTimeout(async () => {
    pendingQueueFlush.delete(uid);

    const userKey = getFirestoreUserKey(uid);
    if (!userKey) return;

    try {
      await syncBorrowQueueToFirestore(uid, userKey);
      console.debug("[borrowingsRepo] queue flushed after delay", { uid });
    } catch (err) {
      console.error("[borrowingsRepo] delayed queue flush failed:", err);
    }
  }, 1200);

  pendingQueueFlush.set(uid, t);
}

function getEditorIdentity() {
  const u = auth.currentUser;
  return {
    uid: u?.uid,
    email: u?.email ?? null,
  };
}

function applyAuditFields(b: Borrowing, isEdit: boolean): Borrowing {
  const now = new Date().toISOString();
  const me = getEditorIdentity();

  const createdAt =
    b.createdAt && b.createdAt.trim().length > 0 ? b.createdAt : now;

  const createdByUid = b.createdByUid ?? me.uid;
  const createdByEmail =
    typeof b.createdByEmail !== "undefined" ? b.createdByEmail : me.email;

  if (!isEdit) {
    return {
      ...b,
      createdAt,
      updatedAt: b.updatedAt ?? null,
      createdByUid,
      createdByEmail,
    };
  }

  return {
    ...b,
    createdAt,
    updatedAt: now,
    createdByUid,
    createdByEmail,

    updatedByUid: me.uid ?? b.updatedByUid,
    updatedByEmail: me.email ?? b.updatedByEmail,
  };
}

export async function repoFetchBorrowings(uid?: string): Promise<Borrowing[]> {
  const mode = getDataMode();

  // ✅ migrate guest -> user local
  if (uid) {
    try {
      migrateGuestBorrowingsToUser(uid);
    } catch {
      // ignore
    }
  }

  const local = loadBorrowings(uid);

  // ✅ local mode always uses local
  if (mode === "local") return local;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) return local;

  try {
    // ✅ sync local queue
    await syncBorrowQueueToFirestore(uid!, userKey);

    // ✅ upload missing local items
    await syncLocalBorrowingsToFirestore(userKey, local);

    // ✅ pull remote
    const remote = await fetchUserBorrowings(userKey);

    // ✅ overwrite local with remote
    saveBorrowings(uid, remote);
    return remote;
  } catch (err) {
    console.error("repoFetchBorrowings failed:", err);
    return loadBorrowings(uid);
  }
}

export async function repoUpsertBorrowing(
  uid: string | undefined,
  b: Borrowing
): Promise<Borrowing> {
  const mode = getDataMode();

  const list = loadBorrowings(uid);
  const exists = list.some((x) => x.id === b.id);

  const withAudit = applyAuditFields(b, exists);

  // ✅ local first
  const idx = list.findIndex((x) => x.id === withAudit.id);
  if (idx >= 0) list[idx] = withAudit;
  else list.unshift(withAudit);

  saveBorrowings(uid, list);

  // ✅ local mode always returns local
  if (mode === "local") return withAudit;

  const userKey = getFirestoreUserKey(uid);

  // ✅ Firestore unavailable => queue for later (and auto-flush)
  if (!userKey) {
    if (uid) {
      enqueueBorrowUpsert(uid, withAudit);
      scheduleQueueFlush(uid);
      console.debug("[borrowingsRepo] queued upsert (auth not ready)", {
        uid,
        mode,
        hasAuthUser: !!auth.currentUser,
      });
    }
    return withAudit;
  }

  try {
    await createOrReplaceBorrowing(userKey, withAudit);
    console.debug("[borrowingsRepo] firestore upsert ok", {
      uid: userKey,
      id: withAudit.id,
    });
    return withAudit;
  } catch (err) {
    console.error("repoUpsertBorrowing failed:", err);
    enqueueBorrowUpsert(uid!, withAudit);
    scheduleQueueFlush(uid!);
    return withAudit;
  }
}

export async function repoDeleteBorrowing(uid: string | undefined, id: string) {
  const mode = getDataMode();

  // ✅ local first
  const list = loadBorrowings(uid).filter((b) => b.id !== id);
  saveBorrowings(uid, list);

  if (mode === "local") return id;

  const userKey = getFirestoreUserKey(uid);

  // ✅ Firestore unavailable => queue for later (and auto-flush)
  if (!userKey) {
    if (uid) {
      enqueueBorrowDelete(uid, id);
      scheduleQueueFlush(uid);
      console.debug("[borrowingsRepo] queued delete (auth not ready)", {
        uid,
        mode,
        hasAuthUser: !!auth.currentUser,
      });
    }
    return id;
  }

  try {
    await deleteBorrowingById(userKey, id);
    console.debug("[borrowingsRepo] firestore delete ok", { uid: userKey, id });
    return id;
  } catch (err) {
    console.error("repoDeleteBorrowing failed:", err);
    enqueueBorrowDelete(uid!, id);
    scheduleQueueFlush(uid!);
    return id;
  }
}

/* ---------------- internal sync helpers ---------------- */

async function syncBorrowQueueToFirestore(uid: string, userKey: string) {
  const q = readBorrowQueue(uid);
  if (q.length === 0) return;

  for (const item of q) {
    if (item.kind === "upsert") {
      await createOrReplaceBorrowing(userKey, item.borrowing);
    } else {
      await deleteBorrowingById(userKey, item.id);
    }
  }

  clearBorrowQueue(uid);
}

async function syncLocalBorrowingsToFirestore(userKey: string, local: Borrowing[]) {
  if (local.length === 0) return;

  const remote = await fetchUserBorrowings(userKey);
  const remoteIds = new Set(remote.map((b) => b.id));

  for (const b of local) {
    if (!remoteIds.has(b.id)) {
      await createOrReplaceBorrowing(userKey, b);
    }
  }
}
