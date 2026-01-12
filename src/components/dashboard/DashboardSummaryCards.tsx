// src/components/dashboard/DashboardSummaryCards.tsx
"use client";

import { formatMoney } from "@/lib/dashboard/dashboardHelpers";

type Props = {
  label: string;
  totalExpense: number;
  totalIncome: number;
  balance: number;
  allTimeExpense: number;
};

export default function DashboardSummaryCards({
  label,
  totalExpense,
  totalIncome,
  balance,
  allTimeExpense,
}: Props) {
  return (
    <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-5">
      <SummaryCard
        title="Total Expense"
        subtitle={label}
        value={`₹${formatMoney(totalExpense)}`}
        gradient="from-rose-500/20 via-orange-500/15 to-transparent"
      />
      <SummaryCard
        title="Total Income"
        subtitle={label}
        value={`₹${formatMoney(totalIncome)}`}
        gradient="from-emerald-500/20 via-cyan-500/15 to-transparent"
      />
      <SummaryCard
        title="Balance"
        subtitle={label}
        value={`₹${formatMoney(balance)}`}
        gradient="from-indigo-500/20 via-fuchsia-500/15 to-transparent"
      />
      <SummaryCard
        title="All-time Expense"
        subtitle="All years"
        value={`₹${formatMoney(allTimeExpense)}`}
        gradient="from-rose-500/15 via-rose-500/10 to-transparent"
      />
    </div>
  );
}

function SummaryCard({
  title,
  subtitle,
  value,
  gradient,
}: {
  title: string;
  subtitle: string;
  value: string;
  gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <div className="relative">
        <p className="text-white/70 text-sm">{title}</p>
        <p className="text-white/40 text-xs mt-1">{subtitle}</p>
        <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
        <div className="mt-4 h-[1px] w-full bg-white/10" />
        <p className="mt-3 text-xs text-white/50">Auto-updates when you add transactions.</p>
      </div>
    </div>
  );
}
