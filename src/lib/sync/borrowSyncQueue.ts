// src/lib/sync/borrowSyncQueue.ts

import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";

type QueueItem =
  | { kind: "upsert"; borrowing: Borrowing }
  | { kind: "delete"; id: string };

function queueKey(uid: string) {
  return `expense-tracker:borrow-sync-queue:${uid}`;
}

export function readBorrowQueue(uid: string): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(queueKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeBorrowQueue(uid: string, items: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(queueKey(uid), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function enqueueBorrowUpsert(uid: string, borrowing: Borrowing) {
  const q = readBorrowQueue(uid);
  q.push({ kind: "upsert", borrowing });
  writeBorrowQueue(uid, q);
}

export function enqueueBorrowDelete(uid: string, id: string) {
  const q = readBorrowQueue(uid);
  q.push({ kind: "delete", id });
  writeBorrowQueue(uid, q);
}

export function clearBorrowQueue(uid: string) {
  writeBorrowQueue(uid, []);
}
