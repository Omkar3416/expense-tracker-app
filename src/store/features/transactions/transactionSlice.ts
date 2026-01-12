// src/store/features/transactions/transactionSlice.ts

import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  repoFetchTransactions,
  repoUpsertTransaction,
  repoDeleteTransaction,
} from "@/lib/repository/transactionsRepo";

export type Transaction = {
  id: string;
  amount: number;
  category: string;
  note?: string;

  // ✅ transaction date (the date user selects)
  date: string;

  type: "income" | "expense";

  // ✅ audit
  createdAt: string;
  updatedAt: string | null;

  createdByUid?: string;
  createdByEmail?: string | null;

  updatedByUid?: string;
  updatedByEmail?: string | null;
};

type TransactionState = {
  list: Transaction[];
  loading: boolean;
  error?: string;
};

const initialState: TransactionState = {
  list: [],
  loading: false,
  error: undefined,
};

// ✅ Load from repo
export const fetchTransactions = createAsyncThunk<Transaction[], { uid?: string }>(
  "transactions/fetchTransactions",
  async ({ uid }) => await repoFetchTransactions(uid)
);

// ✅ UPSERT (add or edit)
export const upsertTransactionToRepo = createAsyncThunk<
  Transaction,
  { uid?: string; tx: Transaction }
>("transactions/upsertTransactionToRepo", async ({ uid, tx }) => {
  return await repoUpsertTransaction(uid, tx);
});

// ✅ Delete
export const deleteTransactionFromRepo = createAsyncThunk<
  string,
  { uid?: string; id: string }
>("transactions/deleteTransactionFromRepo", async ({ uid, id }) => {
  return await repoDeleteTransaction(uid, id);
});

const transactionSlice = createSlice({
  name: "transactions",
  initialState,
  reducers: {
    setAllTransactions: (state, action: PayloadAction<Transaction[]>) => {
      state.list = action.payload;
    },
    clearTransactions: (state) => {
      state.list = [];
      state.loading = false;
      state.error = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetch
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load transactions";
      })

      // upsert
      .addCase(upsertTransactionToRepo.fulfilled, (state, action) => {
        const idx = state.list.findIndex((t) => t.id === action.payload.id);
        if (idx >= 0) state.list[idx] = action.payload;
        else state.list.unshift(action.payload);
      })
      .addCase(upsertTransactionToRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to save transaction";
      })

      // delete
      .addCase(deleteTransactionFromRepo.fulfilled, (state, action) => {
        state.list = state.list.filter((t) => t.id !== action.payload);
      })
      .addCase(deleteTransactionFromRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to delete transaction";
      });
  },
});

export const { setAllTransactions, clearTransactions } = transactionSlice.actions;
export default transactionSlice.reducer;
