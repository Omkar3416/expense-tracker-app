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
 * ✅ UID-based Firestore path (STRICT):
 * users/{uid}/transactions/{txId}
 * users/{uid}/deletedTransactions/{txId}
 */
function txCol(uid: string) {
  return collection(db, "users", uid, "transactions");
}

function deletedTxCol(uid: string) {
  return collection(db, "users", uid, "deletedTransactions");
}

/* ---------------- debug helpers (logs only) ---------------- */

function getProjectId(): string | null {
  // FirebaseOptions.projectId exists and is typed
  return typeof db.app.options.projectId === "string" ? db.app.options.projectId : null;
}

function debugEnabled(): boolean {
  // Logs only in browser + dev to avoid noisy production logs
  return (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production")
  );
}

function logWrite(tag: string, payload: Record<string, unknown>) {
  if (!debugEnabled()) return;
  console.debug(`[firestore][transactions] ${tag}`, {
    projectId: getProjectId(),
    ...payload,
  });
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

function normalizeTx(id: string, data: unknown): Transaction {
  const now = new Date().toISOString();
  const d = asRecord(data);

  const amount = isFiniteNumber(d.amount) ? d.amount : 0;
  const category = isNonEmptyString(d.category) ? d.category : "Other";
  const note = isNonEmptyString(d.note) ? d.note : undefined;
  const date = isNonEmptyString(d.date) ? d.date : now;
  const type = d.type === "income" || d.type === "expense" ? d.type : "expense";

  const createdAt = isNonEmptyString(d.createdAt) ? d.createdAt : now;
  const updatedAt = isNonEmptyString(d.updatedAt) ? d.updatedAt : null;

  const createdByUid = isString(d.createdByUid) ? d.createdByUid : undefined;
  const createdByEmail = isStringOrNull(d.createdByEmail) ? d.createdByEmail : undefined;

  const updatedByUid = isString(d.updatedByUid) ? d.updatedByUid : undefined;
  const updatedByEmail = isStringOrNull(d.updatedByEmail) ? d.updatedByEmail : undefined;

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

export async function fetchUserTransactions(uid: string): Promise<Transaction[]> {
  logWrite("fetch:start", { uid, collectionPath: `users/${uid}/transactions` });

  const q = query(txCol(uid), orderBy("date", "desc"));
  const snap = await getDocs(q);

  const list: Transaction[] = [];
  snap.forEach((d) => {
    list.push(normalizeTx(d.id, d.data()));
  });

  logWrite("fetch:done", { uid, count: list.length });
  return list;
}

export async function fetchUserDeletedTransactions(uid: string): Promise<Transaction[]> {
  logWrite("fetchDeleted:start", { uid, collectionPath: `users/${uid}/deletedTransactions` });

  const q = query(deletedTxCol(uid), orderBy("date", "desc"));
  const snap = await getDocs(q);

  const list: Transaction[] = [];
  snap.forEach((d) => {
    list.push(normalizeTx(d.id, d.data()));
  });

  logWrite("fetchDeleted:done", { uid, count: list.length });
  return list;
}

export async function createOrReplaceTransaction(uid: string, tx: Transaction): Promise<void> {
  const ref = doc(db, "users", uid, "transactions", tx.id);

  logWrite("upsert:start", {
    uid,
    id: tx.id,
    docPath: ref.path,
    type: tx.type,
    amount: tx.amount,
  });

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

  logWrite("upsert:done", { uid, id: tx.id, docPath: ref.path });
}

export async function createOrReplaceDeletedTransaction(
  uid: string,
  tx: Transaction
): Promise<void> {
  const ref = doc(db, "users", uid, "deletedTransactions", tx.id);

  logWrite("upsertDeleted:start", { uid, id: tx.id, docPath: ref.path });

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

  logWrite("upsertDeleted:done", { uid, id: tx.id, docPath: ref.path });
}

export async function deleteTransactionById(uid: string, id: string): Promise<void> {
  const ref = doc(db, "users", uid, "transactions", id);

  logWrite("delete:start", { uid, id, docPath: ref.path });
  await deleteDoc(ref);
  logWrite("delete:done", { uid, id, docPath: ref.path });
}

export async function deleteDeletedTransactionById(uid: string, id: string): Promise<void> {
  const ref = doc(db, "users", uid, "deletedTransactions", id);

  logWrite("deleteDeleted:start", { uid, id, docPath: ref.path });
  await deleteDoc(ref);
  logWrite("deleteDeleted:done", { uid, id, docPath: ref.path });
}

export async function deleteAllDeletedTransactions(uid: string): Promise<void> {
  logWrite("deleteAllDeleted:start", { uid });

  const snap = await getDocs(deletedTxCol(uid));
  const deletes: Promise<void>[] = [];

  snap.forEach((d) => {
    deletes.push(deleteDoc(d.ref));
  });

  await Promise.all(deletes);

  logWrite("deleteAllDeleted:done", { uid, deletedCount: snap.size });
}
