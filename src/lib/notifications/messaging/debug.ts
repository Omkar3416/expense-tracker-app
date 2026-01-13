// src/lib/notifications/messaging/debug.ts

import { isSupported } from "firebase/messaging";
import { log, warn } from "./logger";

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
