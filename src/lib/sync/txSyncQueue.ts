// src/lib/sync/txSyncQueue.ts

import type { Transaction } from "@/store/features/transactions/transactionSlice";

type QueueItem =
  | { kind: "upsert"; tx: Transaction }
  | { kind: "delete"; id: string };

function queueKey(uid: string) {
  return `expense-tracker:tx-sync-queue:${uid}`;
}

export function readTxQueue(uid: string): QueueItem[] {
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

export function writeTxQueue(uid: string, items: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(queueKey(uid), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function enqueueTxUpsert(uid: string, tx: Transaction) {
  const q = readTxQueue(uid);
  q.push({ kind: "upsert", tx });
  writeTxQueue(uid, q);
}

export function enqueueTxDelete(uid: string, id: string) {
  const q = readTxQueue(uid);
  q.push({ kind: "delete", id });
  writeTxQueue(uid, q);
}

export function clearTxQueue(uid: string) {
  writeTxQueue(uid, []);
}
