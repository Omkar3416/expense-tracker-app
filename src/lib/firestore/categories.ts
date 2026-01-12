// src/lib/firestore/categories.ts

import { db } from "@/lib/firebaseClient";
import type { Category } from "@/store/features/categories/categorySlice";

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
 * ✅ userKey = emailLowercase
 * Example: "demo@gmail.com"
 */
function categoriesCol(userKey: string) {
  return collection(db, "users", userKey, "categories");
}

type FirestoreCategoryData = Partial<Record<keyof Category, unknown>> &
  Record<string, unknown>;

function normalizeCategory(id: string, data: unknown): Category {
  const now = new Date().toISOString();
  const d = (data ?? {}) as FirestoreCategoryData;

  const name =
    typeof d.name === "string" && d.name.trim().length > 0
      ? d.name.trim()
      : "Untitled";

  const type =
    d.type === "transaction" || d.type === "reminder" ? d.type : "transaction";

  const icon = typeof d.icon === "string" ? d.icon : undefined;
  const color = typeof d.color === "string" ? d.color : undefined;

  const sortOrder =
    typeof d.sortOrder === "number" && Number.isFinite(d.sortOrder)
      ? d.sortOrder
      : undefined;

  const createdAt =
    typeof d.createdAt === "string" && d.createdAt.trim().length > 0
      ? d.createdAt
      : now;

  const updatedAt =
    typeof d.updatedAt === "string" && d.updatedAt.trim().length > 0
      ? d.updatedAt
      : null;

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
    name,
    type,
    icon,
    color,
    sortOrder,
    createdAt,
    updatedAt,
    createdByUid,
    createdByEmail,
    updatedByUid,
    updatedByEmail,
  };
}

export async function fetchUserCategories(userKey: string): Promise<Category[]> {
  const q = query(categoriesCol(userKey), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const list: Category[] = [];
  snap.forEach((d) => {
    list.push(normalizeCategory(d.id, d.data()));
  });

  return list;
}

export async function createOrReplaceCategory(userKey: string, c: Category) {
  const ref = doc(db, "users", userKey, "categories", c.id);

  await setDoc(
    ref,
    {
      name: c.name,
      type: c.type,
      icon: c.icon ?? null,
      color: c.color ?? null,
      sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : null,

      createdAt: c.createdAt,
      updatedAt: c.updatedAt ?? null,

      createdByUid: c.createdByUid ?? null,
      createdByEmail: c.createdByEmail ?? null,

      updatedByUid: c.updatedByUid ?? null,
      updatedByEmail: c.updatedByEmail ?? null,
    },
    { merge: true }
  );
}

export async function deleteCategoryById(userKey: string, id: string) {
  const ref = doc(db, "users", userKey, "categories", id);
  await deleteDoc(ref);
}
