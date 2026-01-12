// src/app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useAuthUser } from "@/store/AuthProvider";

import { getRange, type RangeKey } from "@/lib/dashboard/dateRanges";
import { computeTotals } from "@/lib/dashboard/stats";
import { sortTx, todayISO } from "@/lib/dashboard/dashboardHelpers";

import {
  upsertTransactionToRepo,
  type Transaction,
} from "@/store/features/transactions/transactionSlice";

import {
  upsertBorrowingToRepo,
  type Borrowing,
} from "@/store/features/borrowings/borrowingSlice";

import DashboardRangePicker from "@/components/dashboard/DashboardRangePicker";
import DashboardSummaryCards from "@/components/dashboard/DashboardSummaryCards";
import DashboardTransactionsPanel from "@/components/dashboard/DashboardTransactionsPanel";
import DashboardInsightsPanel from "@/components/dashboard/DashboardInsightsPanel";
import DashboardBorrowingReminders from "@/components/dashboard/DashboardBorrowingReminders";

import TransactionsRangeSection from "@/components/dashboard/TransactionsRangeSection";

import TrashUnifiedModal from "@/components/ui/TrashUnifiedModal";

import { loadTrash, type TrashItem } from "@/lib/storageTrash";

// ✅ Panels
import DashboardQuickCategoriesPanel from "@/components/dashboard/DashboardQuickCategoriesPanel";
import DashboardRemindersPanel from "@/components/dashboard/DashboardRemindersPanel";

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const user = useAuthUser();
  const uid = user?.uid;

  const transactions = useAppSelector((s) => s.transactions.list);
  const borrowings = useAppSelector((s) => s.borrowings.list);

  const [range, setRange] = useState<RangeKey>("day");

  const now = new Date();
  const currentYear = now.getFullYear();

  const [dayAnchor, setDayAnchor] = useState<string>(todayISO());
  const [weekAnchor, setWeekAnchor] = useState<string>(todayISO());

  const [monthIndex, setMonthIndex] = useState<number>(now.getMonth());
  const [monthYear, setMonthYear] = useState<number>(currentYear);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const [customFrom, setCustomFrom] = useState<string>(todayISO());
  const [customTo, setCustomTo] = useState<string>(todayISO());

  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]);

  function refreshTrash() {
    setTrash(loadTrash(uid));
  }

  useEffect(() => {
    refreshTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    function handler() {
      refreshTrash();
    }
    window.addEventListener("trash:restored", handler);
    return () => window.removeEventListener("trash:restored", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const { start, end, label } = useMemo(() => {
    return getRange({
      range,
      dayAnchor,
      weekAnchor,
      monthIndex,
      monthYear,
      selectedYear,
      customFrom,
      customTo,
    });
  }, [
    range,
    dayAnchor,
    weekAnchor,
    monthIndex,
    monthYear,
    selectedYear,
    customFrom,
    customTo,
  ]);

  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      const time = new Date(t.date).getTime();
      return time >= start && time < end;
    });
  }, [transactions, start, end]);

  const { totalExpense, totalIncome, balance } = useMemo(() => {
    return computeTotals(filteredTx);
  }, [filteredTx]);

  const allTime = useMemo(() => computeTotals(transactions), [transactions]);

  const recent = useMemo(
    () => sortTx(filteredTx, "date_desc").slice(0, 5),
    [filteredTx]
  );

  const daysPassed = useMemo(() => {
    if (range === "day") return 1;
    if (range === "week") return 7;

    const diff = Math.max(
      1,
      Math.round((end - start) / (1000 * 60 * 60 * 24))
    );
    return diff;
  }, [range, start, end]);

  const avgDailySpend = useMemo(
    () => totalExpense / Math.max(1, daysPassed),
    [totalExpense, daysPassed]
  );

  function handleQuickAdd(tx: Transaction) {
    dispatch(upsertTransactionToRepo({ uid, tx }));
  }

  function formatMoney(n: number) {
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
    }).format(n);
  }

  return (
    <main className="pt-10">
      <div className="mx-auto max-w-6xl px-4 pb-16 space-y-10">
        {/* ✅ Page Header */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight">
              Dashboard{" "}
              <span className="text-white/40 text-lg font-medium">overview</span>
            </h1>
            <p className="text-white/60 max-w-2xl">
              Track your spending, measure your savings, and stay in control
              with a clean summary.
            </p>
          </div>

          {/* ✅ Deleted History Button */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                refreshTrash();
                setTrashOpen(true);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition flex items-center gap-2"
            >
              <span className="text-white/80">🗑</span>
              Deleted History
              <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                {trash.length}
              </span>
            </button>
          </div>
        </div>

        {/* ✅ Date Range Picker */}
        <DashboardRangePicker
          range={range}
          setRange={setRange}
          dayAnchor={dayAnchor}
          setDayAnchor={setDayAnchor}
          weekAnchor={weekAnchor}
          setWeekAnchor={setWeekAnchor}
          monthIndex={monthIndex}
          setMonthIndex={setMonthIndex}
          monthYear={monthYear}
          setMonthYear={setMonthYear}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          label={label}
        />

        {/* ✅ Summary Cards */}
        <DashboardSummaryCards
          label={label}
          totalExpense={totalExpense}
          totalIncome={totalIncome}
          balance={balance}
          allTimeExpense={allTime.totalExpense}
        />

        {/* ✅ 1) Quick Transaction section first */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardTransactionsPanel
            label={label}
            uid={uid}
            userUid={user?.uid}
            userEmail={user?.email ?? null}
            recent={recent}
            onQuickAdd={handleQuickAdd}
            allTransactions={transactions}
          />

          <div className="space-y-6">
            <DashboardInsightsPanel
              label={label}
              filteredTx={filteredTx}
              totalExpense={totalExpense}
              avgDailySpend={avgDailySpend}
            />

            <DashboardBorrowingReminders borrowings={borrowings} />
          </div>
        </div>

        {/* ✅ 2) Reminders */}
        <DashboardRemindersPanel
          uid={uid}
          userUid={user?.uid}
          userEmail={user?.email ?? null}
        />

        {/* ✅ 3) Quick Categories */}
        <DashboardQuickCategoriesPanel
          uid={uid}
          userUid={user?.uid}
          userEmail={user?.email ?? null}
          transactions={transactions}
          onQuickAdd={handleQuickAdd}
        />

        {/* ✅ 4) Transaction Range Section (MOVED HERE) */}
        <TransactionsRangeSection transactions={transactions} />
      </div>

      {/* ✅ Trash Modal */}
      <TrashUnifiedModal
        uid={uid}
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        trash={trash}
        refreshTrash={refreshTrash}
        onRestoreTransaction={(t: Transaction) => {
          dispatch(upsertTransactionToRepo({ uid, tx: t }));
        }}
        onRestoreBorrowing={(b: Borrowing) => {
          dispatch(upsertBorrowingToRepo({ uid, borrowing: b }));
        }}
        formatMoney={formatMoney}
      />
    </main>
  );
}
