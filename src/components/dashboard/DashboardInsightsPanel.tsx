// src/components/dashboard/DashboardInsightsPanel.tsx
"use client";

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import { formatMoney } from "@/lib/dashboard/dashboardHelpers";

export default function DashboardInsightsPanel({
  label,
  filteredTx,
  totalExpense,
  avgDailySpend,
}: {
  label: string;
  filteredTx: Transaction[];
  totalExpense: number;
  avgDailySpend: number;
}) {
  const expenseOnly = filteredTx.filter((t) => t.type === "expense");

  const biggestExpense = (() => {
    if (expenseOnly.length === 0) return null;
    return expenseOnly.reduce<Transaction>((max, t) => (t.amount > max.amount ? t : max), expenseOnly[0]);
  })();

  const topCategory = (() => {
    const totals: Record<string, number> = {};
    for (const t of expenseOnly) totals[t.category] = (totals[t.category] || 0) + t.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  })();

  return (
    <GlassPanel>
      <h2 className="text-lg font-semibold">Insights</h2>
      <p className="text-sm text-white/60 mt-1">Smart highlights for {label}.</p>

      <div className="mt-6 space-y-3">
        <InsightRow label="Top Category" value={topCategory} />
        <InsightRow
          label="Biggest Expense"
          value={biggestExpense ? `₹${formatMoney(biggestExpense.amount)}` : "—"}
        />
        <InsightRow label="Avg Daily Spend" value={`₹${formatMoney(avgDailySpend)}`} />
      </div>
    </GlassPanel>
  );
}

function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      {children}
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-sm text-white/70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
