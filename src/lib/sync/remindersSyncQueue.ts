// src/lib/sync/remindersSyncQueue.ts

import type { Reminder } from "@/store/features/reminders/reminderSlice";

export type ReminderQueueItem =
  | { kind: "upsert"; reminder: Reminder }
  | { kind: "delete"; id: string };

function queueKey(uid: string) {
  return `expense-tracker:reminders-sync-queue:${uid}`;
}

/**
 * ✅ INTERNAL: raw reader
 */
function readQueue(uid: string): ReminderQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(queueKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReminderQueueItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * ✅ INTERNAL: raw writer
 */
function writeQueue(uid: string, items: ReminderQueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(queueKey(uid), JSON.stringify(items));
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------- */
/* ✅ PRIMARY API (we keep BOTH naming styles to avoid breaking anything)      */
/* -------------------------------------------------------------------------- */

/**
 * ✅ Preferred plural naming (matches categoriesSyncQueue style)
 */
export function readRemindersQueue(uid: string): ReminderQueueItem[] {
  return readQueue(uid);
}

/**
 * ✅ Backward compatible singular naming (some files expect this)
 */
export function readReminderQueue(uid: string): ReminderQueueItem[] {
  return readQueue(uid);
}

export function writeRemindersQueue(uid: string, items: ReminderQueueItem[]) {
  writeQueue(uid, items);
}

export function writeReminderQueue(uid: string, items: ReminderQueueItem[]) {
  writeQueue(uid, items);
}

export function enqueueReminderUpsert(uid: string, reminder: Reminder) {
  const q = readQueue(uid);
  q.push({ kind: "upsert", reminder });
  writeQueue(uid, q);
}

export function enqueueReminderDelete(uid: string, id: string) {
  const q = readQueue(uid);
  q.push({ kind: "delete", id });
  writeQueue(uid, q);
}

/**
 * ✅ Preferred plural naming
 */
export function clearRemindersQueue(uid: string) {
  writeQueue(uid, []);
}

/**
 * ✅ Backward compatible singular naming
 */
export function clearReminderQueue(uid: string) {
  writeQueue(uid, []);
}
