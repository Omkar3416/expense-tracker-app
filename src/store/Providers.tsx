// src/store/Providers.tsx
"use client";

import { Provider } from "react-redux";
import { store } from "./store";
import { useEffect, useRef } from "react";

import { AuthProvider, useAuthUser } from "@/store/AuthProvider";

import { fetchTransactions } from "@/store/features/transactions/transactionSlice";
import { fetchBorrowings } from "@/store/features/borrowings/borrowingSlice";

// ✅ NEW: load categories + reminders (offline-first later)
import { fetchCategories } from "@/store/features/categories/categorySlice";
import { fetchReminders } from "@/store/features/reminders/reminderSlice";

function BootLoader({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const uid = user?.uid;

  // ✅ Prevent double-dispatch in Next.js strict mode dev
  const didRunRef = useRef<string | null>(null);

  useEffect(() => {
    // ✅ Build a stable key for this session
    const key = uid ?? "guest";

    // ✅ avoid duplicate dispatch for same uid
    if (didRunRef.current === key) return;
    didRunRef.current = key;

    // ✅ Transactions (offline-first + sync)
    store.dispatch(fetchTransactions({ uid }));

    // ✅ Borrowings (offline-first + sync)
    store.dispatch(fetchBorrowings({ uid }));

    // ✅ Categories (transaction + reminder categories)
    store.dispatch(fetchCategories({ uid }));

    // ✅ Reminders
    store.dispatch(fetchReminders({ uid }));
  }, [uid]);

  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthProvider>
        <BootLoader>{children}</BootLoader>
      </AuthProvider>
    </Provider>
  );
}
