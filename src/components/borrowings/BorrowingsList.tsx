// src/components/borrowings/BorrowingsList.tsx
"use client";

import { useMemo, useState } from "react";

import Input from "@/components/ui/Input";
import BorrowingRow from "@/components/borrowings/BorrowingRow";

import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";

export type BorrowingsFilterKey = "all" | "pending" | "overdue";

type TabKey = "pending" | "paid";

type Props = {
  list: Borrowing[];
  filtered: Borrowing[];

  query: string;
  setQuery: (v: string) => void;

  filter: BorrowingsFilterKey;
  setFilter: (v: BorrowingsFilterKey) => void;

  highlightId: string | null;
  itemRefs: Map<string, HTMLDivElement | null>;

  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;

  onAddPayment: (b: Borrowing) => void;
  onEdit: (b: Borrowing) => void;
  onShare: (b: Borrowing) => void;
  onTogglePaid: (b: Borrowing) => void;
  onDelete: (b: Borrowing) => void;

  timeAgo: (iso: string) => string;
};

export default function BorrowingsList({
  list,
  filtered,
  query,
  setQuery,
  filter,
  setFilter,
  highlightId,
  itemRefs,
  overdueCount,
  dueTodayCount,
  dueSoonCount,
  onAddPayment,
  onEdit,
  onShare,
  onTogglePaid,
  onDelete,
  timeAgo,
}: Props) {
  const [tab, setTab] = useState<TabKey>("pending");

  // ✅ Paid list derived from full list
  const paidList = useMemo(() => {
    return list
      .filter((b) => b.status === "paid" || b.amountPaid >= b.amount)
      .slice()
      .sort((a, b) => {
        const ad = a.paidAt ? new Date(a.paidAt).getTime() : 0;
        const bd = b.paidAt ? new Date(b.paidAt).getTime() : 0;
        return bd - ad;
      });
  }, [list]);

  // ✅ Paid filtered uses only search query (no overdue filter)
  const paidFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return paidList;

    return paidList.filter((b) => {
      return (
        b.person.toLowerCase().includes(q) ||
        (b.note?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [paidList, query]);

  const showingCount = tab === "pending" ? filtered.length : paidFiltered.length;

  const totalCount = useMemo(() => {
    if (tab === "pending") {
      return list.filter((b) => b.status === "pending").length;
    }
    return paidList.length;
  }, [tab, list, paidList]);

  return (
    <div
      id="history"
      className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20"
    >
      {/* Header + Tabs */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Reminders & History</h2>
          <p className="text-sm text-white/60 mt-1">
            Search and filter your borrowings.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-white/50">
            Showing{" "}
            <span className="font-semibold text-white/70">{showingCount}</span>{" "}
            of <span className="font-semibold text-white/70">{totalCount}</span>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setTab("pending")}
              className={[
                "px-4 py-1.5 text-xs font-semibold rounded-xl transition",
                tab === "pending"
                  ? "bg-indigo-500/25 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              Pending
            </button>

            <button
              onClick={() => setTab("paid")}
              className={[
                "px-4 py-1.5 text-xs font-semibold rounded-xl transition",
                tab === "paid"
                  ? "bg-emerald-500/25 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              Paid
            </button>
          </div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="mt-4 flex flex-col md:flex-row gap-3">
        <Input
          placeholder="Search by person or note..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Filter only matters for Pending Tab */}
        {tab === "pending" ? (
          <select
            className="w-full md:w-56 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
            value={filter}
            onChange={(e) => setFilter(e.target.value as BorrowingsFilterKey)}
          >
            <option value="all" className="bg-[#0B1220]">
              All
            </option>
            <option value="pending" className="bg-[#0B1220]">
              Pending
            </option>
            <option value="overdue" className="bg-[#0B1220]">
              Overdue
            </option>
          </select>
        ) : (
          <div className="w-full md:w-56 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 flex items-center justify-center">
            Paid list (no overdue filter)
          </div>
        )}
      </div>

      {/* List */}
      <div className="mt-6 space-y-3">
        {tab === "pending" ? (
          filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
              No results found.
            </div>
          ) : (
            filtered.map((b) => (
              <BorrowingRow
                key={b.id}
                b={b}
                highlightId={highlightId}
                itemRefs={itemRefs}
                onAddPayment={onAddPayment}
                onEdit={onEdit}
                onShare={onShare}
                onTogglePaid={onTogglePaid}
                onDelete={onDelete}
                timeAgo={timeAgo}
              />
            ))
          )
        ) : paidFiltered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
            No paid transactions found.
          </div>
        ) : (
          paidFiltered.map((b) => (
            <BorrowingRow
              key={b.id}
              b={b}
              highlightId={highlightId}
              itemRefs={itemRefs}
              onAddPayment={onAddPayment}
              onEdit={onEdit}
              onShare={onShare}
              onTogglePaid={onTogglePaid}
              onDelete={onDelete}
              timeAgo={timeAgo}
            />
          ))
        )}
      </div>

      {/* Mini Stats (only meaningful for pending tab) */}
      {tab === "pending" && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <MiniStat label="Overdue" value={String(overdueCount)} />
          <MiniStat label="Today" value={String(dueTodayCount)} />
          <MiniStat label="Soon" value={String(dueSoonCount)} />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
      <p className="text-xs text-white/60">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
