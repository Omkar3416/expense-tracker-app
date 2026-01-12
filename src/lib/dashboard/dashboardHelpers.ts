// src/lib/dashboard/dashboardHelpers.ts
import type { Transaction } from "@/store/features/transactions/transactionSlice";

export type TxSortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
export type TxTypeFilter = "all" | "expense" | "income";


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

export function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

export function monthName(mm: string) {
  const map: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dec",
  };
  return map[mm] ?? mm;
}

export function sortTx(list: Transaction[], sortKey: TxSortKey) {
  const arr = [...list];
  arr.sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();

    if (sortKey === "date_desc") return tb - ta;
    if (sortKey === "date_asc") return ta - tb;

    if (sortKey === "amount_desc") return b.amount - a.amount;
    if (sortKey === "amount_asc") return a.amount - b.amount;

    return tb - ta;
  });
  return arr;
}
