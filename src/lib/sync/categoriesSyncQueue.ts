// src/lib/sync/categoriesSyncQueue.ts

import type { Category } from "@/store/features/categories/categorySlice";

type QueueItem =
  | { kind: "upsert"; category: Category }
  | { kind: "delete"; id: string };

function queueKey(uid: string) {
  return `expense-tracker:categories-sync-queue:${uid}`;
}

export function readCategoriesQueue(uid: string): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(queueKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
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
