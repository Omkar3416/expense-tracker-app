// src/lib/repository/categoriesRepo.ts

import type { Category } from "@/store/features/categories/categorySlice";
import { getDataMode } from "@/lib/dataMode";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

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

/**
 * ✅ UID-only Firestore key rule (matches Firestore rules):
 * - user doc id = request.auth.uid
 * - path: users/{uid}/categories/{id}
 */
function getFirestoreUserKey(uid?: string): string | null {
  if (!uid) return null;

  const u = auth.currentUser;
  if (!u) return null;

  // must match authenticated user
  if (u.uid !== uid) return null;

  return uid;
}

type ErrorInfo = { code?: string; message?: string };

function readErrorInfo(err: unknown): ErrorInfo {
  if (!err || typeof err !== "object") return {};
  const rec = err as Record<string, unknown>;

  const code = typeof rec.code === "string" ? rec.code : undefined;
  const message =
    typeof rec.message === "string"
      ? rec.message
      : err instanceof Error
      ? err.message
      : undefined;

  return { code, message };
}

function getEditorIdentity(): { uid: string | undefined; email: string | null } {
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

/**
 * Some writes happen before auth.currentUser is ready.
 * Keep local-first behavior, but auto-flush the queue shortly after.
 */
const pendingQueueFlush = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * ✅ If flush happens while auth isn't ready, listen once and flush when auth restores.
 */
const authReadyFlushUnsubs = new Map<string, () => void>();

function safeQueueLen(uid: string): number {
  try {
    return readCategoriesQueue(uid).length;
  } catch {
    return 0;
  }
}

async function syncCategoriesQueueToFirestore(uid: string, userKey: string) {
  const q = readCategoriesQueue(uid);
  if (q.length === 0) return;

  console.debug("[categoriesRepo] flushing queue", {
    uid,
    userKey,
    items: q.length,
  });

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

  let pushed = 0;

  for (const c of local) {
    if (!remoteIds.has(c.id)) {
      await createOrReplaceCategory(userKey, c);
      pushed += 1;
    }
  }

  if (pushed > 0) {
    console.debug("[categoriesRepo] backfill local->firestore pushed", {
      uid: userKey,
      pushed,
    });
  }
}

function ensureFlushOnAuthReady(uid: string) {
  if (typeof window === "undefined") return;
  if (authReadyFlushUnsubs.has(uid)) return;

  const unsub = onAuthStateChanged(auth, async (u) => {
    if (!u || u.uid !== uid) return;

    const existing = authReadyFlushUnsubs.get(uid);
    if (existing) {
      existing();
      authReadyFlushUnsubs.delete(uid);
    }

    const userKey = getFirestoreUserKey(uid);
    if (!userKey) {
      console.debug("[categoriesRepo] authReadyFlush: userKey still not ready", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
      });
      return;
    }

    try {
      const before = safeQueueLen(uid);
      await syncCategoriesQueueToFirestore(uid, userKey);
      console.debug("[categoriesRepo] authReadyFlush: queue flushed", {
        uid,
        before,
        after: safeQueueLen(uid),
      });
    } catch (err: unknown) {
      const e = readErrorInfo(err);
      console.error("[categoriesRepo] authReadyFlush failed:", {
        uid,
        code: e.code,
        message: e.message,
      });
    }
  });

  authReadyFlushUnsubs.set(uid, unsub);
}

