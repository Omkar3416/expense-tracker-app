// src/store/features/reminders/reminderSlice.ts

import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  repoFetchReminders,
  repoUpsertReminder,
  repoDeleteReminder,
} from "@/lib/repository/remindersRepo";

export type ReminderFrequency = "once" | "monthly" | "yearly" | "custom";
export type ReminderStatus = "active" | "paused" | "completed";

export type Reminder = {
  id: string;

  title: string;
  categoryId: string;

  amount?: number;
  note?: string;

  // ✅ main selected due date
  dueDate: string;

  // ✅ next notification date (used later with FCM)
  nextTriggerDate: string;

  frequency: ReminderFrequency;
  intervalDays?: number; // for custom
  repeatEvery?: number; // optional

  // ✅ start/stop/pause/resume
  status: ReminderStatus;
  pausedAt?: string | null;
  completedAt?: string | null;

  // ✅ when user marks reminder as paid, we can create tx and link it
  linkedTransactionId?: string | null;

  // ✅ audit
  createdAt: string;
  updatedAt: string | null;

  createdByUid?: string;
  createdByEmail?: string | null;

  updatedByUid?: string;
  updatedByEmail?: string | null;
};

type ReminderState = {
  list: Reminder[];
  loading: boolean;
  error?: string;
};

const initialState: ReminderState = {
  list: [],
  loading: false,
  error: undefined,
};

// ✅ Load from repo
export const fetchReminders = createAsyncThunk<Reminder[], { uid?: string }>(
  "reminders/fetchReminders",
  async ({ uid }) => await repoFetchReminders(uid)
);

// ✅ Upsert (add/edit)
export const upsertReminderToRepo = createAsyncThunk<
  Reminder,
  { uid?: string; reminder: Reminder }
>("reminders/upsertReminderToRepo", async ({ uid, reminder }) => {
  return await repoUpsertReminder(uid, reminder);
});

// ✅ Delete
export const deleteReminderFromRepo = createAsyncThunk<
  string,
  { uid?: string; id: string }
>("reminders/deleteReminderFromRepo", async ({ uid, id }) => {
  return await repoDeleteReminder(uid, id);
});

const reminderSlice = createSlice({
  name: "reminders",
  initialState,
  reducers: {
    setAllReminders: (state, action: PayloadAction<Reminder[]>) => {
      state.list = action.payload;
    },

    clearReminders: (state) => {
      state.list = [];
      state.loading = false;
      state.error = undefined;
    },
  },

  extraReducers: (builder) => {
    builder
      // fetch
      .addCase(fetchReminders.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchReminders.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchReminders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load reminders";
      })

      // upsert
      .addCase(upsertReminderToRepo.fulfilled, (state, action) => {
        const idx = state.list.findIndex((r) => r.id === action.payload.id);
        if (idx >= 0) state.list[idx] = action.payload;
        else state.list.unshift(action.payload);
      })
      .addCase(upsertReminderToRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to save reminder";
      })

      // delete
      .addCase(deleteReminderFromRepo.fulfilled, (state, action) => {
        state.list = state.list.filter((r) => r.id !== action.payload);
      })
      .addCase(deleteReminderFromRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to delete reminder";
      });
  },
});

export const { setAllReminders, clearReminders } = reminderSlice.actions;
export default reminderSlice.reducer;
