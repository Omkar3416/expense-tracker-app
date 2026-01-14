// src/lib/repository/remindersRepo.ts

import type { Reminder } from "@/store/features/reminders/reminderSlice";
import { getDataMode } from "@/lib/dataMode";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

import {
  loadReminders,
  saveReminders,
  loadDeletedReminders,
  saveDeletedReminders,
  migrateGuestRemindersToUser,
  migrateGuestDeletedRemindersToUser,
} from "@/lib/storageReminders";

import {
  enqueueReminderDelete,
  enqueueReminderUpsert,
  readRemindersQueue,
  clearRemindersQueue,
} from "@/lib/sync/remindersSyncQueue";

import {
  fetchUserReminders,
  createOrReplaceReminder,
  deleteReminderById,
  writeDeletedReminder,
} from "@/lib/firestore/reminders";

/**
 * ✅ Firestore user document key = UID (NOT email)
 * Firestore path:
 * users/{uid}/reminders/{id}
 * users/{uid}/deletedReminders/{id}
 */

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

function getEditorIdentity(): { uid: string | undefined; email: string | null } {
  const u = auth.currentUser;
  return {
    uid: u?.uid,
    email: u?.email ?? null,
  };
}

/**
 * ✅ UID-only Firestore key rule:
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
 * ✅ Some writes happen before auth.currentUser is ready.
 * We keep local-first behavior, but auto-flush the queue shortly after.
 */
const pendingQueueFlush = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * ✅ If auth wasn't ready at the timer moment, we attach a one-time auth listener.
 * This ensures queued ops are flushed as soon as Firebase restores auth session.
 */
