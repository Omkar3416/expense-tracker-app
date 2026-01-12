// src/components/notifications/NotificationBell.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

import {
  getFcmToken,
  requestNotificationPermission,
} from "@/lib/notifications/messaging";

import { useAnnouncementBell } from "./useAnnouncementBell";

type SubscribeResponse = { topic?: string; error?: string };

type SyncTopicsResponse =
  | { success: true; topics: string[] }
  | { error: string; code?: string; topic?: string };

export default function NotificationBell() {
  const [me, setMe] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const enableLockRef = useRef(false);

  const uid = useMemo(() => me?.uid ?? "", [me?.uid]);

  const {
    rows,
    loading,
    err,
    setErr,
    unseenCount,
    loadHistory,
    markSeenMany,
    hideOne,
    hideAll,
  } = useAnnouncementBell(uid);

  // ✅ auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setMe(u));
    return () => unsub();
  }, []);

  // ✅ close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (!boxRef.current) return;
      const t = e.target as Node;
      if (!boxRef.current.contains(t)) setOpen(false);
    }

    if (open) window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [open]);

  async function subscribeTokenToTopic(token: string, mode: "dev" | "prod") {
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Missing Firebase auth token.");

      const res = await fetch("/api/notifications/subscribe-topic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token, mode }),
      });

      const json = (await res.json()) as SubscribeResponse;

      if (!res.ok) throw new Error(json.error ?? "Failed to subscribe token.");

      console.log("[NotificationBell] ✅ Token subscribed:", {
        mode,
        topic: json.topic,
      });

      return true;
    } catch (e) {
      console.error("[NotificationBell] ❌ subscribeTokenToTopic failed:", e);
      return false;
    }
  }

  async function syncAllTopics(token: string): Promise<boolean> {
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        console.warn(
          "[NotificationBell] ❌ Missing Firebase auth token for sync-topics"
        );
        return false;
      }

      console.log("[NotificationBell] ➡️ sync-topics request", {
        tokenPreview: token.slice(0, 18) + "...",
        tokenLen: token.length,
      });

      const res = await fetch("/api/notifications/sync-topics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      });

      const json = (await res.json()) as SyncTopicsResponse;

      console.log("[NotificationBell] ⬅️ sync-topics response", {
        ok: res.ok,
        status: res.status,
        json,
      });

      if (!res.ok) return false;
      if (!("success" in json) || json.success !== true) return false;

      console.log("[NotificationBell] ✅ sync-topics success:", json.topics);
      return true;
    } catch (e) {
      console.error("[NotificationBell] ❌ sync-topics failed:", e);
      return false;
    }
  }

  async function enableNotifications() {
    if (enableLockRef.current) return;
    enableLockRef.current = true;

    try {
      setErr(null);

      if (!me || !uid) {
        setErr("❌ Login required.");
        return;
      }

      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
        setErr("❌ Permission denied. Enable notifications in browser settings.");
        return;
      }

      const token = await getFcmToken();
      if (!token) {
        setErr("❌ Token generation failed. Check VAPID key + service worker.");
        return;
      }

      // ✅ NEW: Repair + subscribe EVERYTHING via sync-topics (most reliable)
      const syncOk = await syncAllTopics(token);

      if (!syncOk) {
        console.warn(
          "[NotificationBell] ⚠️ sync-topics failed → falling back to legacy subscribe routes"
        );

        // ✅ fallback keeps your old working behavior
        const tokenResult = await auth.currentUser?.getIdTokenResult(true);
        const isAdmin = Boolean(tokenResult?.claims?.admin);

        let ok = await subscribeTokenToTopic(token, "prod");
        if (isAdmin) ok = ok && (await subscribeTokenToTopic(token, "dev"));

        if (!ok) {
          setErr("❌ Topic subscription failed. Please try again.");
          return;
        }
      }

      await loadHistory();
    } finally {
      enableLockRef.current = false;
    }
  }

  /**
   * ✅ Repair Notifications
   */
  async function repairNotifications() {
    if (enableLockRef.current) return;
    enableLockRef.current = true;

    try {
      setErr(null);

      if (!me || !uid) {
        setErr("❌ Login required.");
        return;
      }

      if (typeof window === "undefined" || !("Notification" in window)) {
        setErr("❌ Notification API not supported in this browser.");
        return;
      }

      if (Notification.permission !== "granted") {
        setErr("❌ Notifications are not granted. Click Enable Notifications first.");
        return;
      }

      const token = await getFcmToken();
      if (!token) {
        setErr("❌ Token generation failed. Try refresh or re-enable notifications.");
        return;
      }

      const syncOk = await syncAllTopics(token);
      if (!syncOk) {
        setErr("❌ Repair failed. Please refresh page and try again.");
        return;
      }

      console.log("[NotificationBell] ✅ Repair success");
      await loadHistory();
    } finally {
      enableLockRef.current = false;
    }
  }

  /**
   * ✅ Load history + auto mark seen when dropdown opens.
   */
  useEffect(() => {
    if (!open) return;
    if (!uid) return;

    (async () => {
      const list = await loadHistory();

      const unseenIds = list
        .filter((r) => !r.isDeletedGlobally && !r.hiddenAt && !r.seenAt)
        .map((r) => r.id);

      if (unseenIds.length > 0) {
        await markSeenMany(unseenIds);
        await loadHistory();
      }
    })();

    if (typeof window !== "undefined") {
      if ("Notification" in window && Notification.permission === "default") {
        enableNotifications();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uid]);

  if (!me) return null;

  const permissionGranted =
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted";

  return (
    <div className="relative" ref={boxRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center relative"
        aria-label="Notifications"
      >
        {/* Bell Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-white/80"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 10a2 2 0 10-4 0v1a6 6 0 00-3 5v1h10v-1a6 6 0 00-3-5v-1z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19a3 3 0 006 0" />
        </svg>

        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[11px] font-bold text-white flex items-center justify-center border border-white/10">
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={[
            // ✅ Desktop: right aligned dropdown
            // ✅ Mobile/Tablet: centered dropdown with safe padding and max width
            "absolute z-50 mt-3",
            "right-0 sm:right-0",
            "left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0",
            "w-[calc(100vw-24px)] sm:w-[380px]",
            "max-w-[420px]",
            "rounded-3xl border border-white/10 bg-[#0B1220]/90 backdrop-blur-xl shadow-xl shadow-black/30 p-4",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Notifications</p>
              <p className="text-[11px] text-white/50 mt-1">
                Shows announcements history.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={hideAll}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
                type="button"
              >
                Delete all
              </button>
            </div>
          </div>

          {/* Enable Notifications block */}
          {typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission !== "granted" && (
              <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-100">
                  🔔 Notifications are disabled. Click below to enable.
                </p>
                <button
                  onClick={enableNotifications}
                  className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 transition"
                  type="button"
                >
                  Enable Notifications
                </button>
              </div>
            )}

          {err && (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {err}
            </div>
          )}

          <div className="mt-4 space-y-2 max-h-[50vh] sm:max-h-[420px] overflow-auto pr-1">
            {loading && <p className="text-sm text-white/50">Loading...</p>}

            {!loading && rows.length === 0 && (
              <p className="text-sm text-white/50">No notifications yet.</p>
            )}

            {rows.map((r) => {
              const unseen = !r.seenAt;

              return (
                <div
                  key={r.id}
                  className={[
                    "rounded-2xl border border-white/10 bg-white/5 p-3 transition",
                    unseen ? "ring-1 ring-indigo-500/30" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white/90 truncate">
                        {r.title}
                      </p>

                      {r.body && (
                        <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">
                          {r.body}
                        </p>
                      )}

                      <p className="mt-2 text-[11px] text-white/40">
                        {r.mode ? `Mode: ${r.mode} • ` : ""}ID: {r.id}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => hideOne(r.id)}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 transition"
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ✅ Tip section + Repair button */}
          <div className="mt-3 text-[11px] text-white/40 flex items-center justify-between gap-2">
            <span className="min-w-0">
              ✅ Tip: DEV announcements go to admins only. Normal users receive only PROD.
            </span>

            {permissionGranted && (
              <button
                type="button"
                onClick={repairNotifications}
                className="shrink-0 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/20 transition"
              >
                Repair
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
