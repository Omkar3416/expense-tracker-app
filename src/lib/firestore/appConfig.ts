// src/lib/firestore/appConfig.ts

import { db } from "@/lib/firebaseClient";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export type AuthConfigDoc = {
  adminAllowedGoogleEmails: string[];
  adminAllowedGoogleDomains: string[];
  adminGoogleEnabled: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/**
 * ✅ Ensures Firestore config document exists:
 * appConfig/auth
 *
 * This auto-creates the doc on first run.
 * After that, you only update allowed emails/domains from Firebase Console.
 */
export async function ensureAuthConfigDocExists() {
  const ref = doc(db, "appConfig", "auth");
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  const defaultDoc: AuthConfigDoc = {
    adminAllowedGoogleEmails: [], // add allowed admin emails in Firestore later
    adminAllowedGoogleDomains: [], // add domains in Firestore later
    adminGoogleEnabled: true, // you can disable anytime from Firestore
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, defaultDoc);
}
