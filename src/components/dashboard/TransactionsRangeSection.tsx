// src/components/dashboard/TransactionsRangeSection.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";

import type { Transaction } from "@/store/features/transactions/transactionSlice";

import { useAppSelector } from "@/store/hooks";
import type { RootState } from "@/store/store";

import {
  TxSortKey,
  formatMoney,
  monthName,
  sortTx,
} from "@/lib/dashboard/dashboardHelpers";

type TxTypeFilter = "all" | "expense" | "income";

type Props = {
  transactions: Transaction[];
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

export default function TransactionsRangeSection({ transactions }: Props) {
  const router = useRouter();

  const now = new Date();
  const currentYear = now.getFullYear();

  // ✅ Default must be "all" to show ALL years (old dashboard behavior)
  const [type, setType] = useState<TxTypeFilter>("all");
  const [year, setYear] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TxSortKey>("date_desc");

  // ✅ keep current year expanded by default (nice UX)
  const [openYears, setOpenYears] = useState<Record<string, boolean>>(() => ({
    [String(currentYear)]: true,
  }));

  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>(
    () => ({})
  );

  // ✅ expand/collapse for grouped quick categories inside each month
  const [openCategoryGroups, setOpenCategoryGroups] = useState<
    Record<string, boolean>
  >(() => ({}));

  // ✅ pull quick categories list from redux (same source as Quick Categories panel)
  const categories = useAppSelector((s: RootState) => s.categories.list);

  // ✅ quick categories name lookup
  const quickCategoryNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) {
      if (c.type !== "transaction") continue;
      set.add(normalizeName(c.name));
    }
    return set;
  }, [categories]);

  // ✅ All years list for dropdown
  const yearsList = useMemo(() => {
    const set = new Set<number>();
    for (const t of transactions) set.add(new Date(t.date).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  // ✅ Apply filters (year is "all" by default)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return transactions.filter((t) => {
      if (type !== "all" && t.type !== type) return false;

      const y = String(new Date(t.date).getFullYear());
      if (year !== "all" && y !== year) return false;

      if (!q) return true;

      return (
        t.category.toLowerCase().includes(q) ||
        (t.note?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [transactions, type, year, search]);

  // ✅ Group by year/month and sort each month list using selected sorting
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Transaction[]>> = {};

    for (const t of filtered) {
      const d = new Date(t.date);
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, "0");

      map[y] ??= {};
      map[y][m] ??= [];
      map[y][m].push(t);
    }

    // ✅ Sort items inside each month
    for (const y of Object.keys(map)) {
      for (const m of Object.keys(map[y])) {
        map[y][m] = sortTx(map[y][m], sort);
      }
    }

    return map;
  }, [filtered, sort]);

  // ✅ Ordered years should be purely DESC (like old dashboard)
  const orderedYears = useMemo(() => {
    const unique = new Set<number>();
    for (const t of filtered) unique.add(new Date(t.date).getFullYear());
    return Array.from(unique).sort((a, b) => b - a);
  }, [filtered]);

  function toggleYear(y: string) {
    setOpenYears((p) => ({ ...p, [y]: !p[y] }));
  }

  function toggleMonth(key: string) {
    setOpenMonths((p) => ({ ...p, [key]: !p[key] }));
  }

  function toggleCategoryGroup(key: string) {
    setOpenCategoryGroups((p) => ({ ...p, [key]: !p[key] }));
  }

  function openTransaction(id: string) {
    router.push(`/transactions?open=${encodeURIComponent(id)}`);
  }

  const totalCount = filtered.length;

  const totalExpense = useMemo(() => {
    return filtered
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
  }, [filtered]);

  const totalIncome = useMemo(() => {
    return filtered
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
  }, [filtered]);

  // ✅ helper: build grouped quick-category expense items for a month list
  function buildQuickCategoryGroups(list: Transaction[]): CategoryGroup[] {
    // ✅ QUICK CATEGORY GROUPS = expense only (as per your requirement)
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

    // ✅ sort groups by latest date desc (so most recent category is on top)
    const groups = Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.latestDateISO).getTime() - new Date(a.latestDateISO).getTime()
    );

    // ✅ sort group items by date desc (newest item first)
    for (const g of groups) {
      g.items = [...g.items].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    return groups;
  }

  // ✅ helper: filter out quick-category expense tx from normal list (avoid duplicates)
  function removeQuickCategoryExpenses(list: Transaction[]): Transaction[] {
    return list.filter((t) => {
      if (t.type !== "expense") return true;
      return !quickCategoryNameSet.has(normalizeName(t.category));
    });
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Transaction Range</h2>
          <p className="text-sm text-white/60 mt-1">
            Google Pay style history: year → month → transactions.
          </p>
        </div>

        <div className="text-xs text-white/50 text-right">
          <div>
            Showing{" "}
            <span className="font-semibold text-white/80">{totalCount}</span> tx
          </div>
          <div className="mt-1">
            Exp:{" "}
            <span className="text-rose-200 font-semibold">
              ₹{formatMoney(totalExpense)}
            </span>{" "}
            • Inc:{" "}
            <span className="text-emerald-200 font-semibold">
              ₹{formatMoney(totalIncome)}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input
          placeholder="Search category / note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          value={type}
          onChange={(e) => setType(e.target.value as TxTypeFilter)}
        >
          <option value="all" className="bg-[#0B1220]">
            All Types
          </option>
          <option value="expense" className="bg-[#0B1220]">
            Expense
          </option>
          <option value="income" className="bg-[#0B1220]">
            Income
          </option>
        </select>

        <select
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          value={year}
          onChange={(e) => {
            const v = e.target.value;
            setYear(v);

            // ✅ if a specific year selected, auto expand it
            if (v !== "all") {
              setOpenYears((p) => ({ ...p, [v]: true }));
            }
          }}
        >
          <option value="all" className="bg-[#0B1220]">
            All Years
          </option>
          {yearsList.map((y) => (
            <option key={y} value={String(y)} className="bg-[#0B1220]">
              {y}
            </option>
          ))}
        </select>

        <select
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          value={sort}
          onChange={(e) => setSort(e.target.value as TxSortKey)}
        >
          <option value="date_desc" className="bg-[#0B1220]">
            Newest first
          </option>
          <option value="date_asc" className="bg-[#0B1220]">
            Oldest first
          </option>
          <option value="amount_desc" className="bg-[#0B1220]">
            Amount high → low
          </option>
          <option value="amount_asc" className="bg-[#0B1220]">
            Amount low → high
          </option>
        </select>
      </div>

      {/* Years */}
      <div className="mt-6 space-y-4">
        {orderedYears.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/50">
            No transactions found for this filter.
          </div>
        ) : (
          orderedYears.map((yNum) => {
            const y = String(yNum);
            const monthsMap = grouped[y] || {};
            const months = Object.keys(monthsMap).sort(
              (a, b) => Number(b) - Number(a)
            );

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
                    <span className="text-rose-200">
                      Exp ₹{formatMoney(yExpense)}
                    </span>
                    <span className="text-emerald-200">
                      Inc ₹{formatMoney(yIncome)}
                    </span>
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

                        // ✅ keep current year months expanded by default
                        const mExpanded =
                          openMonths[key] ?? y === String(currentYear);

                        const mExpense = list
                          .filter((t) => t.type === "expense")
                          .reduce((s, t) => s + t.amount, 0);

                        const mIncome = list
                          .filter((t) => t.type === "income")
                          .reduce((s, t) => s + t.amount, 0);

                        // ✅ Build quick category groups for this month (expense only)
                        const quickGroups = buildQuickCategoryGroups(list);

                        // ✅ Normal tx list stays same UI but WITHOUT quick-category expenses (avoid duplicate)
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
                                <span className="text-rose-200">
                                  Exp ₹{formatMoney(mExpense)}
                                </span>
                                <span className="text-emerald-200">
                                  Inc ₹{formatMoney(mIncome)}
                                </span>
                                <span className="text-white/40">
                                  {mExpanded ? "▲" : "▼"}
                                </span>
                              </div>
                            </button>

                            {mExpanded && (
                              <div className="px-4 pb-4 space-y-3">
                                {/* ✅ Quick Category Groups (expense-only) */}
                                {quickGroups.length > 0 && (
                                  <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3">
                                      <div>
                                        <p className="text-sm font-semibold text-white/80">
                                          Categories in {y}
                                        </p>
                                        <p className="text-xs text-white/50">
                                          Grouped list to avoid duplicate titles (cycle, cycle, cycle...).
                                        </p>
                                      </div>

                                      <span className="text-[11px] px-2 py-0.5 rounded-xl border border-white/10 bg-white/5 text-white/70">
                                        {quickGroups.length} categories
                                      </span>
                                    </div>

                                    <div className="px-4 pb-4 space-y-3">
                                      {quickGroups.map((g) => {
                                        const groupKey = `${key}-${g.normalized}`;
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
                                                <p className="font-semibold truncate">
                                                  {g.category}
                                                </p>
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
                                              <div className="px-4 pb-4 space-y-2">
                                                {g.items.map((t) => (
                                                  <div
                                                    key={t.id}
                                                    onClick={() => openTransaction(t.id)}
                                                    className="cursor-pointer rounded-2xl border border-white/10 bg-[#0B1220]/40 p-3 flex items-center justify-between gap-4 hover:bg-white/10 transition"
                                                  >
                                                    <div className="min-w-0">
                                                      <p className="font-semibold truncate">
                                                        {t.note?.trim() ? t.note : "(No note)"}
                                                      </p>
                                                      <p className="text-xs text-white/60">
                                                        {new Date(t.date).toLocaleString("en-IN", {
                                                          day: "2-digit",
                                                          month: "short",
                                                          year: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                          hour12: true,
                                                        })}
                                                      </p>
                                                    </div>

                                                    <div className="text-right shrink-0">
                                                      <p className="text-sm font-bold text-rose-200">
                                                        -₹{formatMoney(t.amount)}
                                                      </p>
                                                      <p className="text-[11px] text-white/50 mt-1">
                                                        expense
                                                      </p>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* ✅ Normal Transaction List (UNCHANGED UI) */}
                                <div className="space-y-2">
                                  {normalTxList.map((t) => (
                                    <div
                                      key={t.id}
                                      onClick={() => openTransaction(t.id)}
                                      className="cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-4 hover:bg-white/10 transition"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-semibold truncate">{t.category}</p>
                                        <p className="text-xs text-white/60">
                                          {new Date(t.date).toLocaleDateString("en-IN", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                          })}
                                        </p>

                                        {t.note ? (
                                          <p className="text-xs text-white/70 mt-1 break-words">
                                            {t.note}
                                          </p>
                                        ) : null}
                                      </div>

                                      <div className="text-right shrink-0">
                                        <p
                                          className={[
                                            "text-sm font-bold",
                                            t.type === "expense"
                                              ? "text-rose-200"
                                              : "text-emerald-200",
                                          ].join(" ")}
                                        >
                                          {t.type === "expense" ? "-" : "+"}₹
                                          {formatMoney(t.amount)}
                                        </p>
                                        <p className="text-[11px] text-white/50 mt-1">
                                          {t.type}
                                        </p>
                                      </div>
                                    </div>
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
          })
        )}
      </div>

      <p className="mt-4 text-xs text-white/45">
        Tip: Use{" "}
        <span className="text-white/70 font-semibold">All Years</span> + sorting
        to see full history like Google Pay.
      </p>
    </div>
  );
}
