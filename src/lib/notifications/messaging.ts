// src/lib/notifications/messaging.ts

import { app, auth } from "@/lib/firebaseClient";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";

export type ForegroundMessagePayload = {
  title?: string;
  body?: string;
  data?: Record<string, string>;
  notificationId?: string;
  url?: string;
};

type TopicMode = "dev" | "prod";

type TopicResponse = {
  success?: boolean;
  topic?: string;
  error?: string;
  code?: string;
};

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[FCM]", ...args);
}

function warn(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.warn("[FCM]", ...args);
}

function errLog(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.error("[FCM]", ...args);
}

/**
 * ✅ Foreground dedupe store (session-only)
 * Prevents same payload showing twice in the same tab session.
 */
const FG_DEDUPE_KEY = "fcm_fg_seen_ids_v1";

function loadSeenFgIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(FG_DEDUPE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveSeenFgIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // keep last 100 only (bounded to avoid unlimited growth)
    const arr = Array.from(ids).slice(-100);
    sessionStorage.setItem(FG_DEDUPE_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

/**
 * ✅ returns true if this notificationId should be processed
 */
export function shouldProcessForegroundNotification(
  notificationId: string | undefined
): boolean {
  if (!notificationId) return true; // no id → cannot dedupe
  const set = loadSeenFgIds();
  if (set.has(notificationId)) {
    warn(
      "⚠️ Foreground dedupe: skipping already seen notificationId:",
      notificationId
    );
    return false;
  }
  set.add(notificationId);
  saveSeenFgIds(set);
  return true;
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
 * ✅ Debug environment
 */
export async function debugNotificationEnvironment(): Promise<void> {
  if (typeof window === "undefined") return;

  const isLocalhost = window.location.hostname === "localhost";
  const isHttps = window.location.protocol === "https:";
  const secureOk = isLocalhost || isHttps;

  log("[ENV] origin:", window.location.origin);
  log("[ENV] secure:", secureOk, {
    protocol: window.location.protocol,
    hostname: window.location.hostname,
  });

  log("[ENV] Notification supported:", "Notification" in window);
  log(
    "[ENV] Notification.permission:",
    "Notification" in window ? Notification.permission : "no-Notification"
  );

  log("[ENV] serviceWorker supported:", "serviceWorker" in navigator);

  try {
    const supported = await isSupported().catch(() => false);
    log("[ENV] firebase/messaging supported:", supported);
  } catch (e) {
    warn("[ENV] isSupported failed:", e);
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    log(
      "[ENV] SW registrations:",
      regs.map((r) => ({
        scope: r.scope,
        active: r.active?.scriptURL ?? null,
        installing: r.installing?.scriptURL ?? null,
        waiting: r.waiting?.scriptURL ?? null,
      }))
    );
  } catch (e) {
    warn("[ENV] getRegistrations failed:", e);
  }
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
 * ✅ Wait for controller to change once (so new SW takes control)
 * Safe: no reload, no loops.
 */
async function waitForControllerChangeOnce(timeoutMs = 1500): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // If already controlled, nothing to wait for.
  if (navigator.serviceWorker.controller) return;

  await new Promise<void>((resolve) => {
    let done = false;

    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, timeoutMs);

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * ✅ Ensure Service Worker is registered
 * ✅ AUTO: update + activate latest SW after deploy (no user cache clear)
 */
export async function ensureMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  const swUrl = "/firebase-messaging-sw.js";

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const found = regs.find((r) => r.active?.scriptURL?.includes(swUrl));

    const reg = found ?? (await navigator.serviceWorker.register(swUrl));

    log(found ? "Found existing SW registration:" : "Registered new SW:", {
      scope: reg.scope,
      scriptURL:
        reg.active?.scriptURL ??
        reg.waiting?.scriptURL ??
        reg.installing?.scriptURL ??
        null,
    });

    // ✅ Always try to pull latest SW file
    try {
      await reg.update();
      log("✅ SW update() called");
    } catch (e) {
      warn("SW update() failed (non-fatal):", e);
    }

    // ✅ If new SW is waiting, ask it to skip waiting (pairs with SW message listener)
    if (reg.waiting) {
      try {
        log("✅ SW waiting detected → sending SKIP_WAITING");
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } catch (e) {
        warn("postMessage(SKIP_WAITING) failed (non-fatal):", e);
      }
    }

    // ✅ Ensure ready (active SW)
    await navigator.serviceWorker.ready;

    // ✅ Wait briefly for SW to control this page (helps Mac stale SW cases)
    await waitForControllerChangeOnce();

    return reg;
  } catch (e) {
    errLog("Service worker register failed:", e);
    return null;
  }
}

/**
 * ✅ Reset ONLY firebase messaging SW
 */
export async function resetMessagingServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const matches = regs.filter((r) =>
      r.active?.scriptURL?.includes("/firebase-messaging-sw.js")
    );

    if (matches.length === 0) {
      log("resetMessagingServiceWorker: no firebase SW found.");
      return;
    }

    for (const reg of matches) {
      warn("Unregistering firebase SW:", {
        scope: reg.scope,
        scriptURL: reg.active?.scriptURL ?? null,
      });
      await reg.unregister();
    }
  } catch (e) {
    errLog("resetMessagingServiceWorker failed:", e);
  }
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

  // ✅ slightly longer delay helps Safari/Brave/Chrome sync after unregister
  await new Promise((r) => setTimeout(r, 600));

  const t2 = await getFcmToken();
  if (t2) return t2;

  errLog("Token still failed after recovery.");
  return null;
}

/**
 * ✅ OPTIONAL helper (does NOT affect existing behavior unless you call it)
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

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
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

/**
 * ✅ Subscribe token to topic via backend (existing)
 */
export async function subscribeTokenToTopic(
  token: string,
  mode: TopicMode
): Promise<{ success: boolean; topic?: string; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in." };

    const idToken = await user.getIdToken(true);
    if (!idToken) return { success: false, error: "Missing idToken." };

    log("➡️ subscribeTokenToTopic", {
      mode,
      tokenPreview: token.slice(0, 18) + "...",
      tokenLen: token.length,
    });

    const res = await fetch("/api/notifications/subscribe-topic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, mode }),
    });

    const json = (await res.json()) as TopicResponse;

    log("⬅️ subscribe-topic response", {
      ok: res.ok,
      status: res.status,
      json,
    });

    if (!res.ok) {
      return { success: false, error: json?.error ?? "Subscribe failed" };
    }

    return { success: true, topic: json.topic };
  } catch (e) {
    errLog("subscribeTokenToTopic failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * ✅ NEW: Subscribe token to a USER topic so reminders can be sent to all devices.
 *
 * topic = user_{uid}
 */
export async function subscribeTokenToUserTopic(
  token: string,
  uid: string
): Promise<{ success: boolean; topic?: string; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in." };

    const idToken = await user.getIdToken(true);
    if (!idToken) return { success: false, error: "Missing idToken." };

    const cleanUid = uid.trim();
    if (!cleanUid) return { success: false, error: "Missing uid." };

    log("➡️ subscribeTokenToUserTopic", {
      uid: cleanUid,
      tokenPreview: token.slice(0, 18) + "...",
      tokenLen: token.length,
    });

    const res = await fetch("/api/notifications/subscribe-user-topic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, uid: cleanUid }),
    });

    const json = (await res.json()) as TopicResponse;

    log("⬅️ subscribe-user-topic response", {
      ok: res.ok,
      status: res.status,
      json,
    });

    if (!res.ok) {
      return {
        success: false,
        error: json?.error ?? "Subscribe user topic failed",
      };
    }

    return { success: true, topic: json.topic };
  } catch (e) {
    errLog("subscribeTokenToUserTopic failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * ✅ Unsubscribe token from topic via backend
 */
export async function unsubscribeTokenFromTopic(
  token: string,
  mode: TopicMode
): Promise<{ success: boolean; topic?: string; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in." };

    const idToken = await user.getIdToken(true);
    if (!idToken) return { success: false, error: "Missing idToken." };

    log("➡️ unsubscribeTokenFromTopic", {
      mode,
      tokenPreview: token.slice(0, 18) + "...",
      tokenLen: token.length,
    });

    const res = await fetch("/api/notifications/unsubscribe-topic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, mode }),
    });

    const json = (await res.json()) as TopicResponse;

    log("⬅️ unsubscribe-topic response", {
      ok: res.ok,
      status: res.status,
      json,
    });

    if (!res.ok) {
      return { success: false, error: json?.error ?? "Unsubscribe failed" };
    }

    return { success: true, topic: json.topic };
  } catch (e) {
    errLog("unsubscribeTokenFromTopic failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