function scheduleQueueFlush(uid: string) {
  if (typeof window === "undefined") return;
  if (pendingQueueFlush.has(uid)) return;

  const t = setTimeout(async () => {
    pendingQueueFlush.delete(uid);

    const userKey = getFirestoreUserKey(uid);
    if (!userKey) {
      console.debug("[categoriesRepo] delayed flush skipped (auth not ready)", {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        hasAuthUser: !!auth.currentUser,
        queued: safeQueueLen(uid),
        mode: getDataMode(),
      });

      ensureFlushOnAuthReady(uid);
      return;
    }

    try {
      const before = safeQueueLen(uid);
      await syncCategoriesQueueToFirestore(uid, userKey);
      console.debug("[categoriesRepo] queue flushed after delay", {
        uid,
        before,
        after: safeQueueLen(uid),
      });
    } catch (err: unknown) {
      const e = readErrorInfo(err);
      console.error("[categoriesRepo] delayed queue flush failed:", {
        uid,
        code: e.code,
        message: e.message,
      });
    }
  }, 1200);

  pendingQueueFlush.set(uid, t);
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

  if (mode === "local") {
    console.debug("[categoriesRepo] fetch: local mode", {
      uid,
      localCount: local.length,
    });
    return local;
  }

  if (!uid) {
    console.debug("[categoriesRepo] fetch: missing uid -> firestore skipped", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
    });
    return local;
  }

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    ensureFlushOnAuthReady(uid);
    console.debug("[categoriesRepo] fetch: firestore skipped (no userKey)", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      hasAuthUser: !!auth.currentUser,
      queued: safeQueueLen(uid),
      mode,
    });
    return local;
  }

  try {
    await syncCategoriesQueueToFirestore(uid, userKey);
    await syncLocalCacheToFirestore(userKey, local);

    const remote = await fetchUserCategories(userKey);
    saveCategories(uid, remote);

    console.debug("[categoriesRepo] fetch: firestore ok", {
      uid: userKey,
      remoteCount: remote.length,
      localCount: local.length,
    });

    return remote;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoFetchCategories failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });
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

  if (mode === "local") {
    console.debug("[categoriesRepo] upsert: local mode", {
      uid,
      id: withAudit.id,
      listCount: list.length,
    });
    return withAudit;
  }

  if (!uid) {
    console.debug("[categoriesRepo] upsert: missing uid -> firestore skipped", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
      id: withAudit.id,
    });
    return withAudit;
  }

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    enqueueCategoryUpsert(uid, withAudit);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    console.debug(
      "[categoriesRepo] queued upsert (auth not ready or uid mismatch)",
      {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        authEmail: auth.currentUser?.email ?? null,
        mode,
        hasAuthUser: !!auth.currentUser,
        queued: safeQueueLen(uid),
        id: withAudit.id,
      }
    );

    return withAudit;
  }

  try {
    await createOrReplaceCategory(userKey, withAudit);
    console.debug("[categoriesRepo] firestore upsert ok", {
      uid: userKey,
      id: withAudit.id,
    });
    return withAudit;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoUpsertCategory failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    enqueueCategoryUpsert(uid, withAudit);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    return withAudit;
  }
}

export async function repoDeleteCategory(uid: string | undefined, id: string) {
  const mode = getDataMode();

  const list = loadCategories(uid).filter((c) => c.id !== id);
  saveCategories(uid, list);

  if (mode === "local") {
    console.debug("[categoriesRepo] delete: local mode", { uid, id });
    return id;
  }

  if (!uid) {
    console.debug("[categoriesRepo] delete: missing uid -> firestore skipped", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      mode,
      id,
    });
    return id;
  }

  const userKey = getFirestoreUserKey(uid);
  if (!userKey) {
    enqueueCategoryDelete(uid, id);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    console.debug(
      "[categoriesRepo] queued delete (auth not ready or uid mismatch)",
      {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        authEmail: auth.currentUser?.email ?? null,
        mode,
        hasAuthUser: !!auth.currentUser,
        queued: safeQueueLen(uid),
        id,
      }
    );

    return id;
  }

  try {
    await deleteCategoryById(userKey, id);
    console.debug("[categoriesRepo] firestore delete ok", { uid: userKey, id });
    return id;
  } catch (err: unknown) {
    const e = readErrorInfo(err);
    console.error("repoDeleteCategory failed:", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      code: e.code,
      message: e.message,
    });

    enqueueCategoryDelete(uid, id);
    scheduleQueueFlush(uid);
    ensureFlushOnAuthReady(uid);

    return id;
  }
}
