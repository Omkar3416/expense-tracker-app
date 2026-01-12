// src/components/dashboard/DashboardBorrowingReminders.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";
import { daysUntil, formatMoney } from "@/lib/dashboard/dashboardHelpers";

export default function DashboardBorrowingReminders({
  borrowings,
}: {
  borrowings: Borrowing[];
}) {
  const borrowReminders = useMemo(() => {
    return borrowings
      .filter((b) => b.status === "pending")
      .map((b) => ({ ...b, d: daysUntil(b.dueDate) }))
      .filter((b) => b.d <= 7)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
  }, [borrowings]);

  const overdueCount = useMemo(
    () =>
      borrowings.filter(
        (b) => b.status === "pending" && daysUntil(b.dueDate) < 0
      ).length,
    [borrowings]
  );

  const dueTodayCount = useMemo(
    () =>
      borrowings.filter(
        (b) => b.status === "pending" && daysUntil(b.dueDate) === 0
      ).length,
    [borrowings]
  );

  const dueSoonCount = useMemo(
    () =>
      borrowings.filter(
        (b) =>
          b.status === "pending" &&
          daysUntil(b.dueDate) > 0 &&
          daysUntil(b.dueDate) <= 3
      ).length,
    [borrowings]
  );

  return (
    <GlassPanel>
      <h2 className="text-lg font-semibold">Borrowing Reminders</h2>
      <p className="text-sm text-white/60 mt-1">
        Pending borrowings due soon (next 7 days).
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniStat label="Overdue" value={String(overdueCount)} />
        <MiniStat label="Today" value={String(dueTodayCount)} />
        <MiniStat label="Soon" value={String(dueSoonCount)} />
      </div>

      <div className="mt-5 space-y-3">
        {borrowReminders.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            No reminders in next 7 days ✅
          </div>
        ) : (
          borrowReminders.map((b) => (
            <div
              key={b.id}
              className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate">{b.person}</p>
                <p className="text-xs text-white/60 mt-1">
                  Due: {b.dueDate} •{" "}
                  {b.d < 0
                    ? `Overdue ${Math.abs(b.d)}d`
                    : b.d === 0
                    ? "Today"
                    : `In ${b.d}d`}
                </p>
              </div>
              <p className="font-bold text-white/90 shrink-0">
                ₹{formatMoney(b.amount)}
              </p>
            </div>
          ))
        )}
      </div>

      <Link
        href="/borrowings"
        className="inline-block mt-4 text-sm font-semibold text-white/80 hover:text-white underline"
      >
        View all borrowings
      </Link>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
      <p className="text-xs text-white/60">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
