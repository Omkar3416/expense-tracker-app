// src/lib/repository/remindersRepo.ts

import type { Reminder } from "@/store/features/reminders/reminderSlice";
import { getDataMode } from "@/lib/dataMode";
import { auth } from "@/lib/firebaseClient";

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

/**
 * ✅ This repo is LOCAL-FIRST (just like transactionsRepo.ts)
 * - If DataMode = local: only local storage
 * - If user not logged in: local storage
 * - If user logged in: still local, but queue is built for later Firestore sync
 *
 * We are NOT integrating Firestore yet because:
 * - reminders need rules + email-based userKey logic + collections
 * - you want "no breaking changes"
 *
 * ✅ So we build it stable now, and later enable Firestore sync safely.
 */

function getEditorIdentity() {
  const u = auth.currentUser;
  return {
    uid: u?.uid,
    email: u?.email ?? null,
  };
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
    typeof r.dueDate === "string" && r.dueDate.trim().length > 0
      ? r.dueDate
      : now;

  const nextTriggerDate =
    typeof r.nextTriggerDate === "string" &&
    r.nextTriggerDate.trim().length > 0
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

  // ✅ migrate guest -> user
  if (uid) {
    try {
      migrateGuestRemindersToUser(uid);
      migrateGuestDeletedRemindersToUser(uid);
    } catch {
      // ignore
    }
  }

  const local = loadReminders(uid);

  // ✅ Local mode always returns local
  if (mode === "local") return local.map(normalizeReminder);

  // ✅ Firestore mode or auto mode:
  // currently we still return local because reminders Firestore is not wired yet.
  // But we keep queue so future sync works seamlessly.
  return local.map(normalizeReminder);
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

  if (mode === "local") return withAudit;

  // ✅ if user is logged in, queue it (future Firestore sync)
  if (uid) enqueueReminderUpsert(uid, withAudit);

  return withAudit;
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

  // remove from reminders list
  const updated = list.filter((r) => r.id !== id);
  saveReminders(uid, updated);

  // add to deleted reminder history (local only)
  if (target) {
    const deleted = loadDeletedReminders(uid);
    saveDeletedReminders(uid, [
      { ...target, updatedAt: new Date().toISOString() },
      ...deleted,
    ]);
  }

  if (mode === "local") return id;

  if (uid) enqueueReminderDelete(uid, id);

  return id;
}

/* ---------------- Internal helpers for future sync ---------------- */

/**
 * ✅ We keep this ready — later when we create Firestore reminders collection,
 * this will work just like txSyncQueueToFirestore().
 */
export async function syncRemindersQueueForUser(uid: string) {
  const q = readRemindersQueue(uid);
  if (q.length === 0) return;

  // ✅ Currently no remote integration.
  // This just clears the queue safely.
  clearRemindersQueue(uid);
}