const authReadyFlushUnsubs = new Map<string, () => void>();

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
      console.debug("[remindersRepo] authReadyFlush: userKey still not ready", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
      });
      return;
    }

    try {
      const before = safeQueueLen(uid);
      await syncRemindersQueueToFirestore(uid, userKey);
      console.debug("[remindersRepo] authReadyFlush: queue flushed", {
        uid,
        before,
        after: safeQueueLen(uid),
      });
    } catch (err: unknown) {
      const e = readErrorInfo(err);
      console.error("[remindersRepo] authReadyFlush failed:", {
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
      console.debug("[remindersRepo] delayed flush skipped (auth not ready)", {
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
      await syncRemindersQueueToFirestore(uid, userKey);
      console.debug("[remindersRepo] queue flushed after delay", {
        uid,
        before,
        after: safeQueueLen(uid),
      });
    } catch (err: unknown) {
      const e = readErrorInfo(err);
      console.error("[remindersRepo] delayed queue flush failed:", {
        uid,
        code: e.code,
        message: e.message,
      });
    }
  }, 1200);

  pendingQueueFlush.set(uid, t);
}

/**
 * ✅ Normalize and future-proof reminder
 * Ensures safe fields always exist
 */
function normalizeReminder(r: Reminder): Reminder {
  const now = new Date().toISOString();

  const createdAt =
    typeof r.createdAt === "string" && r.createdAt.trim().length > 0
      ? r.createdAt
      : now;

  const updatedAt =
    typeof r.updatedAt === "string" && r.updatedAt.trim().length > 0
      ? r.updatedAt
      : null;

  const dueDate =
    typeof r.dueDate === "string" && r.dueDate.trim().length > 0 ? r.dueDate : now;

  const nextTriggerDate =
    typeof r.nextTriggerDate === "string" && r.nextTriggerDate.trim().length > 0
      ? r.nextTriggerDate
      : dueDate;

  const frequency =
    r.frequency === "once" ||
    r.frequency === "monthly" ||
    r.frequency === "yearly" ||
    r.frequency === "custom"
      ? r.frequency
      : "once";

  const status =
    r.status === "active" || r.status === "paused" || r.status === "completed"
      ? r.status
      : "active";

  return {
    ...r,
    createdAt,
    updatedAt,
    dueDate,
    nextTriggerDate,
    frequency,
    status,
  };
}

function applyAuditFields(r: Reminder, isEdit: boolean): Reminder {
  const now = new Date().toISOString();
  const me = getEditorIdentity();

  const createdAt =
    typeof r.createdAt === "string" && r.createdAt.trim().length > 0
      ? r.createdAt
      : now;

  const createdByUid = r.createdByUid ?? me.uid;
  const createdByEmail =
    typeof r.createdByEmail !== "undefined" ? r.createdByEmail : me.email;

  if (!isEdit) {
    return normalizeReminder({
      ...r,
      createdAt,
      updatedAt: r.updatedAt ?? null,
      createdByUid,
      createdByEmail,
    });
  }

  return normalizeReminder({
    ...r,
    createdAt,
    updatedAt: now,
    createdByUid,
    createdByEmail,
    updatedByUid: me.uid ?? r.updatedByUid,
    updatedByEmail: me.email ?? r.updatedByEmail,
  });
}

/**
 * ✅ Repo: fetch reminders
 */
export async function repoFetchReminders(uid?: string): Promise<Reminder[]> {
  const mode = getDataMode();

  if (uid) {
    try {
      migrateGuestRemindersToUser(uid);
      migrateGuestDeletedRemindersToUser(uid);
    } catch {
      // ignore
    }
  }

  const local = loadReminders(uid).map(normalizeReminder);

  if (mode === "local") {
    console.debug("[remindersRepo] fetch: local mode", {
      uid,
      localCount: local.length,
    });
    return local;
  }

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    if (uid) ensureFlushOnAuthReady(uid);

    console.debug("[remindersRepo] fetch: firestore skipped (no userKey)", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      hasAuthUser: !!auth.currentUser,
      localCount: local.length,
      queued: uid ? safeQueueLen(uid) : 0,
      mode,
    });

    return local;
  }

  // at this point uid must exist (because userKey exists)
  const safeUid = uid ?? userKey;

  try {
    await syncRemindersQueueToFirestore(safeUid, userKey);
    await syncLocalRemindersToFirestore(userKey, local);

    const remote = (await fetchUserReminders(userKey)).map(normalizeReminder);
    saveReminders(uid, remote);

    console.debug("[remindersRepo] fetch: firestore ok", {
      uid: userKey,
      remoteCount: remote.length,
      localCount: local.length,
    });

    return remote;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoFetchReminders failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    return loadReminders(uid).map(normalizeReminder);
  }
}

/**
 * ✅ Repo: upsert reminder
 */
export async function repoUpsertReminder(
  uid: string | undefined,
  reminder: Reminder
): Promise<Reminder> {
  const mode = getDataMode();

  const list = loadReminders(uid);
  const exists = list.some((x) => x.id === reminder.id);
  const withAudit = applyAuditFields(reminder, exists);

  const idx = list.findIndex((x) => x.id === withAudit.id);
  if (idx >= 0) list[idx] = withAudit;
  else list.unshift(withAudit);

  saveReminders(uid, list);

  if (mode === "local") {
    console.debug("[remindersRepo] upsert: local mode", {
      uid,
      id: withAudit.id,
      listCount: list.length,
    });
    return withAudit;
  }

  const userKey = getFirestoreUserKey(uid);

  if (!userKey) {
    if (uid) {
      enqueueReminderUpsert(uid, withAudit);
      scheduleQueueFlush(uid);
      ensureFlushOnAuthReady(uid);

      console.debug("[remindersRepo] queued upsert (auth not ready)", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        mode,
        hasAuthUser: !!auth.currentUser,
        queued: safeQueueLen(uid),
      });
    }
    return withAudit;
  }

  try {
    await createOrReplaceReminder(userKey, withAudit);
    console.debug("[remindersRepo] firestore upsert ok", {
      uid: userKey,
      id: withAudit.id,
    });
    return withAudit;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoUpsertReminder failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    if (uid) {
      enqueueReminderUpsert(uid, withAudit);
      scheduleQueueFlush(uid);
      ensureFlushOnAuthReady(uid);
    }

    return withAudit;
  }
}

