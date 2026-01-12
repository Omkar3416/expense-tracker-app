"use client";

import React, { useMemo, useState } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import { saveTrash } from "@/lib/storageTrash";

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";

import {
  clearTrash,
  removeTrashItem,
  type TrashItem,
  type TrashKind,
  clearOldTrash,
} from "@/lib/storageTrash";

type Props = {
  uid: string | undefined;
  open: boolean;
  onClose: () => void;
  trash: TrashItem[];
  refreshTrash: () => void;

  // ✅ restore callbacks provided by each page (repo actions)
  onRestoreTransaction: (t: Transaction) => void;
  onRestoreBorrowing: (b: Borrowing) => void;

  // optional formatters
  formatMoney: (n: number) => string;
};

export default function TrashUnifiedModal({
  uid,
  open,
  onClose,
  trash,
  refreshTrash,
  onRestoreTransaction,
  onRestoreBorrowing,
  formatMoney,
}: Props) {
  const [tab, setTab] = useState<TrashKind | "all">("all");

  const txTrash = useMemo(
    () => trash.filter((x) => x.kind === "transaction"),
    [trash]
  );

  const borrowingTrash = useMemo(
    () => trash.filter((x) => x.kind === "borrowing"),
    [trash]
  );

  const visibleTrash = useMemo(() => {
    if (tab === "all") return trash;
    return trash.filter((x) => x.kind === tab);
  }, [trash, tab]);

  const totalCount = trash.length;

  function restoreOne(x: TrashItem) {
    if (x.kind === "transaction") {
      onRestoreTransaction(x.item as Transaction);
      
    } else {
      onRestoreBorrowing(x.item as Borrowing);
    }

    removeTrashItem(uid, x.deletedAt);
    refreshTrash();
    window.dispatchEvent(new Event("trash:restored"));

  }

  function deleteForever(x: TrashItem) {
    removeTrashItem(uid, x.deletedAt);
    refreshTrash();
  }

  function restoreAllCurrentTab() {
    const items = visibleTrash;

    if (items.length === 0) return;

    for (const x of items) {
      if (x.kind === "transaction") {
        onRestoreTransaction(x.item as Transaction);
      } else {
        onRestoreBorrowing(x.item as Borrowing);
      }
    }

    // remove restored items from local trash
    const restoredKeys = new Set(items.map((x) => x.deletedAt));
    const remain = trash.filter((x) => !restoredKeys.has(x.deletedAt));

    // update storage
    try {
     saveTrash(uid, remain);

    } catch {
      // ignore
    }

    refreshTrash();
    window.dispatchEvent(new Event("trash:restored"));
    onClose();
  }

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
                Restore deleted items or delete permanently.
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
            >
              Close
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <TabButton
              active={tab === "all"}
              label={`All (${totalCount})`}
              onClick={() => setTab("all")}
            />
            <TabButton
              active={tab === "transaction"}
              label={`Transactions (${txTrash.length})`}
              onClick={() => setTab("transaction")}
            />
            <TabButton
              active={tab === "borrowing"}
              label={`Borrowings (${borrowingTrash.length})`}
              onClick={() => setTab("borrowing")}
            />
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/50">
              Showing{" "}
              <span className="font-semibold text-white/70">
                {visibleTrash.length}
              </span>{" "}
              deleted item(s)
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {/* ✅ Auto-clean old trash safely */}
              <button
                onClick={() => {
                  clearOldTrash(uid, 90);
                  refreshTrash();
                }}
                className="text-xs text-white/60 hover:text-white underline"
                title="Remove items older than 90 days"
              >
                Clean 90+ days
              </button>

              {/* ✅ Restore All */}
              <button
                onClick={restoreAllCurrentTab}
                disabled={visibleTrash.length === 0}
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  visibleTrash.length === 0
                    ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
                ].join(" ")}
              >
                ✅ Restore All
              </button>

              {/* Clear all */}
              <button
                onClick={() => {
                  clearTrash(uid);
                  refreshTrash();
                }}
                className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
              >
                🗑 Clear All
              </button>
            </div>
          </div>

          {/* List */}
          <div className="mt-5 space-y-3 max-h-[60vh] overflow-auto pr-1">
            {visibleTrash.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
                No deleted items.
              </div>
            ) : (
              visibleTrash.map((x) => (
                <TrashCard
                  key={x.deletedAt}
                  x={x}
                  formatMoney={formatMoney}
                  onRestore={() => restoreOne(x)}
                  onDeleteForever={() => deleteForever(x)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ---------------- UI bits ---------------- */

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-xs font-semibold transition",
        active
          ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-200"
          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TrashCard({
  x,
  formatMoney,
  onRestore,
  onDeleteForever,
}: {
  x: TrashItem;
  formatMoney: (n: number) => string;
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  const deletedAt = new Date(x.deletedAt).toLocaleString();

  if (x.kind === "transaction") {
    const t = x.item as Transaction;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              🧾 Transaction • {t.category} • ₹{formatMoney(t.amount)} •{" "}
              {t.type.toUpperCase()}
            </p>

            <p className="text-xs text-white/60 mt-1">Deleted: {deletedAt}</p>

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
            🤝 Borrowing • {b.person} • ₹{formatMoney(b.amount)} •{" "}
            {b.type.toUpperCase()}
          </p>

          <p className="text-xs text-white/60 mt-1">Deleted: {deletedAt}</p>

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
