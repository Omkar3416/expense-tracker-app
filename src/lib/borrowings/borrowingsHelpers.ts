// src/lib/borrowings/borrowingsHelpers.ts

import type {
  Borrowing,
  BorrowingPayment,
  BorrowingStatus,
} from "@/store/features/borrowings/borrowingSlice";

/* ---------- date helpers ---------- */

export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export function daysUntil(dueISO: string) {
  const due = parseDateOnly(dueISO);
  const today = parseDateOnly(todayISO());
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

/* ---------- badge helpers ---------- */

export function badgeKind(dueISO: string, status: BorrowingStatus) {
  if (status === "paid") return "paid";
  const d = daysUntil(dueISO);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 3) return "soon";
  return "ok";
}

export function badgeText(dueISO: string, status: BorrowingStatus) {
  if (status === "paid") return "Paid";
  const d = daysUntil(dueISO);
  if (d < 0) return `Overdue ${Math.abs(d)}d`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}

/* ---------- money helpers ---------- */

export function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? String(rounded.toFixed(0)) : String(rounded);
}

export function calcRemaining(b: Borrowing) {
  return Math.max(0, b.amount - b.amountPaid);
}

export function formatPaymentDate(isoOrDateOnly: string) {
  // supports full ISO or yyyy-mm-dd
  const d = new Date(isoOrDateOnly);
  if (Number.isNaN(d.getTime())) return isoOrDateOnly;
  return d.toLocaleDateString();
}

/* ---------- payments ---------- */

export function buildPayment(
  amount: number,
  paymentDateISO: string
): BorrowingPayment | null {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return null;

  const dateOnly =
    typeof paymentDateISO === "string" && paymentDateISO.trim().length > 0
      ? paymentDateISO
      : todayISO();

  const iso = new Date(dateOnly).toISOString();

  return { amount: amt, date: iso };
}

export function sumPayments(payments?: BorrowingPayment[]) {
  if (!Array.isArray(payments) || payments.length === 0) return 0;
  return payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0);
}

export function getFullyPaidDate(b: Borrowing): string | null {
  if (b.amountPaid < b.amount) return null;

  const payments = Array.isArray(b.payments) ? b.payments : [];
  if (payments.length > 0) {
    const sorted = payments.slice().sort((a, b) => a.date.localeCompare(b.date));
    return sorted.at(-1)?.date ?? null;
  }

  return b.paidAt ?? null;
}

/* ---------- borrowings state helpers ---------- */

export function toggleBorrowingPaid(b: Borrowing): Borrowing {
  // Pending -> Paid (auto full payment)
  if (b.status === "pending") {
    const existingPayments = Array.isArray(b.payments) ? b.payments : [];
    const remaining = Math.max(0, b.amount - b.amountPaid);

    const autoPay = remaining > 0 ? buildPayment(remaining, todayISO()) : null;

    const payments = autoPay ? [...existingPayments, autoPay] : existingPayments;

    return {
      ...b,
      status: "paid",
      amountPaid: b.amount,
      payments,
      paidAt: getFullyPaidDate({ ...b, amountPaid: b.amount, payments }) ?? new Date().toISOString(),
    };
  }

  // Paid -> Pending (reset)
  return {
    ...b,
    status: "pending",
    paidAt: null,
    amountPaid: 0,
    payments: [],
  };
}

export function addBorrowingPayment(
  b: Borrowing,
  payment: number,
  paymentDateISO: string
): Borrowing {
  const entry = buildPayment(payment, paymentDateISO);
  if (!entry) return b;

  const existingPayments = Array.isArray(b.payments) ? b.payments : [];
  const payments = [...existingPayments, entry];

  const paidSum = Math.min(b.amount, sumPayments(payments));
  const fullyPaid = paidSum >= b.amount;

  return {
    ...b,
    payments,
    amountPaid: paidSum,
    status: fullyPaid ? "paid" : "pending",
    paidAt: fullyPaid ? getFullyPaidDate({ ...b, payments, amountPaid: paidSum }) : null,
  };
}

/* ---------- UI helpers (moved from page) ---------- */

/** ✅ Human readable "x mins ago" */
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

export async function tryClipboardWrite(text: string) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function legacyCopyToClipboard(text: string) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function formatBorrowingShare(b: Borrowing) {
  const created = new Date(b.createdAt).toLocaleString();
  const edited = b.updatedAt ? new Date(b.updatedAt).toLocaleString() : "Never";
  const remaining = calcRemaining(b);

  return [
    "📌 Borrowing",
    `• Person: ${b.person}`,
    `• Type: ${b.type.toUpperCase()}`,
    `• Category: ${b.category.toUpperCase()}`,
    `• Amount: ₹${formatMoney(b.amount)}`,
    `• Paid: ₹${formatMoney(b.amountPaid)}`,
    `• Remaining: ₹${formatMoney(remaining)}`,
    `• Due Date: ${b.dueDate}`,
    b.note ? `• Note: ${b.note}` : "",
    `• Status: ${b.status.toUpperCase()}`,
    `• Created: ${created}`,
    `• Edited: ${edited}`,
  ]
    .filter(Boolean)
    .join("\n");
}
