"use client";

import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";
import Link from "next/link";
import Badge from "./Badge";
import {
  badgeKind,
  badgeText,
  formatMoney,
} from "@/lib/borrowings/borrowingsHelpers";

export default function BorrowingsReminders({
  reminders,
}: {
  reminders: (Borrowing & { d: number })[];
}) {
  return (
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Upcoming Reminders</h2>
          <p className="text-sm text-white/60 mt-1">
            Due within 7 days (including overdue).
          </p>
        </div>

        <Link
          href="#history"
          className="text-sm font-semibold text-white/80 hover:text-white underline"
        >
          Jump to history
        </Link>
      </div>

      {reminders.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
          🎉 No upcoming reminders right now.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reminders.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold truncate">{b.person}</p>
                <Badge kind={badgeKind(b.dueDate, b.status)}>
                  {badgeText(b.dueDate, b.status)}
                </Badge>
              </div>

              <p className="text-xs text-white/60 mt-2">
                Due: <span className="text-white/80">{b.dueDate}</span> •{" "}
                <span className="text-white/80">{b.category}</span>
              </p>

              <p className="mt-3 text-lg font-bold">
                ₹{formatMoney(Math.max(0, b.amount - b.amountPaid))}
                <span className="text-white/40 text-sm font-medium ml-2">
                  remaining
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
