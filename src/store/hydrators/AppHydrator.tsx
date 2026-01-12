"use client";

import { useEffect } from "react";
import { useAuthUser } from "@/store/AuthProvider";
import { useAppDispatch } from "@/store/hooks";

import { fetchTransactions } from "@/store/features/transactions/transactionSlice";
import { loadBorrowings } from "@/lib/storage";
import { setAllBorrowings } from "@/store/features/borrowings/borrowingSlice";

/**
 * AppHydrator:
 * - Hydrates transactions using repo (AUTO/FIRESTORE/LOCAL)
 * - Hydrates borrowings from localStorage (for now)
 *
 * This runs once and also re-runs when user changes (login/logout).
 */
export default function AppHydrator() {
  const user = useAuthUser();
  const uid = user?.uid;

  const dispatch = useAppDispatch();

  // ✅ Borrowings (local only for now)
  useEffect(() => {
    dispatch(setAllBorrowings(loadBorrowings()));
  }, [dispatch]);

  // ✅ Transactions (repo will decide: firestore/local/auto)
  useEffect(() => {
    dispatch(fetchTransactions({ uid }));
  }, [uid, dispatch]);

  return null;
}
