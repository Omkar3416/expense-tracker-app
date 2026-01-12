// src/lib/firestore/borrowings.ts

import { db } from "@/lib/firebaseClient";
import type {
  Borrowing,
  BorrowingPayment,
} from "@/store/features/borrowings/borrowingSlice";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

function borrowingsCol(userKey: string) {
  return collection(db, "users", userKey, "borrowings");
}

function deletedBorrowingsCol(userKey: string) {
  return collection(db, "users", userKey, "deletedBorrowings");
}

type FirestoreBorrowData =
  Partial<Record<keyof Borrowing, unknown>> & Record<string, unknown>;

function normalizePayments(raw: unknown): BorrowingPayment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((p) => {
      const x = p as Partial<{ amount: unknown; date: unknown }>;
      const amt =
        typeof x.amount === "number" && Number.isFinite(x.amount) ? x.amount : 0;
      const date =
        typeof x.date === "string" && x.date.trim().length > 0 ? x.date : "";
      if (!date || amt <= 0) return null;
      return { amount: amt, date };
    })
    .filter(Boolean) as BorrowingPayment[];
}

function normalizeBorrowing(id: string, data: unknown): Borrowing {
  const now = new Date().toISOString();
  const d = (data ?? {}) as FirestoreBorrowData;

  const person = typeof d.person === "string" ? d.person : "";

  const amount =
    typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : 0;

  const amountPaid =
    typeof d.amountPaid === "number" && Number.isFinite(d.amountPaid)
      ? d.amountPaid
      : 0;

  const payments = normalizePayments(d.payments);

  const type = d.type === "borrowed" || d.type === "lent" ? d.type : "borrowed";

  const category =
    d.category === "friend" ||
    d.category === "family" ||
    d.category === "business"
      ? d.category
      : "friend";

  const dueDate = typeof d.dueDate === "string" ? d.dueDate : "";

  const note =
    typeof d.note === "string" && d.note.trim().length > 0 ? d.note : undefined;

  const status =
    d.status === "paid" || d.status === "pending" ? d.status : "pending";

  const createdAt =
    typeof d.createdAt === "string" && d.createdAt.trim().length > 0
      ? d.createdAt
      : now;

  const updatedAt =
    typeof d.updatedAt === "string" && d.updatedAt.trim().length > 0
      ? d.updatedAt
      : null;

  const paidAt =
    typeof d.paidAt === "string" && d.paidAt.trim().length > 0 ? d.paidAt : null;

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
    person,
    amount,
    amountPaid,
    payments,
    type,
    category,
    dueDate,
    note,
    status,
    createdAt,
    updatedAt,
    createdByUid,
    createdByEmail,
    updatedByUid,
    updatedByEmail,
    paidAt,
  };
}

export async function fetchUserBorrowings(userKey: string): Promise<Borrowing[]> {
  const q = query(borrowingsCol(userKey), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list: Borrowing[] = [];
  snap.forEach((d) => {
    list.push(normalizeBorrowing(d.id, d.data()));
  });

  return list;
}

export async function fetchUserDeletedBorrowings(
  userKey: string
): Promise<Borrowing[]> {
  const q = query(deletedBorrowingsCol(userKey), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list: Borrowing[] = [];
  snap.forEach((d) => {
    list.push(normalizeBorrowing(d.id, d.data()));
  });

  return list;
}

export async function createOrReplaceBorrowing(userKey: string, b: Borrowing) {
  const ref = doc(db, "users", userKey, "borrowings", b.id);

  await setDoc(
    ref,
    {
      person: b.person,
      amount: b.amount,
      amountPaid: b.amountPaid,
      payments: Array.isArray(b.payments) ? b.payments : [],

      type: b.type,
      category: b.category,
      dueDate: b.dueDate,
      note: b.note ?? "",
      status: b.status,

      createdAt: b.createdAt,
      updatedAt: b.updatedAt ?? null,

      createdByUid: b.createdByUid ?? null,
      createdByEmail: b.createdByEmail ?? null,

      updatedByUid: b.updatedByUid ?? null,
      updatedByEmail: b.updatedByEmail ?? null,

      paidAt: b.paidAt,
    },
    { merge: true }
  );
}

export async function createOrReplaceDeletedBorrowing(
  userKey: string,
  b: Borrowing
) {
  const ref = doc(db, "users", userKey, "deletedBorrowings", b.id);

  await setDoc(
    ref,
    {
      person: b.person,
      amount: b.amount,
      amountPaid: b.amountPaid,
      payments: Array.isArray(b.payments) ? b.payments : [],

      type: b.type,
      category: b.category,
      dueDate: b.dueDate,
      note: b.note ?? "",
      status: b.status,

      createdAt: b.createdAt,
      updatedAt: b.updatedAt ?? null,

      createdByUid: b.createdByUid ?? null,
      createdByEmail: b.createdByEmail ?? null,

      updatedByUid: b.updatedByUid ?? null,
      updatedByEmail: b.updatedByEmail ?? null,

      paidAt: b.paidAt,

      deletedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function deleteBorrowingById(userKey: string, id: string) {
  const ref = doc(db, "users", userKey, "borrowings", id);
  await deleteDoc(ref);
}

export async function deleteDeletedBorrowingById(userKey: string, id: string) {
  const ref = doc(db, "users", userKey, "deletedBorrowings", id);
  await deleteDoc(ref);
}

export async function deleteAllDeletedBorrowings(userKey: string) {
  const snap = await getDocs(deletedBorrowingsCol(userKey));
  const deletes: Promise<void>[] = [];

  snap.forEach((d) => {
    deletes.push(deleteDoc(d.ref));
  });

  await Promise.all(deletes);
}
