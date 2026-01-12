// src/lib/reminders/reminderHelpers.ts

import type {
  Reminder,
  ReminderFrequency,
  ReminderStatus,
} from "@/store/features/reminders/reminderSlice";

/**
 * ✅ Date helpers (safe + predictable)
 * We use ISO strings everywhere to avoid timezone confusion.
 */

export function todayISODateOnly() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toISODateOnly(input: string) {
  // accepts "YYYY-MM-DD" or ISO string
  if (!input) return todayISODateOnly();
  if (input.includes("T")) {
    const d = new Date(input);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return input;
}

export function toMiddayISO(dateOnly: string) {
  // ✅ stable "middle of day" time prevents timezone shifting issues
  return new Date(`${dateOnly}T12:00:00`).toISOString();
}

export function computeNextTriggerDate(
  dueDateISO: string,
  frequency: ReminderFrequency,
  intervalDays?: number
) {
  const dueDateOnly = toISODateOnly(dueDateISO);
  const base = new Date(`${dueDateOnly}T12:00:00`);

  if (!Number.isFinite(base.getTime())) {
    return new Date().toISOString();
  }

  const now = new Date();

  // ✅ if due date is in future, nextTrigger = due date itself
  if (base.getTime() >= now.getTime()) {
    return base.toISOString();
  }

  // ✅ otherwise advance to next cycle
  if (frequency === "once") {
    // past once reminder still keeps same trigger
    return base.toISOString();
  }

  if (frequency === "monthly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setMonth(next.getMonth() + 1);
    }
    return next.toISOString();
  }

  if (frequency === "yearly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setFullYear(next.getFullYear() + 1);
    }
    return next.toISOString();
  }

  // custom
  const days = typeof intervalDays === "number" && intervalDays > 0 ? intervalDays : 30;
  const next = new Date(base);
  while (next.getTime() < now.getTime()) {
    next.setDate(next.getDate() + days);
  }
  return next.toISOString();
}

export function formatMoney(n?: number) {
  if (!n || !Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

export function timeAgo(iso: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "just now";

  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);

  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  const week = Math.floor(day / 7);
  if (week < 4) return `${week}w ago`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;

  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

export function getStatusLabel(status: ReminderStatus) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return "Completed";
}

export function getFrequencyLabel(freq: ReminderFrequency) {
  if (freq === "once") return "Once";
  if (freq === "monthly") return "Monthly";
  if (freq === "yearly") return "Yearly";
  return "Custom";
}

export function normalizeReminder(r: Reminder): Reminder {
  const now = new Date().toISOString();
  const createdAt =
    typeof r.createdAt === "string" && r.createdAt.trim().length > 0
      ? r.createdAt
      : now;

  const updatedAt =
    typeof r.updatedAt === "string" && r.updatedAt.trim().length > 0
      ? r.updatedAt
      : null;

  const dueDateOnly = toISODateOnly(r.dueDate);
  const nextTriggerDate = computeNextTriggerDate(
    dueDateOnly,
    r.frequency,
    r.intervalDays
  );

  return {
    ...r,
    createdAt,
    updatedAt,
    dueDate: toMiddayISO(dueDateOnly),
    nextTriggerDate,
  };
}
