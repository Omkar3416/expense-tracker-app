// src/components/notifications/useAnnouncementBell.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";

import type { AnnouncementDoc, AnnouncementStateDoc, BellRow } from "./types";

function announcementsCol() {
  return collection(db, "announcements");
}

function userStateCol(uid: string) {
  return collection(db, "users", uid, "announcementState");
}

function safeTimestamp(value: unknown): Timestamp | null {
  if (value && typeof value === "object" && "toMillis" in value) {
    return value as Timestamp;
  }
  return null;
}

function parseAnnouncementRow(
  snap: QueryDocumentSnapshot<DocumentData>,
  state: AnnouncementStateDoc | null
): BellRow {
  const data = snap.data() as AnnouncementDoc;

  const title = typeof data.title === "string" ? data.title : "(no title)";
  const body = typeof data.body === "string" ? data.body : "";

  const mode =
    data.mode === "prod" ? "prod" : data.mode === "dev" ? "dev" : undefined;

  const sentAt = data.sentAt ?? data.createdAt;
  const isDeletedGlobally = data.status === "deleted";

  return {
    id: snap.id,
    title,
    body,
    mode,
    sentAt,
    seenAt: safeTimestamp(state?.seenAt ?? null),
    hiddenAt: safeTimestamp(state?.hiddenAt ?? null),
    isDeletedGlobally,
  };
}

function isPermissionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;

  const msg = e.message.toLowerCase();
  return (
    msg.includes("missing or insufficient permissions") ||
    msg.includes("permission-denied") ||
    msg.includes("insufficient permissions")
  );
}

async function ensureFreshAuth(): Promise<void> {
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }
}

export function useAnnouncementBell(uid: string) {
  const [rows, setRows] = useState<BellRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => !r.isDeletedGlobally && !r.hiddenAt);
  }, [rows]);

  const unseenCount = useMemo(() => {
    return visibleRows.filter((r) => !r.seenAt).length;
  }, [visibleRows]);

  /**
   * ✅ Load announcement history.
   * IMPORTANT: returns the loaded list so caller can act on it immediately
   * (fixes stale state issue).
   */
  const loadHistory = useCallback(async (): Promise<BellRow[]> => {
    if (!uid) return [];

    if (!auth.currentUser) {
      console.warn("[useAnnouncementBell] loadHistory skipped (auth not ready)");
      return [];
    }

    console.log("[useAnnouncementBell] loadHistory", {
      uid,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
    });

    setLoading(true);
    setErr(null);

    const run = async (): Promise<BellRow[]> => {
      await ensureFreshAuth();

      // ✅ Always load announcements first
      const aQ = query(announcementsCol(), orderBy("sentAt", "desc"), limit(50));
      const aSnap = await getDocs(aQ);

      // ✅ Try to load user state, but do NOT block if it fails
      const stateMap = new Map<string, AnnouncementStateDoc>();

      try {
        const sSnap = await getDocs(userStateCol(uid));
        sSnap.docs.forEach((d) => {
          stateMap.set(d.id, d.data() as AnnouncementStateDoc);
        });
      } catch (stateErr: unknown) {
        console.warn(
          "[useAnnouncementBell] announcementState read failed (showing announcements anyway)",
          stateErr
        );
      }

      const list = aSnap.docs.map((a) =>
        parseAnnouncementRow(a, stateMap.get(a.id) ?? null)
      );

      setRows(list);
      return list;
    };

    try {
      const list = await run();
      return list;
    } catch (e: unknown) {
      // ✅ Retry once only if permission error
      if (isPermissionError(e)) {
        console.warn(
          "[useAnnouncementBell] Permission error. Refreshing token + retrying once..."
        );
        try {
          await ensureFreshAuth();
          const list = await run();
          return list;
        } catch (e2: unknown) {
          const msg =
            e2 instanceof Error ? e2.message : "Failed to load announcements.";
          setErr(msg);
          return [];
        }
      }

      const msg = e instanceof Error ? e.message : "Failed to load announcements.";
      setErr(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [uid]);

  /**
   * ✅ Mark a single announcement as seen
   */
  const markSeen = useCallback(
    async (announcementId: string) => {
      if (!uid || !auth.currentUser) return;

      try {
        await ensureFreshAuth();

        const ref = doc(userStateCol(uid), announcementId);
        await setDoc(
          ref,
          {
            seenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } satisfies AnnouncementStateDoc,
          { merge: true }
        );

        await loadHistory();
      } catch {
        // ignore
      }
    },
    [uid, loadHistory]
  );

  /**
   * ✅ Mark MANY announcements as seen in one batch
   * This is used for auto-mark-seen when bell dropdown opens.
   */
  const markSeenMany = useCallback(
    async (announcementIds: string[]): Promise<void> => {
      if (!uid || !auth.currentUser) return;
      if (announcementIds.length === 0) return;

      try {
        await ensureFreshAuth();

        const batch = writeBatch(db);

        for (const id of announcementIds) {
          const ref = doc(userStateCol(uid), id);
          batch.set(
            ref,
            {
              seenAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            } satisfies AnnouncementStateDoc,
            { merge: true }
          );
        }

        await batch.commit();
      } catch {
        // ignore
      }
    },
    [uid]
  );

  /**
   * ✅ Hide a single notification row (Delete)
   */
  const hideOne = useCallback(
    async (announcementId: string) => {
      if (!uid || !auth.currentUser) return;

      try {
        await ensureFreshAuth();

        const ref = doc(userStateCol(uid), announcementId);
        await setDoc(
          ref,
          {
            hiddenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } satisfies AnnouncementStateDoc,
          { merge: true }
        );

        await loadHistory();
      } catch {
        // ignore
      }
    },
    [uid, loadHistory]
  );

  /**
   * ✅ Mark all currently visible rows as seen
   * (kept for compatibility with existing code; safe)
   */
  const markAllSeen = useCallback(async () => {
    if (!uid || !auth.currentUser) return;

    try {
      await ensureFreshAuth();

      const batch = writeBatch(db);

      visibleRows.forEach((r) => {
        if (!r.seenAt) {
          const ref = doc(userStateCol(uid), r.id);
          batch.set(
            ref,
            {
              seenAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            } satisfies AnnouncementStateDoc,
            { merge: true }
          );
        }
      });

      await batch.commit();
      await loadHistory();
    } catch {
      // ignore
    }
  }, [uid, visibleRows, loadHistory]);

  /**
   * ✅ Hide all visible (Delete all)
   */
  const hideAll = useCallback(async () => {
    if (!uid || !auth.currentUser) return;

    const ok = confirm("Delete ALL notification history?");
    if (!ok) return;

    try {
      await ensureFreshAuth();

      const batch = writeBatch(db);

      visibleRows.forEach((r) => {
        const ref = doc(userStateCol(uid), r.id);
        batch.set(
          ref,
          {
            hiddenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } satisfies AnnouncementStateDoc,
          { merge: true }
        );
      });

      await batch.commit();
      await loadHistory();
    } catch {
      // ignore
    }
  }, [uid, visibleRows, loadHistory]);

  return {
    rows: visibleRows,
    loading,
    err,
    unseenCount,
    setErr,
    loadHistory,
    markSeen,
    markSeenMany, // ✅ NEW
    hideOne,
    markAllSeen,
    hideAll,
  };
}
