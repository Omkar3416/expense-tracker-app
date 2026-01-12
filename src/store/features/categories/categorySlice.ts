// src/store/features/categories/categorySlice.ts

import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  repoFetchCategories,
  repoUpsertCategory,
  repoDeleteCategory,
} from "@/lib/repository/categoriesRepo";

export type CategoryType = "transaction" | "reminder";

export type Category = {
  id: string;

  // ✅ display name (user enters this)
  name: string;

  // ✅ "transaction" (DMart/Kirana/Petrol) OR "reminder" (Light bill/LIC/Loan)
  type: CategoryType;

  // ✅ optional future-proof fields
  icon?: string;
  color?: string;
  sortOrder?: number;

  // ✅ audit
  createdAt: string;
  updatedAt: string | null;

  createdByUid?: string;
  createdByEmail?: string | null;

  updatedByUid?: string;
  updatedByEmail?: string | null;
};

type CategoryState = {
  list: Category[];
  loading: boolean;
  error?: string;
};

const initialState: CategoryState = {
  list: [],
  loading: false,
  error: undefined,
};

// ✅ Load from repo
export const fetchCategories = createAsyncThunk<Category[], { uid?: string }>(
  "categories/fetchCategories",
  async ({ uid }) => await repoFetchCategories(uid)
);

// ✅ UPSERT (add or edit)
export const upsertCategoryToRepo = createAsyncThunk<
  Category,
  { uid?: string; category: Category }
>("categories/upsertCategoryToRepo", async ({ uid, category }) => {
  return await repoUpsertCategory(uid, category);
});

// ✅ Delete
export const deleteCategoryFromRepo = createAsyncThunk<
  string,
  { uid?: string; id: string }
>("categories/deleteCategoryFromRepo", async ({ uid, id }) => {
  return await repoDeleteCategory(uid, id);
});

const categorySlice = createSlice({
  name: "categories",
  initialState,
  reducers: {
    setAllCategories: (state, action: PayloadAction<Category[]>) => {
      state.list = action.payload;
    },

    clearCategories: (state) => {
      state.list = [];
      state.loading = false;
      state.error = undefined;
    },
  },

  extraReducers: (builder) => {
    builder
      // fetch
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load categories";
      })

      // upsert
      .addCase(upsertCategoryToRepo.fulfilled, (state, action) => {
        const idx = state.list.findIndex((c) => c.id === action.payload.id);
        if (idx >= 0) state.list[idx] = action.payload;
        else state.list.unshift(action.payload);
      })
      .addCase(upsertCategoryToRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to save category";
      })

      // delete
      .addCase(deleteCategoryFromRepo.fulfilled, (state, action) => {
        state.list = state.list.filter((c) => c.id !== action.payload);
      })
      .addCase(deleteCategoryFromRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to delete category";
      });
  },
});

export const { setAllCategories, clearCategories } = categorySlice.actions;
export default categorySlice.reducer;
