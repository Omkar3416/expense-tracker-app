// src/lib/notifications/messaging/fcm.ts

import { app, auth } from "@/lib/firebaseClient";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";

import type { ForegroundMessagePayload } from "./types";
import { log, warn, errLog } from "./logger";
import { ensureMessagingServiceWorker, resetMessagingServiceWorker } from "./sw";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * ✅ Get VAPID key from env
 */
function getVapidKey(): string {
  const key = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY in .env.local (Firebase Cloud Messaging Web Push certificates)."
    );
  }
  return key;
}

/**
 * ✅ Get Messaging instance if supported
 */
export async function getMessagingSafe(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    warn("Messaging not supported in this browser.");
    return null;
  }

  try {
    return getMessaging(app);
  } catch (e) {
    errLog("getMessaging failed:", e);
    return null;
  }
}

/**
 * ✅ Request permission (ONLY when user clicks enable button)
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined") return "denied";
  if (!("Notification" in window)) return "denied";

  const current = Notification.permission;
  if (current === "granted" || current === "denied") return current;

  const res = await Notification.requestPermission();
  log("Notification permission result:", res);
  return res;
}

/**
 * ✅ Get FCM token
 */
export async function getFcmToken(): Promise<string | null> {
  const messaging = await getMessagingSafe();
  if (!messaging) return null;

  const reg = await ensureMessagingServiceWorker();
  if (!reg) return null;

  const vapidKey = getVapidKey();

  try {
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: reg,
    });

    log("✅ TOKEN:", token, "len=", token?.length ?? 0);

    // Debug push subscription
    try {
      const sub = await reg.pushManager.getSubscription();
      log("✅ PUSH SUBSCRIPTION AFTER getToken:", sub);
    } catch (e) {
      warn("pushManager.getSubscription failed:", e);
    }

    if (typeof token === "string" && token.trim().length > 0) {
      return token.trim();
    }

    return null;
  } catch (e) {
    errLog("getToken failed:", e);
    return null;
  }
}

/**
 * ✅ Get token with recovery:
 * reset SW and retry once
 */
export async function getFcmTokenWithRecovery(): Promise<string | null> {
  const t1 = await getFcmToken();
  if (t1) return t1;

  warn("Token failed → trying SW reset + retry...");
  await resetMessagingServiceWorker();

  await new Promise((r) => setTimeout(r, 600));

  const t2 = await getFcmToken();
  if (t2) return t2;

  errLog("Token still failed after recovery.");
  return null;
}

/**
 * ✅ IMPORTANT: This export is required by NotificationBell.tsx
 * Strong repair:
 * - reset SW
 * - re-register latest SW
 * - create token again
 */
export async function forceRefreshMessagingAndToken(): Promise<string | null> {
  try {
    await resetMessagingServiceWorker();
    await new Promise((r) => setTimeout(r, 600));

    const reg = await ensureMessagingServiceWorker();
    if (!reg) return null;

    await navigator.serviceWorker.ready;
    return await getFcmToken();
  } catch (e) {
    errLog("forceRefreshMessagingAndToken failed:", e);
    return null;
  }
}

/**
 * ✅ Listen to foreground messages
 */
export async function listenToForegroundMessages(
  onPayload: (payload: ForegroundMessagePayload) => void
): Promise<(() => void) | null> {
  const messaging = await getMessagingSafe();
  if (!messaging) return null;

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      log("🔥 FOREGROUND FULL PAYLOAD:", payload);

      const title =
        safeString(payload.notification?.title) ??
        safeString(payload.data?.title) ??
        undefined;

      const body =
        safeString(payload.notification?.body) ??
        safeString(payload.data?.body) ??
        undefined;

      const data =
        payload.data && typeof payload.data === "object"
          ? (payload.data as Record<string, string>)
          : undefined;

      const notificationId =
        safeString(payload.data?.notificationId) ??
        safeString(payload.data?.announcementId) ??
        undefined;

      const url = safeString(payload.data?.url);

      onPayload({ title, body, data, notificationId, url });
    });

    log("✅ Foreground listener attached.");
    return unsubscribe;
  } catch (e) {
    errLog("onMessage attach failed:", e);
    return null;
  }
}
