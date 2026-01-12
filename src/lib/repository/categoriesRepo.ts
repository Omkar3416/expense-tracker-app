// src/lib/repository/categoriesRepo.ts

import type { Category } from "@/store/features/categories/categorySlice";
import { getDataMode } from "@/lib/dataMode";
import { auth } from "@/lib/firebaseClient";

import {
  fetchUserCategories,
  createOrReplaceCategory,
  deleteCategoryById,
} from "@/lib/firestore/categories";

import {
  loadCategories,
  saveCategories,
  migrateGuestCategoriesToUser,
} from "@/lib/storage";

import {
  enqueueCategoryUpsert,
  enqueueCategoryDelete,
  readCategoriesQueue,
  clearCategoriesQueue,
} from "@/lib/sync/categoriesSyncQueue";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * ✅ Returns Firestore userKey (emailLowercase) if allowed.
 * No UID fallback because app is email-based.
 */
function getFirestoreUserKey(uid?: string): string | null {
  if (!uid) return null;

  const u = auth.currentUser;
  if (!u) return null;

  if (u.uid !== uid) return null;
  if (u.emailVerified === false) return null;

  const email = u.email;
  if (typeof email === "string" && email.trim().length > 0) {
    return normalizeEmail(email);
  }

  return null;
}

function getEditorIdentity() {
  const u = auth.currentUser;
  return {
    uid: u?.uid,
    email: u?.email ?? null,
  };
}

function applyAuditFields(category: Category, isEdit: boolean): Category {
  const now = new Date().toISOString();
  const me = getEditorIdentity();

  const createdAt =
    category.createdAt && category.createdAt.trim().length > 0
      ? category.createdAt
      : now;

  const createdByUid = category.createdByUid ?? me.uid;
  const createdByEmail =
    typeof category.createdByEmail !== "undefined"
      ? category.createdByEmail
      : me.email;

  if (!isEdit) {
    return {
      ...category,
      createdAt,
      updatedAt: category.updatedAt ?? null,
      createdByUid,
      createdByEmail,
    };
  }

  return {
    ...category,
    createdAt,
    updatedAt: now,
    createdByUid,
    createdByEmail,
    updatedByUid: me.uid ?? category.updatedByUid,
    updatedByEmail: me.email ?? category.updatedByEmail,
  };
}

/* ---------------- Public Repo API ---------------- */

export async function repoFetchCategories(uid?: string): Promise<Category[]> {
  const mode = getDataMode();

  if (uid) {
    try {
      migrateGuestCategoriesToUser(uid);
    } catch {
      // ignore
    }
  }

  const local = loadCategories(uid);

  if (mode === "local") return local;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) return local;

  try {
    await syncCategoriesQueueToFirestore(uid!, userKey);
    await syncLocalCacheToFirestore(userKey, local);

    const remote = await fetchUserCategories(userKey);

    saveCategories(uid, remote);
    return remote;
  } catch (err) {
    console.error("repoFetchCategories failed:", err);
    return local;
  }
}

export async function repoUpsertCategory(
  uid: string | undefined,
  category: Category
): Promise<Category> {
  const mode = getDataMode();

  const list = loadCategories(uid);
  const exists = list.some((x) => x.id === category.id);

  const withAudit = applyAuditFields(category, exists);

  const idx = list.findIndex((x) => x.id === withAudit.id);
  if (idx >= 0) list[idx] = withAudit;
  else list.unshift(withAudit);

  saveCategories(uid, list);

  if (mode === "local") return withAudit;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    if (uid) enqueueCategoryUpsert(uid, withAudit);
    return withAudit;
  }

  try {
    await createOrReplaceCategory(userKey, withAudit);
    return withAudit;
  } catch (err) {
    console.error("repoUpsertCategory failed:", err);
    enqueueCategoryUpsert(uid!, withAudit);
    return withAudit;
  }
}

export async function repoDeleteCategory(uid: string | undefined, id: string) {
  const mode = getDataMode();

  const list = loadCategories(uid).filter((c) => c.id !== id);
  saveCategories(uid, list);

  if (mode === "local") return id;

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    if (uid) enqueueCategoryDelete(uid, id);
    return id;
  }

  try {
    await deleteCategoryById(userKey, id);
    return id;
  } catch (err) {
    console.error("repoDeleteCategory failed:", err);
    enqueueCategoryDelete(uid!, id);
    return id;
  }
}

/* ---------------- Internal helpers ---------------- */

async function syncCategoriesQueueToFirestore(uid: string, userKey: string) {
  const q = readCategoriesQueue(uid);
  if (q.length === 0) return;

  for (const item of q) {
    if (item.kind === "upsert") {
      await createOrReplaceCategory(userKey, item.category);
    } else {
      await deleteCategoryById(userKey, item.id);
    }
  }

  clearCategoriesQueue(uid);
}

async function syncLocalCacheToFirestore(userKey: string, local: Category[]) {
  if (local.length === 0) return;

  const remote = await fetchUserCategories(userKey);
  const remoteIds = new Set(remote.map((c) => c.id));

  for (const c of local) {
    if (!remoteIds.has(c.id)) {
      await createOrReplaceCategory(userKey, c);
    }
  }
}
