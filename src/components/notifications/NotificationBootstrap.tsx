// src/components/notifications/NotificationBootstrap.tsx
"use client";

import { useEffect } from "react";
import { auth } from "@/lib/firebaseClient";
import type { IdTokenResult } from "firebase/auth";

import {
  debugNotificationEnvironment,
  ensureMessagingServiceWorker,
  getFcmTokenWithRecovery,
  listenToForegroundMessages,
  subscribeTokenToTopic,
  subscribeTokenToUserTopic,
  shouldProcessForegroundNotification,
} from "@/lib/notifications/messaging";

type SyncTopicsResponse =
  | { success: true; topics: string[] }
  | { error: string; code?: string; topic?: string };

function logHeader(title: string) {
  // eslint-disable-next-line no-console
  console.log(`\n================ ${title} ================\n`);
}

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[NotificationBootstrap]", ...args);
}

function warn(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.warn("[NotificationBootstrap]", ...args);
}

function errLog(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.error("[NotificationBootstrap]", ...args);
}

/**
 * ✅ Determine admin claim from Firebase auth token
 */
async function getAdminFlag(): Promise<boolean> {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const tokenRes: IdTokenResult = await user.getIdTokenResult(true);
    return Boolean(tokenRes?.claims?.admin);
  } catch (e) {
    warn("getAdminFlag failed:", e);
    return false;
  }
}

/**
 * ✅ Prefer ServiceWorkerRegistration.showNotification in foreground
 * so that clicks go through your SW `notificationclick` handler and route correctly.
 */
async function showForegroundNotificationViaServiceWorker(opts: {
  title: string;
  body: string;
  url?: string;
  notificationId?: string;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    // Ensure SW registered (your helper also auto-updates)
    const reg = await ensureMessagingServiceWorker();
    if (!reg) return false;

    // Wait for SW readiness
    await navigator.serviceWorker.ready;

    // Show notification via SW so that SW handles click routing
    await reg.showNotification(opts.title, {
      body: opts.body,
      icon: "/favicon.ico",
      tag: opts.notificationId || undefined,
      data: {
        url: opts.url ?? "/dashboard",
        notificationId: opts.notificationId,
        __source: "foreground",
      },
    });

    log("✅ Foreground notification shown via Service Worker");
    return true;
  } catch (e) {
    warn(
      "showForegroundNotificationViaServiceWorker failed (fallback to Notification()):",
      e
    );
    return false;
  }
}

