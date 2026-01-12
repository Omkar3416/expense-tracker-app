// src/lib/auth/securityLogs.ts

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

export async function logSecurityEvent(event: {
  type: "ADMIN_GOOGLE_LOGIN_BLOCKED" | "ADMIN_GOOGLE_LOGIN_ERROR";
  email: string | null;
  uid: string | null;
  reason: string;
  extra?: Record<string, unknown>;
}) {
  try {
    await addDoc(collection(db, "securityLogs"), {
      type: event.type,
      email: event.email,
      uid: event.uid,
      reason: event.reason,
      extra: event.extra ?? null,
      createdAt: serverTimestamp(),
      app: "expense-tracker",
    });
  } catch {
    // ignore
  }
}
