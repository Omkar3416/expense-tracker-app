// functions/src/index.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

/* ---------------- Types ---------------- */

type BorrowingDoc = {
  person?: string;
  dueAt?: string; // ISO UTC
  status?: "pending" | "paid";
  lastNotifiedAt?: string;
};

type ReminderFrequency = "once" | "monthly" | "yearly" | "custom";

type ReminderDoc = {
  title?: string;
  nextTriggerDate?: string; // ISO UTC
  status?: "active" | "paused" | "completed" | string;
  lastNotifiedAt?: string;

  // Needed to advance schedule
  frequency?: ReminderFrequency;
  intervalDays?: number;
  dueTime?: string; // "HH:mm"
};

/* ---------------- Small helpers ---------------- */

function safeStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function safeNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function addMinutesIso(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

function isValidHHmm(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return (
    Number.isFinite(hh) &&
    Number.isFinite(mm) &&
    hh >= 0 &&
    hh <= 23 &&
    mm >= 0 &&
    mm <= 59
  );
}

/**
 * We store nextTriggerDate in UTC ISO.
 * For recurring reminders:
 * - once => keep same nextTriggerDate (but we mark lastNotifiedAt so it won't resend)
 * - monthly/yearly/custom => advance nextTriggerDate forward
 */
function computeNextTriggerDateFromBase(
  baseIsoUtc: string,
  frequency: ReminderFrequency,
  intervalDays?: number
): string {
  const base = new Date(baseIsoUtc);
  if (!Number.isFinite(base.getTime())) return new Date().toISOString();

  const now = new Date();

  // If base still in future, keep it
  if (base.getTime() >= now.getTime()) return base.toISOString();

  if (frequency === "once") {
    // Keep base; lastNotifiedAt prevents re-send
    return base.toISOString();
  }

  if (frequency === "monthly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next.toISOString();
  }

  if (frequency === "yearly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setUTCFullYear(next.getUTCFullYear() + 1);
    }
    return next.toISOString();
  }

  // custom
  const days =
    typeof intervalDays === "number" && intervalDays > 0 ? intervalDays : 30;

  const next = new Date(base);
  while (next.getTime() < now.getTime()) {
    next.setUTCDate(next.getUTCDate() + days);
  }
  return next.toISOString();
}

async function sendToUserTopic(uid: string, payload: { title: string; body: string; url: string; notificationId: string }) {
  const topic = `user_${uid}`;
  await admin.messaging().send({
    topic,
    data: {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      notificationId: payload.notificationId,
    },
  });
}

/* ---------------- Scheduled Function ---------------- */

export const notifyDueItems = functions.pubsub
  .schedule("* * * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const now = new Date();
    const nowIsoStr = now.toISOString();

    // window to prevent missing due items
    const upper = addMinutesIso(now, 1);

    // ---------------- BORROWINGS ----------------
    const borrowSnap = await admin
      .firestore()
      .collectionGroup("borrowings")
      .where("status", "==", "pending")
      .where("dueAt", "<=", upper)
      .get();

    for (const doc of borrowSnap.docs) {
      const data = doc.data() as BorrowingDoc;

      const dueAt = safeStr(data.dueAt);
      if (!dueAt) continue;

      const lastNotifiedAt = safeStr(data.lastNotifiedAt);
      if (lastNotifiedAt && lastNotifiedAt >= dueAt) continue;

      // Extract uid from path: users/{uid}/borrowings/{id}
      const parts = doc.ref.path.split("/");
      const usersIndex = parts.indexOf("users");
      const uid = usersIndex >= 0 ? parts[usersIndex + 1] : null;
      if (!uid) continue;

      const person = safeStr(data.person) ?? "Someone";
      const title = "Borrowing Due";
      const body = `Reminder: ${person} borrowing is due now.`;
      const url = `/borrowings?open=${doc.id}`;
      const notificationId = `borrowing_${doc.id}_${dueAt}`;

      await sendToUserTopic(uid, { title, body, url, notificationId });

      await doc.ref.set({ lastNotifiedAt: nowIsoStr }, { merge: true });
    }

    // ---------------- REMINDERS ----------------
    const remSnap = await admin
      .firestore()
      .collectionGroup("reminders")
      .where("status", "==", "active")
      .where("nextTriggerDate", "<=", upper)
      .get();

    for (const doc of remSnap.docs) {
      const data = doc.data() as ReminderDoc;

      const next = safeStr(data.nextTriggerDate);
      if (!next) continue;

      const lastNotifiedAt = safeStr(data.lastNotifiedAt);
      if (lastNotifiedAt && lastNotifiedAt >= next) continue;

      const parts = doc.ref.path.split("/");
      const usersIndex = parts.indexOf("users");
      const uid = usersIndex >= 0 ? parts[usersIndex + 1] : null;
      if (!uid) continue;

      const titleText = safeStr(data.title) ?? "Reminder";
      const title = "Reminder Due";
      const body = `Reminder: ${titleText} is due now.`;
      const url = `/reminders?open=${doc.id}`;
      const notificationId = `reminder_${doc.id}_${next}`;

      await sendToUserTopic(uid, { title, body, url, notificationId });

      const frequency: ReminderFrequency =
        data.frequency === "monthly" ||
        data.frequency === "yearly" ||
        data.frequency === "custom" ||
        data.frequency === "once"
          ? data.frequency
          : "once";

      const intervalDays = safeNum(data.intervalDays);

      // Advance nextTriggerDate for recurring reminders
      const advancedNext = computeNextTriggerDateFromBase(next, frequency, intervalDays);

      await doc.ref.set(
        {
          lastNotifiedAt: nowIsoStr,
          nextTriggerDate: advancedNext,
        },
        { merge: true }
      );
    }

    return null;
  });
