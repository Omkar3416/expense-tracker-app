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

/**
 * ✅ Firestore user doc ID rule (STRICT):
 * - ALWAYS use UID as document ID
 *
 * Path:
 * - users/{uid}
 */
function userDocId(profile: UserProfile): string {
  const uid = profile.uid?.trim();
  if (!uid) {
    throw new Error("User uid missing. Cannot create user profile doc without uid.");
  }
  return uid;
}

function userRef(uid: string) {
  return doc(db, "users", uid);
}

export async function ensureUserProfile(profile: UserProfile): Promise<void> {
  const id = userDocId(profile);
  const ref = userRef(id);
  const snap = await getDoc(ref);

  const payload = {
    uid: profile.uid,
    email: profile.email ?? null,
    name: profile.name ?? "",
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, payload);
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
