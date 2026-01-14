// src/store/features/borrowings/borrowingSlice.ts

import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { RootState } from "@/store/store";
import {
  repoDeleteBorrowing,
  repoFetchBorrowings,
  repoUpsertBorrowing,
} from "@/lib/repository/borrowingsRepo";

export type BorrowingType = "borrowed" | "lent";
export type BorrowingStatus = "pending" | "paid";
export type BorrowingCategory = "friend" | "family" | "business";

export type BorrowingPayment = {
  amount: number;
  date: string; // ISO string
};

export type Borrowing = {
  id: string;
  person: string;
  amount: number;

  amountPaid: number;
  payments?: BorrowingPayment[];

  type: BorrowingType;
  category: BorrowingCategory;

  /**
   * ✅ Existing behavior:
   * dueDate stays as "YYYY-MM-DD" (used for daysUntil / overdue UI)
   */
  dueDate: string;

  /**
   * ✅ New optional:
   * dueTime = "HH:mm" (IST selection)
   * dueAt = ISO UTC string computed from dueDate + dueTime (for server-side FCM later)
   */
  dueTime?: string;
  dueAt?: string; // ISO UTC
  timezone?: "Asia/Kolkata";

  note?: string;
  status: BorrowingStatus;

  createdAt: string;
  updatedAt: string | null;

  createdByUid?: string;
  createdByEmail?: string | null;

  updatedByUid?: string;
  updatedByEmail?: string | null;

  paidAt: string | null;
};

type BorrowingState = {
  list: Borrowing[];
  loading: boolean;
  error?: string;
};

const initialState: BorrowingState = {
  list: [],
  loading: false,
  error: undefined,
};

/* ---------------- Normalization helper ---------------- */

function isBorrowingPayment(x: unknown): x is BorrowingPayment {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj.amount === "number" &&
    Number.isFinite(obj.amount) &&
    obj.amount > 0 &&
    typeof obj.date === "string" &&
    obj.date.trim().length > 0
  );
}

function normalizeBorrowing(b: Borrowing): Borrowing {
  const raw = b as Partial<Borrowing> & Record<string, unknown>;

  const safeAmount =
    typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : 0;

  const safeAmountPaid =
    typeof raw.amountPaid === "number" && Number.isFinite(raw.amountPaid)
      ? raw.amountPaid
      : 0;

  const amountPaid = Math.min(safeAmount, Math.max(0, safeAmountPaid));

  const category: BorrowingCategory =
    raw.category === "friend" ||
    raw.category === "family" ||
    raw.category === "business"
      ? raw.category
      : "friend";

  const status: BorrowingStatus =
    raw.status === "pending" || raw.status === "paid" ? raw.status : "pending";

  const paidAt =
    typeof raw.paidAt === "string" && raw.paidAt.trim().length > 0 ? raw.paidAt : null;

  const now = new Date().toISOString();

  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt.trim().length > 0
      ? raw.createdAt
      : now;

  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim().length > 0
      ? raw.updatedAt
      : null;

  const dueDate =
    typeof raw.dueDate === "string" && raw.dueDate.trim().length > 0 ? raw.dueDate : "";

  const dueTime =
    typeof raw.dueTime === "string" && raw.dueTime.trim().length > 0
      ? raw.dueTime
      : undefined;

  const dueAt =
    typeof raw.dueAt === "string" && raw.dueAt.trim().length > 0 ? raw.dueAt : undefined;

  const timezone: "Asia/Kolkata" | undefined =
    raw.timezone === "Asia/Kolkata" ? "Asia/Kolkata" : undefined;

  // ✅ normalize payments (type-safe)
  const paymentsRaw = raw.payments;
  const payments: BorrowingPayment[] = Array.isArray(paymentsRaw)
    ? paymentsRaw.filter(isBorrowingPayment)
    : [];

  // ✅ if payments exist, keep amountPaid in sync (safe)
  const computedPaid =
    payments.length > 0
      ? Math.min(safeAmount, payments.reduce((sum, p) => sum + p.amount, 0))
      : amountPaid;

  const finalPaidAt =
    computedPaid >= safeAmount
      ? paidAt ?? payments.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date ?? now
      : null;

  return {
    ...b,
    amount: safeAmount,
    amountPaid: computedPaid,
    payments,
    category,
    status: computedPaid >= safeAmount ? "paid" : status,
    paidAt: finalPaidAt,
    createdAt,
    updatedAt,
    dueDate,
    dueTime,
    dueAt,
    timezone: timezone ?? b.timezone ?? undefined,
  };
}

/* ---------------- Thunks (repo-based) ---------------- */

export const fetchBorrowings = createAsyncThunk<Borrowing[], { uid?: string }>(
  "borrowings/fetchBorrowings",
  async ({ uid }) => {
    const list = await repoFetchBorrowings(uid);
    return list.map(normalizeBorrowing);
  }
);

export const upsertBorrowingToRepo = createAsyncThunk<
  Borrowing,
  { uid?: string; borrowing: Borrowing }
>("borrowings/upsertBorrowingToRepo", async ({ uid, borrowing }) => {
  const saved = await repoUpsertBorrowing(uid, borrowing);
  return normalizeBorrowing(saved);
});

export const deleteBorrowingFromRepo = createAsyncThunk<
  string,
  { uid?: string; id: string }
>("borrowings/deleteBorrowingFromRepo", async ({ uid, id }) => {
  return await repoDeleteBorrowing(uid, id);
});

/* ---------------- Slice ---------------- */

const borrowingSlice = createSlice({
  name: "borrowings",
  initialState,
  reducers: {
    setAllBorrowings: (state, action: PayloadAction<Borrowing[]>) => {
      state.list = action.payload.map(normalizeBorrowing);
    },

    clearBorrowings: (state) => {
      state.list = [];
      state.loading = false;
      state.error = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBorrowings.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchBorrowings.fulfilled, (state, action) => {
        state.loading = false;
        state.error = undefined;
        state.list = action.payload;
      })
      .addCase(fetchBorrowings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load borrowings";
      })

      .addCase(upsertBorrowingToRepo.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(upsertBorrowingToRepo.fulfilled, (state, action) => {
        state.loading = false;
        state.error = undefined;

        const idx = state.list.findIndex((b) => b.id === action.payload.id);
        if (idx >= 0) state.list[idx] = action.payload;
        else state.list.unshift(action.payload);
      })
      .addCase(upsertBorrowingToRepo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to save borrowing";
      })

      .addCase(deleteBorrowingFromRepo.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(deleteBorrowingFromRepo.fulfilled, (state, action) => {
        state.loading = false;
        state.error = undefined;
        state.list = state.list.filter((b) => b.id !== action.payload);
      })
      .addCase(deleteBorrowingFromRepo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to delete borrowing";
      });
  },
});

export const { setAllBorrowings, clearBorrowings } = borrowingSlice.actions;

export const selectBorrowings = (s: RootState) => s.borrowings.list;
export const selectBorrowingsLoading = (s: RootState) => s.borrowings.loading;
export const selectBorrowingsError = (s: RootState) => s.borrowings.error;

export default borrowingSlice.reducer;
