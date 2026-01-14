// src/lib/reminders/reminderHelpers.ts

import type {
  Reminder,
  ReminderFrequency,
  ReminderStatus,
} from "@/store/features/reminders/reminderSlice";

/**
 * ✅ Date helpers (safe + predictable)
 * We store ISO UTC strings in Firestore, but user selects IST time.
 */

const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330; // 5h 30m

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

/**
 * ✅ Convert dateOnly + time(HH:mm) in IST -> ISO UTC string.
 * Example: 2026-01-14 + 08:30 IST -> 2026-01-14T03:00:00.000Z
 */
export function istDateTimeToUtcISO(dateOnly: string, timeHHmm: string) {
  const safeDate = toISODateOnly(dateOnly);
  const safeTime = isValidHHmm(timeHHmm) ? timeHHmm : "12:00";

  const [y, m, d] = safeDate.split("-").map((x) => Number(x));
  const [hh, mm] = safeTime.split(":").map((x) => Number(x));

  // This timestamp currently represents "YYYY-MM-DD HH:mm" as if it were UTC.
  // But user selected IST, so we subtract 5:30 to get true UTC moment.
  const asUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  const utcMs = asUtcMs - IST_OFFSET_MINUTES * 60_000;

  return new Date(utcMs).toISOString();
}

/**
 * ✅ Extract HH:mm in IST from an ISO UTC string (for Edit form).
 */
export function isoToISTTimeHHmm(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "12:00";

  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const hh = parts.find((p) => p.type === "hour")?.value ?? "12";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    const out = `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
    return isValidHHmm(out) ? out : "12:00";
  } catch {
    return "12:00";
  }
}

function isValidHHmm(v: string) {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/**
 * ✅ Backward-compat: old code expects "midday ISO".
 * We keep it, but internally we now prefer istDateTimeToUtcISO(date, "12:00")
 */
export function toMiddayISO(dateOnly: string) {
  return istDateTimeToUtcISO(dateOnly, "12:00");
}

/**
 * ✅ Compute next trigger based on exact due time (IST).
 * - If time missing → assumes 12:00 IST.
 * - Returns ISO UTC string.
 */
export function computeNextTriggerDate(
  dueDateISO: string,
  frequency: ReminderFrequency,
  intervalDays?: number,
  dueTimeHHmm?: string
) {
  const dueDateOnly = toISODateOnly(dueDateISO);
  const baseIso = istDateTimeToUtcISO(dueDateOnly, dueTimeHHmm ?? "12:00");
  const base = new Date(baseIso);

  if (!Number.isFinite(base.getTime())) {
    return new Date().toISOString();
  }

  const now = new Date();

  // ✅ if due date-time is in future, nextTrigger = due date-time itself
  if (base.getTime() >= now.getTime()) {
    return base.toISOString();
  }

  if (frequency === "once") {
    return base.toISOString();
  }

  // Advance in UTC to keep exact HH:mm stable (IST has no DST)
  if (frequency === "monthly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next.toISOString();
  }

  if (frequency === "yearly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setUTCFullYear(next.getUTCFullYear() + 1);
    }
    return next.toISOString();
  }

  // custom
  const days = typeof intervalDays === "number" && intervalDays > 0 ? intervalDays : 30;
  const next = new Date(base);
  while (next.getTime() < now.getTime()) {
    next.setUTCDate(next.getUTCDate() + days);
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

/**
 * ✅ Normalize reminder + ensure time fields exist safely.
 * - If dueTime missing: set "12:00" (keeps old behavior)
 * - dueDate stored as ISO UTC (based on IST time)
 * - nextTriggerDate computed using exact time
 */
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
  const dueTime = isValidHHmm(r.dueTime ?? "") ? (r.dueTime as string) : "12:00";
  const dueDate = istDateTimeToUtcISO(dueDateOnly, dueTime);

  const nextTriggerDate = computeNextTriggerDate(
    dueDateOnly,
    r.frequency,
    r.intervalDays,
    dueTime
  );

  return {
    ...r,
    createdAt,
    updatedAt,
    timezone: r.timezone ?? "Asia/Kolkata",
    dueTime,
    dueDate,
    nextTriggerDate,
  };
}
