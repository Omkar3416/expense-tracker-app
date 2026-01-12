// src/lib/firestore/transactions.ts

import { db } from "@/lib/firebaseClient";
import type { Transaction } from "@/store/features/transactions/transactionSlice";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

/**
 * ✅ userKey = emailLowercase
 * Example: "demo@gmail.com"
 */
function txCol(userKey: string) {
  return collection(db, "users", userKey, "transactions");
}

function deletedTxCol(userKey: string) {
  return collection(db, "users", userKey, "deletedTransactions");
}

type FirestoreTxData = Partial<Record<keyof Transaction, unknown>> &
  Record<string, unknown>;

function normalizeTx(id: string, data: unknown): Transaction {
  const now = new Date().toISOString();
  const d = (data ?? {}) as FirestoreTxData;

  const amount =
    typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : 0;

  const category =
    typeof d.category === "string" && d.category.trim().length > 0
      ? d.category
      : "Other";

  const note =
    typeof d.note === "string" && d.note.trim().length > 0 ? d.note : undefined;

  const date =
    typeof d.date === "string" && d.date.trim().length > 0 ? d.date : now;

  const type = d.type === "income" || d.type === "expense" ? d.type : "expense";

  const createdAt =
    typeof d.createdAt === "string" && d.createdAt.trim().length > 0
      ? d.createdAt
      : now;

  const updatedAt =
    typeof d.updatedAt === "string" && d.updatedAt.trim().length > 0
      ? d.updatedAt
      : null;

  const createdByUid =
    typeof d.createdByUid === "string" ? d.createdByUid : undefined;

  const createdByEmail =
    typeof d.createdByEmail === "string" || d.createdByEmail === null
      ? (d.createdByEmail as string | null)
      : undefined;

  const updatedByUid =
    typeof d.updatedByUid === "string" ? d.updatedByUid : undefined;

  const updatedByEmail =
    typeof d.updatedByEmail === "string" || d.updatedByEmail === null
      ? (d.updatedByEmail as string | null)
      : undefined;

  return {
    id,
    amount,
    category,
    note,
    date,
    type,
    createdAt,
    updatedAt,
    createdByUid,
    createdByEmail,
    updatedByUid,
    updatedByEmail,
  };
}

export async function fetchUserTransactions(userKey: string): Promise<Transaction[]> {
  const q = query(txCol(userKey), orderBy("date", "desc"));
  const snap = await getDocs(q);

  const list: Transaction[] = [];
  snap.forEach((d) => {
    list.push(normalizeTx(d.id, d.data()));
  });

  return list;
}

export async function fetchUserDeletedTransactions(
  userKey: string
): Promise<Transaction[]> {
  const q = query(deletedTxCol(userKey), orderBy("date", "desc"));
  const snap = await getDocs(q);

  const list: Transaction[] = [];
  snap.forEach((d) => {
    list.push(normalizeTx(d.id, d.data()));
  });

  return list;
}

export async function createOrReplaceTransaction(userKey: string, tx: Transaction) {
  const ref = doc(db, "users", userKey, "transactions", tx.id);

  await setDoc(
    ref,
    {
      amount: tx.amount,
      category: tx.category,
      note: tx.note ?? "",
      date: tx.date,
      type: tx.type,

      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt ?? null,

      createdByUid: tx.createdByUid ?? null,
      createdByEmail: tx.createdByEmail ?? null,

      updatedByUid: tx.updatedByUid ?? null,
      updatedByEmail: tx.updatedByEmail ?? null,
    },
    { merge: true }
  );
}

export async function createOrReplaceDeletedTransaction(
  userKey: string,
  tx: Transaction
) {
  const ref = doc(db, "users", userKey, "deletedTransactions", tx.id);

  await setDoc(
    ref,
    {
      amount: tx.amount,
      category: tx.category,
      note: tx.note ?? "",
      date: tx.date,
      type: tx.type,

      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt ?? null,

      createdByUid: tx.createdByUid ?? null,
      createdByEmail: tx.createdByEmail ?? null,

      updatedByUid: tx.updatedByUid ?? null,
      updatedByEmail: tx.updatedByEmail ?? null,

      deletedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function deleteTransactionById(userKey: string, id: string) {
  const ref = doc(db, "users", userKey, "transactions", id);
  await deleteDoc(ref);
}

export async function deleteDeletedTransactionById(userKey: string, id: string) {
  const ref = doc(db, "users", userKey, "deletedTransactions", id);
  await deleteDoc(ref);
}

export async function deleteAllDeletedTransactions(userKey: string) {
  const snap = await getDocs(deletedTxCol(userKey));
  const deletes: Promise<void>[] = [];

  snap.forEach((d) => {
    deletes.push(deleteDoc(d.ref));
  });

  await Promise.all(deletes);
}
