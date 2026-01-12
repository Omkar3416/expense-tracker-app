// src/lib/storageTrash.ts

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";

/**
 * Trash is LOCAL only.
 * - It is per-user, using uid or guest fallback.
 * - It stores deleted items so user can restore them later.
 */

export type TrashKind = "transaction" | "borrowing";

export type TrashItem =
  | { kind: "transaction"; deletedAt: string; item: Transaction }
  | { kind: "borrowing"; deletedAt: string; item: Borrowing };

function key(uid?: string) {
  return `expense-tracker:trash:${uid || "guest"}`;
}

function safeParse(raw: string | null): TrashItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TrashItem[]) : [];
  } catch {
    return [];
  }
}

export function loadTrash(uid?: string): TrashItem[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(key(uid)));
}

export function saveTrash(uid: string | undefined, list: TrashItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(uid), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function addTrashItem(uid: string | undefined, entry: TrashItem) {
  const list = loadTrash(uid);

  // ✅ keep most recent first
  const updated = [entry, ...list];

  // ✅ safety limit (avoid huge localStorage)
  saveTrash(uid, updated.slice(0, 200));
}

export function removeTrashItem(uid: string | undefined, deletedAt: string) {
  const list = loadTrash(uid);
  saveTrash(
    uid,
    list.filter((x) => x.deletedAt !== deletedAt)
  );
}

export function clearTrash(uid: string | undefined) {
  saveTrash(uid, []);
}

/**
 * ✅ Auto-delete trash older than N days.
 */
export function cleanupTrash(uid: string | undefined, maxDays = 90) {
  const list = loadTrash(uid);
  if (list.length === 0) return [];

  const now = Date.now();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

  const cleaned = list.filter((x) => {
    const ts = new Date(x.deletedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return now - ts <= maxAgeMs;
  });

  if (cleaned.length !== list.length) saveTrash(uid, cleaned);
  return cleaned;
}
// ✅ Restore helpers
export function getTrashByKind(uid: string | undefined, kind: TrashKind) {
  return loadTrash(uid).filter((x) => x.kind === kind);
}

export function removeTrashByKind(uid: string | undefined, kind: TrashKind) {
  const all = loadTrash(uid);
  const filtered = all.filter((x) => x.kind !== kind);
  saveTrash(uid, filtered);
}

export function clearOldTrash(uid: string | undefined, days = 90) {
  const all = loadTrash(uid);

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const filtered = all.filter((x) => {
    const t = new Date(x.deletedAt).getTime();
    if (!Number.isFinite(t)) return false;
    return t >= cutoff;
  });

  saveTrash(uid, filtered);
}
