// src/lib/notifications/messaging/sw.ts

import { errLog, log, warn } from "./logger";

const SW_URL = "/firebase-messaging-sw.js";

/** Wait briefly for controller to change once (so new SW takes control). No reload, no loops. */
async function waitForControllerChangeOnce(timeoutMs = 1500): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

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

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const found = regs.find((r) => r.active?.scriptURL?.includes(SW_URL));

    const reg = found ?? (await navigator.serviceWorker.register(SW_URL));

    log(found ? "Found existing SW registration:" : "Registered new SW:", {
      scope: reg.scope,
      scriptURL:
        reg.active?.scriptURL ??
        reg.waiting?.scriptURL ??
        reg.installing?.scriptURL ??
        null,
    });

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

    await navigator.serviceWorker.ready;

    // Helps Mac stale SW cases
    await waitForControllerChangeOnce();

    return reg;
  } catch (e) {
    errLog("Service worker register failed:", e);
    return null;
  }
}

/** ✅ Reset ONLY firebase messaging SW */
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
