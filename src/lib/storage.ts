// src/lib/storage.ts

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";

// ✅ NEW (Categories + Reminders)
import type { Category } from "@/store/features/categories/categorySlice";
import type { Reminder } from "@/store/features/reminders/reminderSlice";

// ✅ per-user cache keys (fallback to guest)
function txKey(uid?: string) {
  return `expense-tracker:transactions:${uid || "guest"}`;
}

function borrowKey(uid?: string) {
  return `expense-tracker:borrowings:${uid || "guest"}`;
}

// ✅ NEW: Categories & Reminders keys
function categoriesKey(uid?: string) {
  return `expense-tracker:categories:${uid || "guest"}`;
}

function remindersKey(uid?: string) {
  return `expense-tracker:reminders:${uid || "guest"}`;
}

// ✅ NEW: deleted history keys
function deletedTxKey(uid?: string) {
  return `expense-tracker:deleted-transactions:${uid || "guest"}`;
}

function deletedBorrowKey(uid?: string) {
  return `expense-tracker:deleted-borrowings:${uid || "guest"}`;
}

/* ---------------- Transactions ---------------- */

export function loadTransactions(uid?: string): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(txKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
}

export function saveTransactions(uid: string | undefined, list: Transaction[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(txKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * ✅ NEW: Deleted Transactions (Trash)
 */
export function loadDeletedTransactions(uid?: string): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(deletedTxKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
}

export function saveDeletedTransactions(
  uid: string | undefined,
  list: Transaction[]
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(deletedTxKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function clearDeletedTransactions(uid?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(deletedTxKey(uid));
  } catch {
    // ignore
  }
}

/**
 * ✅ NEW: Migrate guest transactions to logged-in user.
 * This is WHY old local data never reached Firestore.
 */
export function migrateGuestTransactionsToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadTransactions("guest");
    if (guest.length === 0) return;

    const userList = loadTransactions(uid);
    const userIds = new Set(userList.map((t) => t.id));

    // ✅ merge (guest first, then user)
    const merged = [...guest.filter((t) => !userIds.has(t.id)), ...userList];

    saveTransactions(uid, merged);

    // ✅ clear guest so it doesn't re-migrate
    localStorage.removeItem(txKey("guest"));
  } catch {
    // ignore
  }
}

// ✅ NEW: migrate deleted tx history too
export function migrateGuestDeletedTransactionsToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadDeletedTransactions("guest");
    if (guest.length === 0) return;

    const userList = loadDeletedTransactions(uid);
    const userIds = new Set(userList.map((t) => t.id));

    const merged = [...guest.filter((t) => !userIds.has(t.id)), ...userList];

    saveDeletedTransactions(uid, merged);

    localStorage.removeItem(deletedTxKey("guest"));
  } catch {
    // ignore
  }
}

/* ---------------- Borrowings ---------------- */

export function loadBorrowings(uid?: string): Borrowing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(borrowKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Borrowing[]) : [];
  } catch {
    return [];
  }
}

export function saveBorrowings(uid: string | undefined, list: Borrowing[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(borrowKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * ✅ NEW: Deleted Borrowings (Trash)
 */
export function loadDeletedBorrowings(uid?: string): Borrowing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(deletedBorrowKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Borrowing[]) : [];
  } catch {
    return [];
  }
}

export function saveDeletedBorrowings(
  uid: string | undefined,
  list: Borrowing[]
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(deletedBorrowKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function clearDeletedBorrowings(uid?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(deletedBorrowKey(uid));
  } catch {
    // ignore
  }
}

/**
 * ✅ NEW: Migrate guest borrowings to logged-in user.
 */
export function migrateGuestBorrowingsToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadBorrowings("guest");
    if (guest.length === 0) return;

    const userList = loadBorrowings(uid);
    const userIds = new Set(userList.map((b) => b.id));

    const merged = [...guest.filter((b) => !userIds.has(b.id)), ...userList];

    saveBorrowings(uid, merged);

    // ✅ clear guest borrowings
    localStorage.removeItem(borrowKey("guest"));
  } catch {
    // ignore
  }
}

// ✅ NEW: migrate deleted borrow history too
export function migrateGuestDeletedBorrowingsToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadDeletedBorrowings("guest");
    if (guest.length === 0) return;

    const userList = loadDeletedBorrowings(uid);
    const userIds = new Set(userList.map((b) => b.id));

    const merged = [...guest.filter((b) => !userIds.has(b.id)), ...userList];

    saveDeletedBorrowings(uid, merged);

    localStorage.removeItem(deletedBorrowKey("guest"));
  } catch {
    // ignore
  }
}

/* ---------------- Categories ---------------- */

export function loadCategories(uid?: string): Category[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(categoriesKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Category[]) : [];
  } catch {
    return [];
  }
}

export function saveCategories(uid: string | undefined, list: Category[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(categoriesKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * ✅ NEW: Migrate guest categories to logged-in user.
 */
export function migrateGuestCategoriesToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadCategories("guest");
    if (guest.length === 0) return;

    const userList = loadCategories(uid);
    const userIds = new Set(userList.map((c) => c.id));

    const merged = [...guest.filter((c) => !userIds.has(c.id)), ...userList];

    saveCategories(uid, merged);

    localStorage.removeItem(categoriesKey("guest"));
  } catch {
    // ignore
  }
}

/* ---------------- Reminders ---------------- */

export function loadReminders(uid?: string): Reminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(remindersKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Reminder[]) : [];
  } catch {
    return [];
  }
}

export function saveReminders(uid: string | undefined, list: Reminder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(remindersKey(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * ✅ NEW: Migrate guest reminders to logged-in user.
 */
export function migrateGuestRemindersToUser(uid: string) {
  if (typeof window === "undefined") return;

  try {
    const guest = loadReminders("guest");
    if (guest.length === 0) return;

    const userList = loadReminders(uid);
    const userIds = new Set(userList.map((r) => r.id));

    const merged = [...guest.filter((r) => !userIds.has(r.id)), ...userList];

    saveReminders(uid, merged);

    localStorage.removeItem(remindersKey("guest"));
  } catch {
    // ignore
  }
}
