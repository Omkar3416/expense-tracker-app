// public/firebase-messaging-sw.js

/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */

// ✅ Firebase Messaging Service Worker (Background Notifications)
// This file must be in /public so it's served at root: /firebase-messaging-sw.js

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts(
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js"
);

// ✅ Firebase config (hardcoded because SW cannot access Next env)
firebase.initializeApp({
  apiKey: "AIzaSyBuAn_0pDzL5B-9j9yRGxVZjUmL8J4wWIo",
  authDomain: "expense-tracker-97e2b.firebaseapp.com",
  projectId: "expense-tracker-97e2b",
  storageBucket: "expense-tracker-97e2b.firebasestorage.app",
  messagingSenderId: "971481007488",
  appId: "1:971481007488:web:f4764083a0d73ae10bad65",
});

const messaging = firebase.messaging();

// ✅ Unified logger (shows in SW devtools + Chrome internal logs)
function log(...args) {
  console.log("[FCM-SW]", ...args);
}
function warn(...args) {
  console.warn("[FCM-SW]", ...args);
}
function errLog(...args) {
  console.error("[FCM-SW]", ...args);
}

/**
 * ✅ Extract title/body from either:
 * - payload.notification.title/body
 * - payload.data.title/body
 */
function getTitle(payload) {
  return (
    (payload &&
      payload.notification &&
      typeof payload.notification.title === "string" &&
      payload.notification.title) ||
    (payload &&
      payload.data &&
      typeof payload.data.title === "string" &&
      payload.data.title) ||
    "Notification"
  );
}

function getBody(payload) {
  return (
    (payload &&
      payload.notification &&
      typeof payload.notification.body === "string" &&
      payload.notification.body) ||
    (payload &&
      payload.data &&
      typeof payload.data.body === "string" &&
      payload.data.body) ||
    ""
  );
}

/**
 * ✅ Convert ANY URL into a SAFE SAME-ORIGIN path.
 *
 * Accepts:
 * - "/dashboard"
 * - "dashboard"
 * - "https://old-preview.vercel.app/dashboard"
 * - "http://localhost:3000/dashboard"
 *
 * Output is ALWAYS a path like "/dashboard?x=1#y"
 * and is ALWAYS safe to open on current origin.
 */
function toSafeSameOriginPath(rawUrl) {
  const fallback = "/dashboard";

  try {
    const raw = typeof rawUrl === "string" ? rawUrl.trim() : "";
    if (!raw) return fallback;

    // 1) Absolute URL: keep only path/query/hash
    if (/^https?:\/\//i.test(raw)) {
      const abs = new URL(raw);
      const path =
        (abs.pathname || fallback) + (abs.search || "") + (abs.hash || "");
      return path.startsWith("/") ? path : "/" + path;
    }

    // 2) Relative path normalize ("dashboard" -> "/dashboard")
    const rel = raw.startsWith("/") ? raw : "/" + raw;

    // Validate by parsing relative on current origin
    const u = new URL(rel, self.location.origin);
    const path = (u.pathname || fallback) + (u.search || "") + (u.hash || "");
    return path.startsWith("/") ? path : "/" + path;
  } catch (e) {
    warn("⚠️ toSafeSameOriginPath failed:", e);
    return fallback;
  }
}

/**
 * ✅ Extract url safely (stored in notification data)
 * ALWAYS store as safe same-origin PATH.
 */
function getUrl(payload) {
  const data = (payload && payload.data) || {};
  const raw =
    typeof data.url === "string" && data.url.trim().length > 0
      ? data.url.trim()
      : "/dashboard";

  return toSafeSameOriginPath(raw);
}

/**
 * ✅ Small stable hash (no crypto needed)
 */
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  // convert to unsigned
  return (h >>> 0).toString(16);
}

/**
 * ✅ Extract notificationId (DEDUP KEY)
 *
 * IMPORTANT:
 * If you don't provide data.notificationId, we still dedupe using:
 * - payload.fcmMessageId / payload.messageId
 * - or hash of payload content
 */
function getNotificationId(payload) {
  const data = (payload && payload.data) || {};

  // 1) Your preferred ids
  if (typeof data.notificationId === "string" && data.notificationId.trim()) {
    return data.notificationId.trim();
  }
  if (typeof data.announcementId === "string" && data.announcementId.trim()) {
    return "announcement_" + data.announcementId.trim();
  }

  // 2) Firebase/FCM ids (often present)
  if (typeof payload?.fcmMessageId === "string" && payload.fcmMessageId.trim()) {
    return "fcm_" + payload.fcmMessageId.trim();
  }
  if (typeof payload?.messageId === "string" && payload.messageId.trim()) {
    return "msg_" + payload.messageId.trim();
  }

  // 3) Last resort: hash of important fields (still stable)
  try {
    const title = getTitle(payload);
    const body = getBody(payload);
    const url = getUrl(payload);

    const stable = JSON.stringify({
      title,
      body,
      url,
      data,
      from: payload?.from || null,
      collapseKey: payload?.collapseKey || null,
    });

    return "hash_" + hashString(stable);
  } catch {
    return null;
  }
}

/**
 * ✅ SW DEDUPE using Cache Storage (persistent per device)
 * Keep last N ids to prevent infinite growth.
 */
