import { auth } from "@/lib/firebaseClient";
import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

export function userDocRef() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User not logged in");
  return doc(db, "users", uid);
}

export function userCollectionRef(sub: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User not logged in");
  return collection(db, "users", uid, sub);
}
