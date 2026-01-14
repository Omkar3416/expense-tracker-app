// src/components/borrowings/BorrowingsAddForm.tsx
"use client";

import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

import type {
  BorrowingCategory,
  BorrowingType,
} from "@/store/features/borrowings/borrowingSlice";

type CategoryOption = { value: BorrowingCategory; label: string };

type Props = {
  person: string;
  setPerson: (v: string) => void;

  amount: string;
  setAmount: (v: string) => void;

  type: BorrowingType;
  setType: (v: BorrowingType) => void;

  category: BorrowingCategory;
  setCategory: (v: BorrowingCategory) => void;

  dueDate: string;
  setDueDate: (v: string) => void;

  // ✅ NEW
  dueTime: string;
  setDueTime: (v: string) => void;

  note: string;
  setNote: (v: string) => void;

  categories: CategoryOption[];

  onAdd: () => void;
};

export default function BorrowingsAddForm({
  person,
  setPerson,
  amount,
  setAmount,
  type,
  setType,
  category,
  setCategory,
  dueDate,
  setDueDate,
  dueTime,
  setDueTime,
  note,
  setNote,
  categories,
  onAdd,
}: Props) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      <h2 className="text-lg font-semibold">Add Borrowing</h2>

      <div className="mt-5 space-y-3">
        <Input
          placeholder="Person name"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        />

        <Input
          placeholder="Amount (₹)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
        />

        <select
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          value={type}
          onChange={(e) => setType(e.target.value as BorrowingType)}
        >
          <option value="borrowed" className="bg-[#0B1220]">
            I Borrowed (I have to pay)
          </option>
          <option value="lent" className="bg-[#0B1220]">
            I Lent (They have to pay)
          </option>
        </select>

        <select
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          value={category}
          onChange={(e) => setCategory(e.target.value as BorrowingCategory)}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value} className="bg-[#0B1220]">
              {c.label}
            </option>
          ))}
        </select>

        <div className="space-y-1">
          <p className="text-xs text-white/60">Due date</p>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        {/* ✅ NEW: Due time */}
        <div className="space-y-1">
          <p className="text-xs text-white/60">Due time (IST)</p>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Button onClick={onAdd} className="w-full">
          Add Entry
        </Button>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/70 font-semibold">
            Partial payments supported ✅
          </p>
          <p className="text-xs text-white/50 mt-1">
            Use “Add Payment” on a record to update remaining balance.
          </p>
        </div>
      </div>
    </div>
  );
}
