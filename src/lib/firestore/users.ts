// src/lib/firestore/users.ts

import { db } from "@/lib/firebaseClient";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

export type UserProfile = {
  uid: string;
  email: string | null;
  name?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * ✅ Firestore user doc ID rule:
 * - ALWAYS use email as document ID
 * - This app depends on email (Google login / Email login)
 */
function userDocId(profile: UserProfile): string {
  const email = profile.email?.trim();
  if (!email) {
    throw new Error("User email missing. Cannot create user profile doc without email.");
  }
  return normalizeEmail(email);
}

function userRef(userId: string) {
  return doc(db, "users", userId);
}

export async function ensureUserProfile(profile: UserProfile): Promise<void> {
  const id = userDocId(profile);
  const ref = userRef(id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: profile.uid,
      email: profile.email ?? null,
      name: profile.name ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    uid: profile.uid,
    email: profile.email ?? null,
    name: profile.name ?? "",
    updatedAt: serverTimestamp(),
  });
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const id = userDocId(profile);
  const ref = userRef(id);

  await setDoc(
    ref,
    {
      uid: profile.uid,
      email: profile.email ?? null,
      name: profile.name ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
