// src/components/reminders/ReminderRow.tsx
"use client";

import type { Reminder } from "@/store/features/reminders/reminderSlice";
import Button from "@/components/ui/Button";
import {
  formatMoney,
  getFrequencyLabel,
  getStatusLabel,
  timeAgo,
} from "@/lib/reminders/reminderHelpers";

type Props = {
  r: Reminder;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
  onTogglePause: (r: Reminder) => void;
  onShare: (r: Reminder) => void;
};

export default function ReminderRow({
  r,
  onEdit,
  onDelete,
  onTogglePause,
  onShare,
}: Props) {
  const due = new Date(r.dueDate);
  const next = new Date(r.nextTriggerDate);

  const dueStr = Number.isFinite(due.getTime())
    ? due.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Invalid date";

  const nextStr = Number.isFinite(next.getTime())
    ? next.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Invalid date";

  const createdStr = new Date(r.createdAt).toLocaleString();
  const updatedStr = r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "Never";

  const badgeColor =
    r.status === "active"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : r.status === "paused"
      ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
      : "border-white/10 bg-white/5 text-white/60";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{r.title}</p>

            <span
              className={[
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                badgeColor,
              ].join(" ")}
            >
              {getStatusLabel(r.status)}
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
              {getFrequencyLabel(r.frequency)}
            </span>

            {typeof r.amount === "number" && r.amount > 0 && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                ₹{formatMoney(r.amount)}
              </span>
            )}
          </div>

          <p className="text-xs text-white/60 mt-2">
            Due: <span className="text-white/80">{dueStr}</span> • Next Trigger:{" "}
            <span className="text-white/80">{nextStr}</span>
          </p>

          {r.note ? (
            <p className="text-sm text-white/70 mt-2 break-words">{r.note}</p>
          ) : null}

          <p className="text-[11px] text-white/40 mt-3">
            Created: {createdStr} ({timeAgo(r.createdAt)}) • Edited: {updatedStr}
          </p>
        </div>

        <div className="shrink-0 flex flex-col gap-2">
          <button
            onClick={() => onEdit(r)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 transition"
          >
            Edit
          </button>

          <button
            onClick={() => onTogglePause(r)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 transition"
          >
            {r.status === "paused" ? "Start" : "Stop"}
          </button>

          <button
            onClick={() => onShare(r)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 transition"
          >
            Share
          </button>

          <button
            onClick={() => onDelete(r)}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
