// src/lib/borrowings/borrowingsUIHelpers.ts

import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";
import { formatMoney } from "@/lib/borrowings/borrowingsHelpers";

export function formatBorrowingShare(b: Borrowing) {
  const created = new Date(b.createdAt).toLocaleString();
  const edited = b.updatedAt ? new Date(b.updatedAt).toLocaleString() : "Never";
  const remaining = Math.max(0, b.amount - b.amountPaid);

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
