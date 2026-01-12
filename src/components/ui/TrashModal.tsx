// src/components/ui/TrashModal.tsx
"use client";

import React, { useMemo } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import Button from "@/components/ui/Button";

import type { TrashItem } from "@/lib/storageTrash";
import type { Transaction } from "@/store/features/transactions/transactionSlice";
import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

export default function TrashModal({
  open,
  onClose,
  trash,
  onRestoreOne,
  onDeleteForever,
  onClearAll,
  onRestoreAll,
}: {
  open: boolean;
  onClose: () => void;
  trash: TrashItem[];
  onRestoreOne: (x: TrashItem) => void;
  onDeleteForever: (x: TrashItem) => void;
  onClearAll: () => void;
  onRestoreAll: () => void;
}) {
  const sorted = useMemo(() => {
    return [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }, [trash]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />

        <div className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">Deleted History</h3>
              <p className="text-xs text-white/60 mt-1">
                Restore deleted items or delete permanently (local only).
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
            >
              Close
            </button>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/50">
              Total deleted:{" "}
              <span className="font-semibold text-white/70">
                {sorted.length}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onClearAll}
                className="text-xs text-rose-200 hover:text-rose-100 underline"
              >
                Clear all
              </button>

              <Button onClick={onRestoreAll} className="px-4 py-2 text-sm">
                Restore All
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="mt-5 space-y-3 max-h-[60vh] overflow-auto pr-1">
            {sorted.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
                No deleted items.
              </div>
            ) : (
              sorted.map((x) => (
                <TrashCard
                  key={x.deletedAt}
                  x={x}
                  onRestore={() => onRestoreOne(x)}
                  onDeleteForever={() => onDeleteForever(x)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function TrashCard({
  x,
  onRestore,
  onDeleteForever,
}: {
  x: TrashItem;
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  const deletedLabel = new Date(x.deletedAt).toLocaleString();

  if (x.kind === "transaction") {
    const t = x.item as Transaction;
    const sign = t.type === "expense" ? "-" : "+";

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              🧾 Transaction • {t.category} • {sign}₹{formatMoney(t.amount)}
            </p>
            <p className="text-xs text-white/60 mt-1">Deleted: {deletedLabel}</p>
            <p className="text-xs text-white/50 mt-1">
              Date: {new Date(t.date).toLocaleString()}
            </p>
            {t.note ? (
              <p className="text-xs text-white/60 mt-2 break-words">
                Note: {t.note}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 flex flex-col gap-2">
            <button
              onClick={onRestore}
              className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition"
            >
              Restore
            </button>

            <button
              onClick={onDeleteForever}
              className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
            >
              Delete forever
            </button>
          </div>
        </div>
      </div>
    );
  }

  const b = x.item as Borrowing;
  const remaining = Math.max(0, b.amount - b.amountPaid);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            💸 Borrowing • {b.person} • ₹{formatMoney(b.amount)}
          </p>
          <p className="text-xs text-white/60 mt-1">Deleted: {deletedLabel}</p>
          <p className="text-xs text-white/50 mt-1">
            Due: {b.dueDate} • Remaining: ₹{formatMoney(remaining)}
          </p>
          {b.note ? (
            <p className="text-xs text-white/60 mt-2 break-words">
              Note: {b.note}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-col gap-2">
          <button
            onClick={onRestore}
            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition"
          >
            Restore
          </button>

          <button
            onClick={onDeleteForever}
            className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
          >
            Delete forever
          </button>
        </div>
      </div>
    </div>
  );
}