export default function NotificationBootstrap() {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function debugBasics() {
      logHeader("NotificationBootstrap Debug");

      log("✅ ORIGIN:", window.location.origin);
      log("✅ USER AGENT:", navigator.userAgent);
      log("✅ IS SECURE CONTEXT:", window.isSecureContext);

      if ("Notification" in window) {
        log("✅ Notification.permission:", Notification.permission);
      } else {
        warn("❌ Notification API not available in this browser.");
      }

      if (!("serviceWorker" in navigator)) {
        warn("❌ Service Worker not supported in this browser.");
      } else {
        log("✅ Service Worker supported");
      }
    }

    async function debugServiceWorker() {
      logHeader("Service Worker Debug");

      if (!("serviceWorker" in navigator)) return;

      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        log(
          "✅ SW REGISTRATIONS:",
          regs.map((r) => ({
            scope: r.scope,
            active: r.active?.scriptURL ?? null,
            installing: r.installing?.scriptURL ?? null,
            waiting: r.waiting?.scriptURL ?? null,
          }))
        );

        log("✅ SW CONTROLLER:", navigator.serviceWorker.controller);

        const readyReg = await navigator.serviceWorker.ready;
        log("✅ SW READY REG:", {
          scope: readyReg.scope,
          active: readyReg.active?.scriptURL ?? null,
        });

        const pushSub = await readyReg.pushManager.getSubscription();
        log("✅ PUSH SUBSCRIPTION:", pushSub);

        navigator.serviceWorker.addEventListener(
          "message",
          (event: MessageEvent<unknown>) => {
            log("📩 MESSAGE FROM SW:", event.data);
          }
        );
      } catch (e) {
        errLog("❌ SW DEBUG ERROR:", e);
      }
    }

    async function registerServiceWorker() {
      logHeader("Registering Service Worker");

      if (!("serviceWorker" in navigator)) return null;

      // ✅ Only allow localhost or https
      const isLocalhost = window.location.hostname === "localhost";
      const isHttps = window.location.protocol === "https:";

      if (!isLocalhost && !isHttps) {
        warn("❌ Not secure origin. SW registration blocked.");
        log(
          "HOST:",
          window.location.hostname,
          "PROTO:",
          window.location.protocol
        );
        return null;
      }

      try {
        const reg = await ensureMessagingServiceWorker();
        if (!reg) {
          warn("❌ ensureMessagingServiceWorker returned null");
          return null;
        }

        log("✅ Firebase SW registered/ready:", {
          scope: reg.scope,
          scriptURL:
            reg.active?.scriptURL ??
            reg.installing?.scriptURL ??
            reg.waiting?.scriptURL ??
            null,
        });

        return reg;
      } catch (e) {
        errLog("❌ SW REGISTER ERROR:", e);
        return null;
      }
    }

    /**
     * ✅ FOREGROUND listener
     * - Logs payload
     * - Shows Notification popup ONLY if permission granted
     * - ✅ Dedupe by notificationId to prevent double showing
     * - ✅ Prefer SW showNotification so click routing works in foreground too
     */
    async function initForegroundListener() {
      logHeader("Foreground Listener Debug");

      unsubscribe = await listenToForegroundMessages(async (payload) => {
        log("✅ Foreground Notification Received!");
        log("🔥 PAYLOAD (parsed):", payload);

        const notificationId = payload.notificationId;

        // ✅ Foreground dedupe
        if (!shouldProcessForegroundNotification(notificationId)) {
          warn(
            "⏭️ Foreground: skipped duplicate notificationId:",
            notificationId
          );
          return;
        }

        // ✅ Only show popup if permission granted (existing behavior)
        if (!("Notification" in window) || Notification.permission !== "granted") {
          warn("⚠️ Cannot show foreground popup (permission not granted).");
          return;
        }

        const title = payload.title ?? "Notification";
        const body = payload.body ?? "";
        const url = payload.url ?? "/dashboard";

        // ✅ Prefer SW notification so click routes through SW handler
        const swShown = await showForegroundNotificationViaServiceWorker({
          title,
          body,
          url,
          notificationId,
        });

        if (swShown) return;

        // ✅ Fallback: keep your existing behavior (no breaking change)
        try {
          const n = new Notification(title, { body, icon: "/favicon.ico" });

          // Optional: route directly for fallback notification clicks
          n.onclick = () => {
            try {
              window.focus();
              window.location.assign(url);
            } catch {
              // ignore
            }
          };

          log("✅ Foreground popup shown by browser Notification() fallback");
        } catch (e) {
          errLog("❌ Foreground Notification() failed:", e);
        }
      });

      if (!unsubscribe) {
        warn("❌ Foreground listener NOT initialized (messaging unsupported).");
      } else {
        log("✅ Foreground listener registered.");
      }
    }

    async function callSyncTopics(token: string): Promise<boolean> {
      try {
        const user = auth.currentUser;
        if (!user) return false;

        const idToken = await user.getIdToken(true);
        if (!idToken) return false;

        log("➡️ Calling /api/notifications/sync-topics", {
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

        log("⬅️ sync-topics response", {
          ok: res.ok,
          status: res.status,
          json,
        });

        if (!res.ok) return false;

        if ("success" in json && json.success === true) {
          log("✅ sync-topics success. Topics:", json.topics);
          return true;
        }

        return false;
      } catch (e) {
        errLog("❌ sync-topics failed:", e);
        return false;
      }
    }

    async function autoEnsureTokenAndTopics() {
      logHeader("Auto Token + Topic Subscription");

      if (typeof window === "undefined") return;

      if (!("Notification" in window)) {
        warn("❌ Notification API missing → cannot enable push");
        return;
      }

      const permission = Notification.permission;
      log("✅ Notification.permission:", permission);

      if (permission === "default") {
        warn(
          "⚠️ Permission is DEFAULT (user never decided). Not auto-requesting. User must click Enable once."
        );
        return;
      }

      if (permission === "denied") {
        warn("❌ Permission is DENIED. User must enable in browser settings.");
        return;
      }

      log("✅ Permission granted → ensuring SW + token + topic subscriptions");

      const user = auth.currentUser;
      if (!user) {
        warn("❌ Not logged in → skipping push token init");
        return;
      }

      const uid = user.uid;
      log("✅ Logged in uid:", uid);

      const reg = await ensureMessagingServiceWorker();
      if (!reg) {
        warn("❌ Service worker missing → token cannot be created.");
        return;
      }

      const token = await getFcmTokenWithRecovery();
      if (!token) {
        warn("❌ Token generation failed even after recovery.");
        return;
      }

      log("✅ Token OK:", token.slice(0, 20) + "...", "len=", token.length);

      const syncOk = await callSyncTopics(token);
      if (syncOk) {
        log("✅ Auto subscription complete via sync-topics ✅");
        return;
      }

      warn("⚠️ sync-topics failed → falling back to legacy subscribe routes");

      const isAdmin = await getAdminFlag();
      log("✅ isAdmin:", isAdmin);

      const prodRes = await subscribeTokenToTopic(token, "prod");
      log("✅ subscribe PROD result:", prodRes);

      if (isAdmin) {
        const devRes = await subscribeTokenToTopic(token, "dev");
        log("✅ subscribe DEV result:", devRes);
      }

      const userTopicRes = await subscribeTokenToUserTopic(token, uid);
      log("✅ subscribe USER topic result:", userTopicRes);

      log("✅ Auto subscription complete via fallback ✅");
    }

    async function init() {
      await debugBasics();

      await debugNotificationEnvironment();

      await registerServiceWorker();
      await debugServiceWorker();
      await initForegroundListener();

      await autoEnsureTokenAndTopics();

      document.addEventListener("visibilitychange", () => {
        log("👁️ VISIBILITY:", document.visibilityState);
      });
    }

    init().catch((e) => errLog("❌ init() failed:", e));

    return () => {
      if (unsubscribe) {
        unsubscribe();
        log("✅ Foreground listener unsubscribed.");
      }
    };
  }, []);

  return null;
}
