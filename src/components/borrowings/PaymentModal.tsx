// src/components/borrowings/PaymentModal.tsx
"use client";

import Input from "@/components/ui/Input";
import { formatMoney, todayISO } from "@/lib/borrowings/borrowingsHelpers";

export default function PaymentModal({
  open,
  person,
  remaining,
  paymentAmount,
  setPaymentAmount,
  paymentDate,
  setPaymentDate,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  person: string;
  remaining: number;
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;
  paymentDate: string;
  setPaymentDate: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl shadow-black/40">
        <h3 className="text-xl font-bold">Add Payment</h3>

        <p className="text-white/60 mt-1 text-sm">
          Person: <span className="text-white/90">{person}</span>
        </p>

        <p className="text-white/60 mt-1 text-sm">
          Remaining:{" "}
          <span className="text-white/90">₹{formatMoney(remaining)}</span>
        </p>

        <div className="mt-5 space-y-3">
          <Input
            placeholder="Payment amount (₹)"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            type="number"
          />

          <div className="space-y-1">
            <p className="text-xs text-white/60">Payment date</p>
            <input
              type="date"
              value={paymentDate || todayISO()}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
            >
              Cancel
            </button>

            <button
              onClick={onConfirm}
              className="rounded-xl border border-white/10 bg-indigo-500/20 px-4 py-2 text-sm font-semibold hover:bg-indigo-500/30 transition"
            >
              Confirm Payment
            </button>
          </div>

          <p className="text-xs text-white/50">
            Tip: If you enter more than remaining amount, it will auto-limit.
          </p>
        </div>
      </div>
    </div>
  );
}
