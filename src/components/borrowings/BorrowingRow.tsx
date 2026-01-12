// src/components/borrowings/BorrowingRow.tsx
"use client";

import React, { useMemo } from "react";

import Badge from "@/components/borrowings/Badge";

import type {
  Borrowing,
  BorrowingCategory,
  BorrowingPayment,
} from "@/store/features/borrowings/borrowingSlice";

import {
  badgeKind,
  badgeText,
  calcRemaining,
  formatMoney,
  formatPaymentDate,
  getFullyPaidDate,
} from "@/lib/borrowings/borrowingsHelpers";

export default function BorrowingRow({
  b,
  highlightId,
  itemRefs,
  onAddPayment,
  onEdit,
  onShare,
  onTogglePaid,
  onDelete,
  timeAgo,
}: {
  b: Borrowing;
  highlightId: string | null;
  itemRefs: Map<string, HTMLDivElement | null>;
  onAddPayment: (b: Borrowing) => void;
  onEdit: (b: Borrowing) => void;
  onShare: (b: Borrowing) => void;
  onTogglePaid: (b: Borrowing) => void;
  onDelete: (b: Borrowing) => void;
  timeAgo: (iso: string) => string;
}) {
  const remaining = calcRemaining(b);

  const createdAgo = timeAgo(b.createdAt);
  const editedAgo = b.updatedAt ? timeAgo(b.updatedAt) : null;

  const editedByLabel =
    b.updatedAt && (b.updatedByEmail || b.updatedByUid)
      ? ` by ${b.updatedByEmail ?? b.updatedByUid ?? ""}`
      : "";

  const isHighlighted = highlightId === b.id;

  const paymentsSorted = useMemo(() => {
    const payments = Array.isArray(b.payments) ? b.payments : [];
    return payments.slice().sort((a, b) => a.date.localeCompare(b.date));
  }, [b.payments]);

  const fullyPaidDate = useMemo(() => getFullyPaidDate(b), [b]);

  return (
    <div
      ref={(el) => {
        itemRefs.set(b.id, el);
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold truncate">{b.person}</p>

          <Badge kind={badgeKind(b.dueDate, b.status)}>
            {badgeText(b.dueDate, b.status)}
          </Badge>

          <Badge kind="ok">
            {(b.category as BorrowingCategory).toUpperCase()}
          </Badge>

          <Badge kind={b.status === "paid" ? "paid" : "ok"}>
            {b.status.toUpperCase()}
          </Badge>

          <span className="text-xs text-white/50">Due: {b.dueDate}</span>
        </div>

        <p className="text-sm text-white/70 mt-1">
          {b.type === "borrowed"
            ? "You borrowed money (you need to pay)."
            : "You lent money (they need to pay)."}
        </p>

        {b.note && (
          <p className="text-sm text-white/60 mt-1 break-words">{b.note}</p>
        )}

        {/* ✅ Payments block */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">
            Need to Pay:{" "}
            <span className="text-white/90 font-semibold">
              ₹{formatMoney(b.amount)}
            </span>
          </p>

          <p className="text-xs text-white/60 mt-1">
            Remaining:{" "}
            <span className="text-white/90 font-semibold">
              ₹{formatMoney(remaining)}
            </span>
          </p>

          {paymentsSorted.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-white/60">Payments:</p>

              <div className="mt-1 space-y-1">
                {paymentsSorted.map((p: BorrowingPayment, idx: number) => (
                  <p key={`${p.date}-${idx}`} className="text-xs text-white/80">
                    ✅ ₹{formatMoney(p.amount)} on {formatPaymentDate(p.date)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {fullyPaidDate && (
            <p className="text-xs text-emerald-200 mt-2">
              ✅ Fully Paid on: {formatPaymentDate(fullyPaidDate)}
            </p>
          )}
        </div>

        <p className="text-[11px] text-white/40 mt-2">
          Created {createdAgo}
          {editedAgo ? (
            <>
              {" "}
              • Edited {editedAgo}
              {editedByLabel}
            </>
          ) : null}
        </p>

        {b.status === "paid" && b.paidAt && (
          <p className="text-xs text-emerald-200 mt-2">
            ✅ Paid on: {new Date(b.paidAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="text-right shrink-0">
        <p
          className={[
            "text-lg font-bold",
            b.type === "borrowed" ? "text-rose-200" : "text-emerald-200",
          ].join(" ")}
        >
          ₹{formatMoney(b.amount)}
        </p>

        <p className="text-xs text-white/60 mt-1">
          Paid: ₹{formatMoney(b.amountPaid)} • Remaining: ₹
          {formatMoney(remaining)}
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
          {b.status !== "paid" && remaining > 0 && (
            <button
              onClick={() => onAddPayment(b)}
              className="text-xs text-indigo-200 hover:text-indigo-100 underline"
            >
              Add Payment
            </button>
          )}

          <button
            onClick={() => onEdit(b)}
            className="text-xs text-indigo-200 hover:text-indigo-100 underline"
          >
            Edit
          </button>

          <button
            onClick={() => onShare(b)}
            className="text-xs text-emerald-200 hover:text-emerald-100 underline"
          >
            Share
          </button>

          <button
            onClick={() => onTogglePaid(b)}
            className="text-xs text-white/80 hover:text-white underline"
          >
            {b.status === "pending" ? "Mark Paid" : "Mark Pending"}
          </button>

          <button
            onClick={() => onDelete(b)}
            className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 hover:border-rose-400/30 transition"
          >
            🗑 Delete
          </button>
        </div>
      </div>
    </div>
  );
}
