// src/components/transactions/TransactionRow.tsx
"use client";

import React from "react";
import type { Transaction } from "@/store/features/transactions/transactionSlice";

function formatTxDateTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Invalid date";

  // Example: 06 Jan 2026 • 1:17 PM
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${datePart} • ${timePart}`;
}

export default function TransactionRow({
  t,
  isHighlighted,
  itemRefs,
  onEdit,
  onShare,
  onDelete,
  timeAgo,
  formatMoney,
  hideCategory = false,
  titleMode = "category",
}: {
  t: Transaction;
  isHighlighted: boolean;
  itemRefs: Map<string, HTMLDivElement | null>;
  onEdit: (t: Transaction) => void;
  onShare: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  timeAgo: (iso: string) => string;
  formatMoney: (n: number) => string;
  hideCategory?: boolean;
  titleMode?: "category" | "note";
}) {
  const createdAgo = timeAgo(t.createdAt);
  const editedAgo = t.updatedAt ? timeAgo(t.updatedAt) : null;

  const editedByLabel =
    t.updatedAt && (t.updatedByEmail || t.updatedByUid)
      ? ` by ${t.updatedByEmail ?? t.updatedByUid ?? ""}`
      : "";

  return (
    <div
      ref={(el) => {
        itemRefs.set(t.id, el);
      }}
      className={[
        "rounded-2xl border bg-white/5 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-all duration-300",
        "border-white/10",
        isHighlighted
          ? "ring-2 ring-indigo-400/70 shadow-2xl shadow-indigo-500/20 bg-indigo-500/10 scale-[1.01]"
          : "hover:bg-white/10",
      ].join(" ")}
    >
      <div className="min-w-0">
        {!(hideCategory && titleMode === "category") && (
          <p className="font-semibold truncate">
            {titleMode === "note" ? t.note?.trim() || "(no note)" : t.category}
          </p>
        )}

        {/* ✅ Updated format: 06 Jan 2026 • 1:17 PM */}
        <p className="text-xs text-white/60">
          Transaction: {formatTxDateTime(t.date)}
        </p>

        <p className="text-[11px] text-white/40 mt-1">
          Created {createdAgo}
          {editedAgo ? (
            <>
              {" "}
              • Edited {editedAgo}
              {editedByLabel}
            </>
          ) : null}
        </p>
        {titleMode !== "note" && t.note && (
          <p className="text-sm text-white/70 mt-1 break-words">{t.note}</p>
        )}
      </div>

      <div className="text-right shrink-0">
        <p
          className={[
            "text-lg font-bold",
            t.type === "expense" ? "text-rose-200" : "text-emerald-200",
          ].join(" ")}
        >
          {t.type === "expense" ? "-" : "+"}₹{formatMoney(t.amount)}
        </p>

        <p className="text-xs text-white/50 mt-1">{t.type}</p>

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => onEdit(t)}
            className="text-xs text-indigo-200 hover:text-indigo-100 underline"
          >
            Edit
          </button>

          <button
            onClick={() => onShare(t)}
            className="text-xs text-emerald-200 hover:text-emerald-100 underline"
          >
            Share
          </button>

          <button
            onClick={() => onDelete(t)}
            className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 hover:border-rose-400/30 transition"
          >
            🗑 Delete
          </button>
        </div>
      </div>
    </div>
  );
}
