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
 * ✅ Extract url safely
 */
function getUrl(payload) {
  const data = (payload && payload.data) || {};
  return typeof data.url === "string" && data.url.trim().length > 0
    ? data.url.trim()
    : "/dashboard";
}

/**
 * ✅ Extract notificationId
 * This is REQUIRED for dedupe.
 * - reminders: notificationId
 * - announcements: announcementId fallback
 */
function getNotificationId(payload) {
  const data = (payload && payload.data) || {};
  if (typeof data.notificationId === "string" && data.notificationId.trim()) {
    return data.notificationId.trim();
  }
  if (typeof data.announcementId === "string" && data.announcementId.trim()) {
    return "announcement_" + data.announcementId.trim();
  }
  return null;
}

/**
 * ✅ SW DEDUPE using Cache Storage (persistent per device)
 * Prevents double-show when BOTH:
 * - onBackgroundMessage fires
 * - AND push-event fires
 */
const DEDUPE_CACHE = "fcm_dedupe_v1";
const DEDUPE_MAX_KEYS = 80; // keep last N keys

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
  if (!notificationId) return true; // cannot dedupe without id
  const seen = await getSeenIds();
  if (seen.includes(notificationId)) {
    warn("⏭️ SW dedupe: skipping already shown notificationId:", notificationId);
    return false;
  }
  seen.push(notificationId);
  await saveSeenIds(seen);
  return true;
}

/**
 * ✅ Always show notification using unified format
 */
async function showNotificationFromPayload(payload, source) {
  try {
    log("✅ showNotificationFromPayload:", source);
    log("📦 RAW PAYLOAD:", payload);

    const title = getTitle(payload);
    const body = getBody(payload);
    const data = (payload && payload.data) || {};
    const url = getUrl(payload);

    const notificationId = getNotificationId(payload);

    log("🟦 PARSED:", { title, body, url, notificationId, data });

    // ✅ DEDUPE GUARD
    const ok = await shouldShowNotification(notificationId);
    if (!ok) return;

    await self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      data: { ...data, url, notificationId, __source: source },
    });

    log("✅ Notification shown successfully.");
  } catch (e) {
    errLog("❌ showNotificationFromPayload failed:", e);
  }
}

/**
 * ✅ Background notification handler (DATA-only messages)
 * This runs only for data messages in background.
 */
messaging.onBackgroundMessage(function (payload) {
  log("🔥 onBackgroundMessage triggered!");
  showNotificationFromPayload(payload, "onBackgroundMessage");
});

/**
 * ✅ PERMANENT FIX:
 * Chrome sometimes delivers notification messages directly
 * and does NOT call onBackgroundMessage.
 *
 * So we listen to raw PUSH events too.
 *
 * ✅ DEDUPE ensures NO double notifications even if both fire.
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

  const url =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/dashboard";

  log("🖱️ Notification clicked → url:", url);

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // ✅ If app already open → focus it
      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          log("✅ Focusing existing client:", client.url);
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICKED",
            url,
          });
          return;
        }
      }

      // ✅ Otherwise open new tab
      log("✅ Opening new window:", url);
      await clients.openWindow(url);
    })()
  );
});

/**
 * ✅ Extra: log SW install/activate lifecycle for debugging
 */
self.addEventListener("install", function () {
  log("✅ SW INSTALLED");
});

self.addEventListener("activate", function () {
  log("✅ SW ACTIVATED");
});
