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

  // ✅ due date-time stored as ISO (UTC)
  dueDate: string;

  /**
   * ✅ New (optional): exact time selection (HH:mm) and timezone label.
   * - Keeps backward compatibility (old reminders have no dueTime).
   * - If missing dueTime, we assume "12:00" IST.
   */
  dueTime?: string; // "HH:mm" e.g. "08:30"
  timezone?: "Asia/Kolkata";

  // ✅ next notification date-time (ISO UTC)
  nextTriggerDate: string;

  frequency: ReminderFrequency;
  intervalDays?: number; // for custom
  repeatEvery?: number; // optional

  status: ReminderStatus;
  pausedAt?: string | null;
  completedAt?: string | null;

  linkedTransactionId?: string | null;

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

export const fetchReminders = createAsyncThunk<Reminder[], { uid?: string }>(
  "reminders/fetchReminders",
  async ({ uid }) => await repoFetchReminders(uid)
);

export const upsertReminderToRepo = createAsyncThunk<
  Reminder,
  { uid?: string; reminder: Reminder }
>("reminders/upsertReminderToRepo", async ({ uid, reminder }) => {
  return await repoUpsertReminder(uid, reminder);
});

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

      .addCase(upsertReminderToRepo.fulfilled, (state, action) => {
        const idx = state.list.findIndex((r) => r.id === action.payload.id);
        if (idx >= 0) state.list[idx] = action.payload;
        else state.list.unshift(action.payload);
      })
      .addCase(upsertReminderToRepo.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to save reminder";
      })

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
