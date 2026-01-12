import { configureStore } from "@reduxjs/toolkit";
import transactionsReducer from "./features/transactions/transactionSlice";
import borrowingsReducer from "./features/borrowings/borrowingSlice";

// ✅ NEW reducers
import categoriesReducer from "./features/categories/categorySlice";
import remindersReducer from "./features/reminders/reminderSlice";

export const store = configureStore({
  reducer: {
    transactions: transactionsReducer,
    borrowings: borrowingsReducer,

    // ✅ NEW
    categories: categoriesReducer,
    reminders: remindersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
