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

/**
 * ✅ UID-based Firestore path (STRICT):
 * users/{uid}/borrowings/{id}
 * users/{uid}/deletedBorrowings/{id}
 */
function borrowingsCol(uid: string) {
  return collection(db, "users", uid, "borrowings");
}

function deletedBorrowingsCol(uid: string) {
  return collection(db, "users", uid, "deletedBorrowings");
}

/* ---------------- safe helpers ---------------- */

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  if (value && typeof value === "object") return value as AnyRecord;
  return {};
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isStringOrNull(v: unknown): v is string | null {
  return typeof v === "string" || v === null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function normalizePayments(raw: unknown): BorrowingPayment[] {
  if (!Array.isArray(raw)) return [];

  const out: BorrowingPayment[] = [];

  for (const p of raw) {
    const rec = asRecord(p);

    const amt = isFiniteNumber(rec.amount) ? rec.amount : 0;
    const date = isNonEmptyString(rec.date) ? rec.date : "";

    if (!date || amt <= 0) continue;

    out.push({ amount: amt, date });
  }

  return out;
}

function normalizeBorrowing(id: string, data: unknown): Borrowing {
  const now = new Date().toISOString();
  const d = asRecord(data);

  const person = isString(d.person) ? d.person : "";

  const amount = isFiniteNumber(d.amount) ? d.amount : 0;

  const amountPaid = isFiniteNumber(d.amountPaid) ? d.amountPaid : 0;

  const payments = normalizePayments(d.payments);

  const type = d.type === "borrowed" || d.type === "lent" ? d.type : "borrowed";

  const category =
    d.category === "friend" ||
    d.category === "family" ||
    d.category === "business"
      ? d.category
      : "friend";

  const dueDate = isString(d.dueDate) ? d.dueDate : "";

  const note = isNonEmptyString(d.note) ? d.note : undefined;

  const status = d.status === "paid" || d.status === "pending" ? d.status : "pending";

  const createdAt = isNonEmptyString(d.createdAt) ? d.createdAt : now;

  const updatedAt = isNonEmptyString(d.updatedAt) ? d.updatedAt : null;

  const paidAt = isNonEmptyString(d.paidAt) ? d.paidAt : null;

  const createdByUid = isString(d.createdByUid) ? d.createdByUid : undefined;

  const createdByEmail = isStringOrNull(d.createdByEmail) ? d.createdByEmail : undefined;

  const updatedByUid = isString(d.updatedByUid) ? d.updatedByUid : undefined;

  const updatedByEmail = isStringOrNull(d.updatedByEmail) ? d.updatedByEmail : undefined;

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

export async function fetchUserBorrowings(uid: string): Promise<Borrowing[]> {
  const q = query(borrowingsCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list: Borrowing[] = [];
  snap.forEach((d) => {
    list.push(normalizeBorrowing(d.id, d.data()));
  });

  return list;
}

export async function fetchUserDeletedBorrowings(uid: string): Promise<Borrowing[]> {
  const q = query(deletedBorrowingsCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list: Borrowing[] = [];
  snap.forEach((d) => {
    list.push(normalizeBorrowing(d.id, d.data()));
  });

  return list;
}

export async function createOrReplaceBorrowing(uid: string, b: Borrowing): Promise<void> {
  const ref = doc(db, "users", uid, "borrowings", b.id);

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
  uid: string,
  b: Borrowing
): Promise<void> {
  const ref = doc(db, "users", uid, "deletedBorrowings", b.id);

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

export async function deleteBorrowingById(uid: string, id: string): Promise<void> {
  const ref = doc(db, "users", uid, "borrowings", id);
  await deleteDoc(ref);
}

export async function deleteDeletedBorrowingById(
  uid: string,
  id: string
): Promise<void> {
  const ref = doc(db, "users", uid, "deletedBorrowings", id);
  await deleteDoc(ref);
}

export async function deleteAllDeletedBorrowings(uid: string): Promise<void> {
  const snap = await getDocs(deletedBorrowingsCol(uid));
  const deletes: Promise<void>[] = [];

  snap.forEach((d) => {
    deletes.push(deleteDoc(d.ref));
  });

  await Promise.all(deletes);
}