/**
 * ✅ Repo: delete reminder
 */
export async function repoDeleteReminder(
  uid: string | undefined,
  id: string
): Promise<string> {
  const mode = getDataMode();

  const list = loadReminders(uid);
  const target = list.find((r) => r.id === id) ?? null;

  const updated = list.filter((r) => r.id !== id);
  saveReminders(uid, updated);

  if (target) {
    const deleted = loadDeletedReminders(uid);
    saveDeletedReminders(uid, [
      { ...target, updatedAt: new Date().toISOString() },
      ...deleted,
    ]);
  }

  if (mode === "local") {
    console.debug("[remindersRepo] delete: local mode", { uid, id });
    return id;
  }

  const userKey = getFirestoreUserKey(uid);

  if (!userKey) {
    if (uid) {
      enqueueReminderDelete(uid, id);
      scheduleQueueFlush(uid);
      ensureFlushOnAuthReady(uid);

      console.debug("[remindersRepo] queued delete (auth not ready)", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        mode,
        hasAuthUser: !!auth.currentUser,
        queued: safeQueueLen(uid),
      });
    }
    return id;
  }

  try {
    if (target) {
      await writeDeletedReminder(userKey, {
        ...target,
        updatedAt: new Date().toISOString(),
      });
    }

    await deleteReminderById(userKey, id);
    console.debug("[remindersRepo] firestore delete ok", { uid: userKey, id });
    return id;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoDeleteReminder failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    if (uid) {
      enqueueReminderDelete(uid, id);
      scheduleQueueFlush(uid);
      ensureFlushOnAuthReady(uid);
    }

    return id;
  }
}

/* ---------------- internal sync helpers ---------------- */

type QueueUpsert = { kind: "upsert"; reminder: Reminder };
type QueueDelete = { kind: "delete"; id: string };
type QueueItem = QueueUpsert | QueueDelete;

function isQueueItem(x: unknown): x is QueueItem {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;

  if (obj.kind === "upsert") {
    return typeof obj.reminder === "object" && obj.reminder !== null;
  }

  if (obj.kind === "delete") {
    return typeof obj.id === "string" && obj.id.trim().length > 0;
  }

  return false;
}

function safeQueueLen(uid: string): number {
  try {
    const raw: unknown = readRemindersQueue(uid);
    return Array.isArray(raw) ? raw.length : 0;
  } catch {
    return 0;
  }
}

async function syncRemindersQueueToFirestore(uid: string, userKey: string) {
  const raw: unknown = readRemindersQueue(uid);
  const arr = Array.isArray(raw) ? raw : [];
  const items = arr.filter(isQueueItem);

  if (items.length === 0) {
    if (arr.length > 0) {
      console.debug("[remindersRepo] queue invalid/empty -> clearing", {
        uid,
        rawLen: arr.length,
      });
      clearRemindersQueue(uid);
    }
    return;
  }

  console.debug("[remindersRepo] flushing queue", {
    uid,
    userKey,
    items: items.length,
  });

  for (const item of items) {
    if (item.kind === "upsert") {
      await createOrReplaceReminder(userKey, normalizeReminder(item.reminder));
    } else {
      await deleteReminderById(userKey, item.id);
    }
  }

  clearRemindersQueue(uid);
}

async function syncLocalRemindersToFirestore(userKey: string, local: Reminder[]) {
  if (local.length === 0) return;

  const remote = await fetchUserReminders(userKey);
  const remoteIds = new Set(remote.map((r) => r.id));

  let pushed = 0;

  for (const r of local) {
    if (!remoteIds.has(r.id)) {
      await createOrReplaceReminder(userKey, normalizeReminder(r));
      pushed += 1;
    }
  }

  if (pushed > 0) {
    console.debug("[remindersRepo] backfill local->firestore pushed", {
      uid: userKey,
      pushed,
    });
  }
}