const DEDUPE_CACHE = "fcm_dedupe_v2";
const DEDUPE_MAX_KEYS = 120;

async function getSeenIds() {
  try {
    const cache = await caches.open(DEDUPE_CACHE);
    const res = await cache.match("/__seen_ids__");
    if (!res) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

async function saveSeenIds(list) {
  try {
    const cache = await caches.open(DEDUPE_CACHE);
    const trimmed = list.slice(-DEDUPE_MAX_KEYS);
    const blob = new Blob([JSON.stringify(trimmed)], {
      type: "application/json",
    });
    const res = new Response(blob);
    await cache.put("/__seen_ids__", res);
  } catch {
    // ignore
  }
}

async function shouldShowNotification(notificationId) {
  // If we still don't have id, allow (rare now because we hash)
  if (!notificationId) return true;

  const seen = await getSeenIds();
  if (seen.includes(notificationId)) {
    warn("⏭️ SW dedupe: skipping already shown:", notificationId);
    return false;
  }
  seen.push(notificationId);
  await saveSeenIds(seen);
  return true;
}

/**
 * ✅ Always show notification using unified format
 * ✅ Adds `tag` so browser replaces duplicates automatically
 */
async function showNotificationFromPayload(payload, source) {
  try {
    log("✅ showNotificationFromPayload:", source);
    log("📦 RAW PAYLOAD:", payload);

    const title = getTitle(payload);
    const body = getBody(payload);
    const data = (payload && payload.data) || {};

    // ✅ IMPORTANT: url always safe same-origin path
    const url = getUrl(payload);

    const notificationId = getNotificationId(payload);

    log("🟦 PARSED:", { title, body, url, notificationId, data });

    // ✅ DEDUPE GUARD
    const ok = await shouldShowNotification(notificationId);
    if (!ok) return;

    await self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      // ✅ Tag prevents duplicates (same tag replaces)
      tag: notificationId || undefined,
      renotify: false,
      data: { ...data, url, notificationId, __source: source },
    });

    log("✅ Notification shown successfully.");
  } catch (e) {
    errLog("❌ showNotificationFromPayload failed:", e);
  }
}

/**
 * ✅ Background handler
 */
messaging.onBackgroundMessage(function (payload) {
  log("🔥 onBackgroundMessage triggered!");
  showNotificationFromPayload(payload, "onBackgroundMessage");
});

/**
 * ✅ PUSH event handler (kept)
 */
self.addEventListener("push", function (event) {
  log("📩 PUSH EVENT RECEIVED");

  if (!event.data) {
    warn("⚠️ push event has no data");
    return;
  }

  try {
    const json = event.data.json();
    log("📦 PUSH EVENT JSON:", json);
    event.waitUntil(showNotificationFromPayload(json, "push-event"));
  } catch (e) {
    errLog("❌ push event parse failed:", e);

    // fallback to raw text
    try {
      const text = event.data.text();
      warn("⚠️ push raw text:", text);
    } catch (e2) {
      errLog("❌ push raw text failed:", e2);
    }
  }
});

/**
 * ✅ Handle click (open app)
 */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const rawUrl =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/dashboard";

  // ✅ Convert whatever rawUrl is into safe same-origin path
  const safePath = toSafeSameOriginPath(rawUrl);

  // ✅ Always open on CURRENT origin (prevents old vercel/localhost)
  const targetUrl = new URL(safePath, self.location.origin).href;

  log("🖱️ Notification clicked → rawUrl:", rawUrl);
  log("🖱️ Notification clicked → safePath:", safePath);
  log("🖱️ Notification clicked → targetUrl:", targetUrl);

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // focus existing same-origin client if present
      for (const client of allClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          if (clientOrigin === self.location.origin) {
            log("✅ Focusing existing client:", client.url);
            await client.focus();
            client.postMessage({
              type: "NOTIFICATION_CLICKED",
              url: safePath, // ✅ send safe path to app
            });
            return;
          }
        } catch {
          // ignore
        }
      }

      log("✅ Opening new window:", targetUrl);
      await clients.openWindow(targetUrl);
    })()
  );
});

/**
 * ✅ SW LIFECYCLE FIX (NO USER CLEAR CACHE NEEDED)
 * - skipWaiting(): activate new SW immediately after deploy
 * - clients.claim(): control pages immediately after activate
 * - message listener: allow page to request "skip waiting" if needed
 */
self.addEventListener("message", (event) => {
  try {
    const data = event?.data || {};
    if (data && data.type === "SKIP_WAITING") {
      log("📨 Received SKIP_WAITING message");
      self.skipWaiting();
    }
  } catch (e) {
    warn("⚠️ message handler failed:", e);
  }
});

self.addEventListener("install", function () {
  log("✅ SW INSTALLED");
  try {
    self.skipWaiting();
  } catch (e) {
    warn("⚠️ skipWaiting failed:", e);
  }
});

self.addEventListener("activate", function (event) {
  log("✅ SW ACTIVATED");
  event.waitUntil(
    (async () => {
      try {
        await clients.claim();
        log("✅ clients.claim() done");
      } catch (e) {
        warn("⚠️ clients.claim failed:", e);
      }
    })()
  );
});
