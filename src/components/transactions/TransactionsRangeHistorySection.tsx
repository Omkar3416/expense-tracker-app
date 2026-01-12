// src/components/transactions/TransactionsRangeHistorySection.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import TransactionRow from "@/components/transactions/TransactionRow";

import { useAppSelector } from "@/store/hooks";
import type { RootState } from "@/store/store";

import type { Transaction } from "@/store/features/transactions/transactionSlice";

type TxTypeFilter = "all" | "expense" | "income";

type Props = {
  transactions: Transaction[];

  // same helpers as existing history section
  monthName: (mm: string) => string;
  formatMoney: (n: number) => string;
  timeAgo: (iso: string) => string;

  // handlers from Transactions page
  itemRefs: Map<string, HTMLDivElement | null>;
  highlightId: string | null;

  onEdit: (t: Transaction) => void;
  onShare: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
};

function normalizeName(s: string) {
  return s.trim().toLowerCase();
}

type CategoryGroup = {
  category: string;
  normalized: string;
  items: Transaction[];
  expenseTotal: number;
  latestDateISO: string;
};

export default function TransactionsRangeHistorySection({
  transactions,
  monthName,
  formatMoney,
  timeAgo,
  itemRefs,
  highlightId,
  onEdit,
  onShare,
  onDelete,
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ✅ stable expand state
  const [openYears, setOpenYears] = useState<Record<string, boolean>>(() => ({
    [String(currentYear)]: true,
  }));

  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>(() => ({}));

  const [openCategoryGroups, setOpenCategoryGroups] = useState<Record<string, boolean>>(
    () => ({})
  );

  // ✅ quick categories from redux (same source as dashboard quick categories)
  const categories = useAppSelector((s: RootState) => s.categories.list);

  const quickCategoryNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) {
      if (c.type !== "transaction") continue;
      set.add(normalizeName(c.name));
    }
    return set;
  }, [categories]);

  // ✅ group by year/month
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Transaction[]>> = {};

    for (const t of transactions) {
      const d = new Date(t.date);
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, "0");

      map[y] ??= {};
      map[y][m] ??= [];
      map[y][m].push(t);
    }

    // ✅ Sort each month tx by date desc
    for (const y of Object.keys(map)) {
      for (const m of Object.keys(map[y])) {
        map[y][m] = [...map[y][m]].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      }
    }

    return map;
  }, [transactions]);

  const orderedYears = useMemo(() => {
    const set = new Set<number>();
    for (const t of transactions) {
      const y = new Date(t.date).getFullYear();
      if (!Number.isFinite(y)) continue;
      set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  useEffect(() => {
  if (!highlightId) return;

  const t = transactions.find((x) => x.id === highlightId);
  if (!t) return;

  const d = new Date(t.date);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");

  const monthKey = `${y}-${m}`;

  // ✅ open the correct year + month
  setOpenYears((p) => ({ ...p, [y]: true }));
  setOpenMonths((p) => ({ ...p, [monthKey]: true }));

  // ✅ if this transaction belongs to quick grouped category, expand that group too
  const norm = normalizeName(t.category);
  const isQuickExpense =
    t.type === "expense" && quickCategoryNameSet.has(norm);

  if (isQuickExpense) {
    const groupKey = `${monthKey}::${norm}`;
    setOpenCategoryGroups((p) => ({ ...p, [groupKey]: true }));
  }

  // ✅ after expanding, scroll into view
  setTimeout(() => {
    const el = itemRefs.get(highlightId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 250);
}, [highlightId, transactions, quickCategoryNameSet, itemRefs]);


  function toggleYear(y: string) {
    setOpenYears((p) => ({ ...p, [y]: !p[y] }));
  }

  function toggleMonth(key: string) {
    setOpenMonths((p) => ({ ...p, [key]: !p[key] }));
  }

  function toggleCategoryGroup(key: string) {
    setOpenCategoryGroups((p) => ({ ...p, [key]: !p[key] }));
  }

  // ✅ helper: build quick-category expense groups (month-wise)
  function buildQuickCategoryGroups(list: Transaction[]): CategoryGroup[] {
    const quickExpense = list.filter((t) => {
      if (t.type !== "expense") return false;
      return quickCategoryNameSet.has(normalizeName(t.category));
    });

    const map = new Map<string, CategoryGroup>();

    for (const t of quickExpense) {
      const norm = normalizeName(t.category);
      const existing = map.get(norm);

      if (!existing) {
        map.set(norm, {
          category: t.category,
          normalized: norm,
          items: [t],
          expenseTotal: t.amount,
          latestDateISO: t.date,
        });
      } else {
        existing.items.push(t);
        existing.expenseTotal += t.amount;

        if (new Date(t.date).getTime() > new Date(existing.latestDateISO).getTime()) {
          existing.latestDateISO = t.date;
          existing.category = t.category; // keep latest casing
        }
      }
    }

    const groups = Array.from(map.values()).sort(
      (a, b) => new Date(b.latestDateISO).getTime() - new Date(a.latestDateISO).getTime()
    );

    for (const g of groups) {
      g.items = [...g.items].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    return groups;
  }

  // ✅ normal list must exclude quick-category expense tx (to avoid duplicates)
  function removeQuickCategoryExpenses(list: Transaction[]): Transaction[] {
    return list.filter((t) => {
      if (t.type !== "expense") return true;
      return !quickCategoryNameSet.has(normalizeName(t.category));
    });
  }

  if (orderedYears.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
        No transactions found.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {orderedYears.map((yNum) => {
        const y = String(yNum);
        const monthsMap = grouped[y] || {};
        const months = Object.keys(monthsMap).sort((a, b) => Number(b) - Number(a));

        const yearAll = months.flatMap((m) => monthsMap[m] || []);
        const yExpense = yearAll
          .filter((t) => t.type === "expense")
          .reduce((s, t) => s + t.amount, 0);
        const yIncome = yearAll
          .filter((t) => t.type === "income")
          .reduce((s, t) => s + t.amount, 0);

        const expanded = !!openYears[y];

        return (
          <div
            key={y}
            className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden"
          >
            <button
              onClick={() => toggleYear(y)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{y}</span>

                {y === String(currentYear) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
                    Current Year
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-white/60">
                <span className="text-rose-200">Exp ₹{formatMoney(yExpense)}</span>
                <span className="text-emerald-200">Inc ₹{formatMoney(yIncome)}</span>
                <span className="text-white/40">{expanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {expanded && (
              <div className="px-5 pb-5 space-y-3">
                {months.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                    No transactions in {y}.
                  </div>
                ) : (
                  months.map((m) => {
                    const list = monthsMap[m] || [];
                    const key = `${y}-${m}`;

                    const mExpanded = openMonths[key] ?? y === String(currentYear);

                    const mExpense = list
                      .filter((t) => t.type === "expense")
                      .reduce((s, t) => s + t.amount, 0);

                    const mIncome = list
                      .filter((t) => t.type === "income")
                      .reduce((s, t) => s + t.amount, 0);

                    const quickGroups = buildQuickCategoryGroups(list);
                    const normalTxList = removeQuickCategoryExpenses(list);

                    return (
                      <div
                        key={key}
                        className="rounded-2xl border border-white/10 bg-[#0B1220]/40 overflow-hidden"
                      >
                        <button
                          onClick={() => toggleMonth(key)}
                          className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/5 transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                              {monthName(m)} {y}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-xl border border-white/10 bg-white/5 text-white/70">
                              {list.length} tx
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-white/60">
                            <span className="text-rose-200">Exp ₹{formatMoney(mExpense)}</span>
                            <span className="text-emerald-200">Inc ₹{formatMoney(mIncome)}</span>
                            <span className="text-white/40">{mExpanded ? "▲" : "▼"}</span>
                          </div>
                        </button>

                        {mExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            {/* ✅ Quick Category Groups (expense-only, separate section) */}
                            {quickGroups.length > 0 && (
                              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div>
                                    <p className="text-sm font-semibold text-white/80">
                                      Categories in {monthName(m)} {y}
                                    </p>
                                    <p className="text-xs text-white/50">
                                      Grouped expense list for quick categories (no duplicates).
                                    </p>
                                  </div>

                                  <span className="text-[11px] px-2 py-0.5 rounded-xl border border-white/10 bg-white/5 text-white/70">
                                    {quickGroups.length} categories
                                  </span>
                                </div>

                                <div className="px-4 pb-4 space-y-3">
                                  {quickGroups.map((g) => {
                                    const groupKey = `${key}::${g.normalized}`;
                                    const isOpen = !!openCategoryGroups[groupKey];

                                    return (
                                      <div
                                        key={groupKey}
                                        className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
                                      >
                                        <button
                                          onClick={() => toggleCategoryGroup(groupKey)}
                                          className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/10 transition"
                                        >
                                          <div className="min-w-0">
                                            <p className="font-semibold truncate">{g.category}</p>
                                            <p className="text-xs text-white/60 mt-1">
                                              {g.items.length} items • Exp ₹{formatMoney(g.expenseTotal)}
                                            </p>
                                            <p className="text-xs text-white/40 mt-1">
                                              Latest:{" "}
                                              {new Date(g.latestDateISO).toLocaleString("en-IN", {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                hour12: true,
                                              })}
                                            </p>
                                          </div>

                                          <div className="shrink-0 text-right">
                                            <p className="text-sm font-bold text-rose-200">
                                              -₹{formatMoney(g.expenseTotal)}
                                            </p>
                                            <p className="text-xs text-white/40 mt-1">
                                              {isOpen ? "▲" : "▼"}
                                            </p>
                                          </div>
                                        </button>

                                        {isOpen && (
                                          <div className="px-3 pb-3 space-y-2">
                                            {g.items.map((t) => (
                                              <TransactionRow
                                                key={t.id}
                                                t={t}
                                                titleMode="note"
                                                isHighlighted={highlightId === t.id}
                                                itemRefs={itemRefs}
                                                onEdit={onEdit}
                                                onShare={onShare}
                                                onDelete={onDelete}
                                                timeAgo={timeAgo}
                                                formatMoney={formatMoney}
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* ✅ Normal Transaction List (unchanged, excluding quick-category expenses) */}
                            <div className="space-y-2">
                              {normalTxList.map((t) => (
                                <TransactionRow
                                  key={t.id}
                                  t={t}
                                  isHighlighted={highlightId === t.id}
                                  itemRefs={itemRefs}
                                  onEdit={onEdit}
                                  onShare={onShare}
                                  onDelete={onDelete}
                                  timeAgo={timeAgo}
                                  formatMoney={formatMoney}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
