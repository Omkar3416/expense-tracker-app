// src/lib/sync/txSyncQueue.ts

import type { Transaction } from "@/store/features/transactions/transactionSlice";

export type TxQueueItem =
  | { kind: "upsert"; tx: Transaction }
  | { kind: "delete"; id: string };

function queueKey(uid: string) {
  return `expense-tracker:tx-sync-queue:${uid}`;
}

function isTxQueueItem(x: unknown): x is TxQueueItem {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;

  if (obj.kind === "upsert") {
    return typeof obj.tx === "object" && obj.tx !== null;
  }

  if (obj.kind === "delete") {
    return typeof obj.id === "string" && obj.id.trim().length > 0;
  }

  return false;
}

export function readTxQueue(uid: string): TxQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(queueKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTxQueueItem);
  } catch {
    return [];
  }
}

export function writeTxQueue(uid: string, items: TxQueueItem[]) {
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
