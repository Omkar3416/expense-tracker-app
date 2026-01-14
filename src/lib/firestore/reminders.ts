// src/lib/firestore/reminders.ts

import { db } from "@/lib/firebaseClient";
import type { Reminder } from "@/store/features/reminders/reminderSlice";

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
 * ✅ userKey = UID (NOT email)
 * Firestore path:
 * - users/{uid}/reminders/{reminderId}
 * - users/{uid}/deletedReminders/{reminderId}
 */
function remindersCol(uid: string) {
  return collection(db, "users", uid, "reminders");
}

function deletedRemindersCol(uid: string) {
  return collection(db, "users", uid, "deletedReminders");
}

/* ---------------- debug helpers (logs only) ---------------- */

function getProjectId(): string | null {
  return typeof db.app.options.projectId === "string" ? db.app.options.projectId : null;
}

function debugEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production")
  );
}

function logWrite(tag: string, payload: Record<string, unknown>) {
  if (!debugEnabled()) return;
  console.debug(`[firestore][reminders] ${tag}`, {
    projectId: getProjectId(),
    ...payload,
  });
}

/* ---------------- normalizers ---------------- */

type FirestoreReminderData = Partial<Record<keyof Reminder, unknown>> &
  Record<string, unknown>;

function normalizeReminder(id: string, data: unknown): Reminder {
  const now = new Date().toISOString();
  const d = (data ?? {}) as FirestoreReminderData;

  const title =
    typeof d.title === "string" && d.title.trim().length > 0
      ? d.title.trim()
      : "Untitled Reminder";

  const categoryId =
    typeof d.categoryId === "string" && d.categoryId.trim().length > 0
      ? d.categoryId
      : "";

  const amount =
    typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : undefined;

  const note =
    typeof d.note === "string" && d.note.trim().length > 0 ? d.note : undefined;

  const dueDate =
    typeof d.dueDate === "string" && d.dueDate.trim().length > 0 ? d.dueDate : now;

  const nextTriggerDate =
    typeof d.nextTriggerDate === "string" && d.nextTriggerDate.trim().length > 0
      ? d.nextTriggerDate
      : dueDate;

  const frequency =
    d.frequency === "once" ||
    d.frequency === "monthly" ||
    d.frequency === "yearly" ||
    d.frequency === "custom"
      ? d.frequency
      : "once";

  const intervalDays =
    typeof d.intervalDays === "number" && Number.isFinite(d.intervalDays)
      ? d.intervalDays
      : undefined;

  const repeatEvery =
    typeof d.repeatEvery === "number" && Number.isFinite(d.repeatEvery)
      ? d.repeatEvery
      : undefined;

  const status =
    d.status === "active" || d.status === "paused" || d.status === "completed"
      ? d.status
      : "active";

  const pausedAt =
    typeof d.pausedAt === "string" || d.pausedAt === null
      ? (d.pausedAt as string | null)
      : undefined;

  const completedAt =
    typeof d.completedAt === "string" || d.completedAt === null
      ? (d.completedAt as string | null)
      : undefined;

  const linkedTransactionId =
    typeof d.linkedTransactionId === "string" || d.linkedTransactionId === null
      ? (d.linkedTransactionId as string | null)
      : undefined;

  const createdAt =
    typeof d.createdAt === "string" && d.createdAt.trim().length > 0 ? d.createdAt : now;

  const updatedAt =
    typeof d.updatedAt === "string" && d.updatedAt.trim().length > 0 ? d.updatedAt : null;

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
    title,
    categoryId,
    amount,
    note,
    dueDate,
    nextTriggerDate,
    frequency,
    intervalDays,
    repeatEvery,
    status,
    pausedAt,
    completedAt,
    linkedTransactionId,
    createdAt,
    updatedAt,
    createdByUid,
    createdByEmail,
    updatedByUid,
    updatedByEmail,
  };
}

export async function fetchUserReminders(uid: string): Promise<Reminder[]> {
  logWrite("fetch:start", { uid, collectionPath: `users/${uid}/reminders` });

  const q = query(remindersCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list: Reminder[] = [];
  snap.forEach((d) => {
    list.push(normalizeReminder(d.id, d.data()));
  });

  logWrite("fetch:done", { uid, count: list.length });
  return list;
}

export async function createOrReplaceReminder(uid: string, r: Reminder) {
  const ref = doc(db, "users", uid, "reminders", r.id);

  logWrite("upsert:start", {
    uid,
    id: r.id,
    docPath: ref.path,
    title: r.title,
    frequency: r.frequency,
  });

  await setDoc(
    ref,
    {
      title: r.title,
      categoryId: r.categoryId,
      amount: typeof r.amount === "number" ? r.amount : null,
      note: r.note ?? "",

      dueDate: r.dueDate,
      nextTriggerDate: r.nextTriggerDate,

      frequency: r.frequency,
      intervalDays: typeof r.intervalDays === "number" ? r.intervalDays : null,
      repeatEvery: typeof r.repeatEvery === "number" ? r.repeatEvery : null,

      status: r.status,
      pausedAt: r.pausedAt ?? null,
      completedAt: r.completedAt ?? null,

      linkedTransactionId: r.linkedTransactionId ?? null,

      createdAt: r.createdAt,
      updatedAt: r.updatedAt ?? null,

      createdByUid: r.createdByUid ?? null,
      createdByEmail: r.createdByEmail ?? null,

      updatedByUid: r.updatedByUid ?? null,
      updatedByEmail: r.updatedByEmail ?? null,
    },
    { merge: true }
  );

  logWrite("upsert:done", { uid, id: r.id, docPath: ref.path });
}

export async function deleteReminderById(uid: string, id: string) {
  const ref = doc(db, "users", uid, "reminders", id);

  logWrite("delete:start", { uid, id, docPath: ref.path });
  await deleteDoc(ref);
  logWrite("delete:done", { uid, id, docPath: ref.path });
}

/**
 * ✅ Optional: keep deleted reminders history in Firestore too
 * Path: users/{uid}/deletedReminders/{id}
 */
export async function writeDeletedReminder(uid: string, r: Reminder) {
  const ref = doc(db, "users", uid, "deletedReminders", r.id);

  logWrite("writeDeleted:start", { uid, id: r.id, docPath: ref.path });

  await setDoc(
    ref,
    {
      ...r,
      amount: typeof r.amount === "number" ? r.amount : null,
      note: r.note ?? "",
      intervalDays: typeof r.intervalDays === "number" ? r.intervalDays : null,
      repeatEvery: typeof r.repeatEvery === "number" ? r.repeatEvery : null,
      pausedAt: r.pausedAt ?? null,
      completedAt: r.completedAt ?? null,
      linkedTransactionId: r.linkedTransactionId ?? null,
      updatedAt: r.updatedAt ?? new Date().toISOString(),
      createdByUid: r.createdByUid ?? null,
      createdByEmail: r.createdByEmail ?? null,
      updatedByUid: r.updatedByUid ?? null,
      updatedByEmail: r.updatedByEmail ?? null,
    },
    { merge: true }
  );

  logWrite("writeDeleted:done", { uid, id: r.id, docPath: ref.path });
}

export async function fetchUserDeletedReminders(uid: string): Promise<Reminder[]> {
  logWrite("fetchDeleted:start", { uid, collectionPath: `users/${uid}/deletedReminders` });

  const q = query(deletedRemindersCol(uid), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);

  const list: Reminder[] = [];
  snap.forEach((d) => {
    list.push(normalizeReminder(d.id, d.data()));
  });

  logWrite("fetchDeleted:done", { uid, count: list.length });
  return list;
}
