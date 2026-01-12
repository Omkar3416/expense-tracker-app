// src/components/dashboard/DashboardTransactionsPanel.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Receipt,
  PlusCircle,
  Clock3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import { todayISO } from "@/lib/dashboard/dashboardHelpers";

type Props = {
  label: string;
  uid?: string;
  userUid?: string;
  userEmail?: string | null;

  recent: Transaction[];
  onQuickAdd: (tx: Transaction) => void;

  // ✅ keep prop (used by parent previously)
  allTransactions: Transaction[];
};

function nowTimeHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatTxDateTime(iso: string) {
  const d = new Date(iso);
  const ok = !Number.isNaN(d.getTime());
  if (!ok) return iso;

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function DashboardTransactionsPanel({
  label,
  uid,
  userUid,
  userEmail,
  recent,
  onQuickAdd,
}: Props) {
  const categories = ["Food", "Travel", "Bills", "Shopping", "Other"];

  const [quickType, setQuickType] = useState<"expense" | "income">("expense");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");
  const [quickNote, setQuickNote] = useState("");
  const [quickDate, setQuickDate] = useState(() => todayISO());
  const [quickTime, setQuickTime] = useState(() => nowTimeHHMM());

  // ✅ keep this memo to avoid changing existing data behavior elsewhere
  useMemo(() => {
    return [...recent].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [recent]);

  function submit() {
    if (!quickAmount || Number(quickAmount) <= 0) return;
    if (!quickDate) return;
    if (!quickTime) return;

    const nowIso = new Date().toISOString();
    const isoDate = new Date(`${quickDate}T${quickTime}:00`).toISOString();

    const tx: Transaction = {
      id: uuidv4(),
      amount: Number(quickAmount),
      category: quickCategory,
      note: quickNote.trim() || undefined,
      date: isoDate,
      type: quickType,

      createdAt: nowIso,
      updatedAt: null,
      createdByUid: userUid,
      createdByEmail: userEmail ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    };

    onQuickAdd(tx);

    setQuickAmount("");
    setQuickNote("");
    setQuickCategory("Food");
    setQuickDate(todayISO());
    setQuickTime(nowTimeHHMM());
  }

  return (
    <GlassPanel className="lg:col-span-2 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-2">
            <Receipt className="h-5 w-5 text-indigo-200" />
          </div>

          <div>
            <h2 className="text-lg font-semibold">Quick Transactions</h2>
            <p className="text-sm text-white/60 mt-1">
              Add expense/income quickly. Range:{" "}
              <span className="text-white/80 font-semibold">{label}</span>
            </p>
          </div>
        </div>

        <Link
          href="/transactions"
          className="text-sm font-semibold text-white/80 hover:text-white underline"
        >
          Add / View all
        </Link>
      </div>

      {/* ✅ Quick Add */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0B1220]/40 p-4 shadow-lg shadow-black/20">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-white/70" />
              Quick Add
            </p>
            <p className="text-xs text-white/60 mt-1">
              Add an expense or income without leaving dashboard.
            </p>
          </div>

          {!uid && (
            <span className="text-xs text-amber-200/90 border border-amber-300/20 bg-amber-500/10 px-3 py-1 rounded-xl">
              Login recommended (Firestore)
            </span>
          )}
        </div>

        {/* ✅ Mobile-first layout (better than 7-column stack) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {/* Amount */}
          <Input
            placeholder="Amount (₹)"
            value={quickAmount}
            onChange={(e) => setQuickAmount(e.target.value)}
            type="number"
            className="lg:col-span-1"
          />

          {/* Type */}
          <select
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition lg:col-span-1"
            value={quickType}
            onChange={(e) =>
              setQuickType(e.target.value as "expense" | "income")
            }
          >
            <option value="expense" className="bg-[#0B1220]">
              Expense
            </option>
            <option value="income" className="bg-[#0B1220]">
              Income
            </option>
          </select>

          {/* Category */}
          <select
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition lg:col-span-1"
            value={quickCategory}
            onChange={(e) => setQuickCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c} className="bg-[#0B1220]">
                {c}
              </option>
            ))}
          </select>

          {/* Note */}
          <Input
            placeholder="Note (optional)"
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            className="sm:col-span-2 lg:col-span-1"
          />

          {/* Date */}
          <input
            type="date"
            value={quickDate}
            onChange={(e) => setQuickDate(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition lg:col-span-1"
          />

          {/* Time */}
          <input
            type="time"
            value={quickTime}
            onChange={(e) => setQuickTime(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition lg:col-span-1"
          />

          {/* Button */}
          <Button onClick={submit} className="w-full lg:col-span-1">
            Add
          </Button>
        </div>

        <p className="mt-3 text-xs text-white/50">
          Saved using your selected Data mode (Auto/Firestore/Local).
        </p>
      </div>

      {/* ✅ Recent Transactions (fills the empty space nicely) */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-white/70" />
              Recent Transactions
            </p>
            <p className="text-xs text-white/60 mt-1">
              Latest {Math.min(5, recent.length)} items (from current range).
            </p>
          </div>

          <Link
            href="/transactions"
            className="text-xs font-semibold text-white/70 hover:text-white underline"
          >
            View all
          </Link>
        </div>

        <div className="px-5 pb-5">
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#0B1220]/40 p-8 text-center text-white/55">
              No transactions yet. Add your first expense/income above.
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((t) => {
                const isExpense = t.type === "expense";

                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-white/10 bg-[#0B1220]/40 p-3 flex items-start justify-between gap-4 hover:bg-white/10 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            isExpense
                              ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
                              : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
                          ].join(" ")}
                        >
                          {isExpense ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {t.type}
                        </span>

                        <p className="font-semibold truncate">{t.category}</p>
                      </div>

                      <p className="text-xs text-white/60 mt-1">
                        {formatTxDateTime(t.date)}
                      </p>

                      {t.note ? (
                        <p className="text-xs text-white/70 mt-1 break-words">
                          {t.note}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={[
                          "text-sm font-bold",
                          isExpense ? "text-rose-200" : "text-emerald-200",
                        ].join(" ")}
                      >
                        {isExpense ? "-" : "+"}₹{t.amount}
                      </p>
                      <p className="text-[11px] text-white/45 mt-1">tap to open</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ✅ NOTE:
          TransactionRangeSection removed from here intentionally.
          It will be shown at bottom of Dashboard (page.tsx).
      */}
    </GlassPanel>
  );
}

function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-[#0B1220]/50 p-6 shadow-xl shadow-black/30 backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
