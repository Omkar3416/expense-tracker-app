// src/lib/sync/categoriesSyncQueue.ts

import type { Category } from "@/store/features/categories/categorySlice";

type QueueUpsert = { kind: "upsert"; category: Category };
type QueueDelete = { kind: "delete"; id: string };
type QueueItem = QueueUpsert | QueueDelete;

function queueKey(uid: string) {
  return `expense-tracker:categories-sync-queue:${uid}`;
}

function isQueueItem(x: unknown): x is QueueItem {
  if (typeof x !== "object" || x === null) return false;

  const obj = x as Record<string, unknown>;
  const kind = obj.kind;

  if (kind === "upsert") {
    return typeof obj.category === "object" && obj.category !== null;
  }

  if (kind === "delete") {
    return typeof obj.id === "string" && obj.id.trim().length > 0;
  }

  return false;
}

export function readCategoriesQueue(uid: string): QueueItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(queueKey(uid));
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isQueueItem);
  } catch {
    return [];
  }
}

export function writeCategoriesQueue(uid: string, items: QueueItem[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(queueKey(uid), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function enqueueCategoryUpsert(uid: string, category: Category) {
  const q = readCategoriesQueue(uid);
  q.push({ kind: "upsert", category });
  writeCategoriesQueue(uid, q);
}

export function enqueueCategoryDelete(uid: string, id: string) {
  const q = readCategoriesQueue(uid);
  q.push({ kind: "delete", id });
  writeCategoriesQueue(uid, q);
}

export function clearCategoriesQueue(uid: string) {
  writeCategoriesQueue(uid, []);
}
