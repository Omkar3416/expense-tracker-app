// src/lib/storageReminders.ts

import type { Reminder } from "@/store/features/reminders/reminderSlice";

/**
 * Reminders local storage (offline-first)
 * - Per user (uid) OR guest fallback
 * - Mirrors the same pattern as transactions/borrowings
 */

function reminderKey(uid?: string) {
  return `expense-tracker:reminders:${uid || "guest"}`;
}

function deletedReminderKey(uid?: string) {
  return `expense-tracker:deleted-reminders:${uid || "guest"}`;
}

/* ---------------- Helpers ---------------- */

function safeParseList<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/* ---------------- Reminders ---------------- */

export function loadReminders(uid?: string): Reminder[] {
  if (typeof window === "undefined") return [];
  return safeParseList<Reminder>(localStorage.getItem(reminderKey(uid)));
}

export function saveReminders(uid: string | undefined, list: Reminder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(reminderKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

/* ---------------- Deleted Reminders (Local Trash History) ---------------- */

export function loadDeletedReminders(uid?: string): Reminder[] {
  if (typeof window === "undefined") return [];
  return safeParseList<Reminder>(localStorage.getItem(deletedReminderKey(uid)));
}

export function saveDeletedReminders(uid: string | undefined, list: Reminder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(deletedReminderKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function clearDeletedReminders(uid?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(deletedReminderKey(uid));
  } catch {
    // ignore
  }
}

/* ---------------- Migration helpers (guest -> user) ---------------- */

export function migrateGuestRemindersToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadReminders("guest");
    if (guest.length === 0) return;

    const userList = loadReminders(uid);
    const userIds = new Set(userList.map((r) => r.id));

    const merged = [...guest.filter((r) => !userIds.has(r.id)), ...userList];

    saveReminders(uid, merged);
    localStorage.removeItem(reminderKey("guest"));
  } catch {
    // ignore
  }
}

export function migrateGuestDeletedRemindersToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadDeletedReminders("guest");
    if (guest.length === 0) return;

    const userList = loadDeletedReminders(uid);
    const userIds = new Set(userList.map((r) => r.id));

    const merged = [...guest.filter((r) => !userIds.has(r.id)), ...userList];

    saveDeletedReminders(uid, merged);
    localStorage.removeItem(deletedReminderKey("guest"));
  } catch {
    // ignore
  }
}
