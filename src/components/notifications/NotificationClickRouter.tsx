// src/components/notifications/NotificationClickRouter.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for Service Worker postMessage:
 * { type: "NOTIFICATION_CLICKED", url: "/borrowings?open=ID" }
 *
 * ✅ No UI
 * ✅ No styling changes
 * ✅ No impact on existing notification bootstrap
 * ✅ Fixes routing on notification click for already-open tabs
 */

type NotificationClickedMessage = {
  type: "NOTIFICATION_CLICKED";
  url?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseNotificationClickedMessage(
  data: unknown
): NotificationClickedMessage | null {
  if (!isRecord(data)) return null;
  if (data.type !== "NOTIFICATION_CLICKED") return null;

  const url = typeof data.url === "string" ? data.url : undefined;
  return { type: "NOTIFICATION_CLICKED", url };
}

function normalizePath(input?: string): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;

  // Must be a safe app path (SW already enforces this, but we double-check).
  // Allow "/x", "/x?y=1", "/x#hash"
  if (!raw.startsWith("/")) return null;

  // Avoid weird protocol injection
  if (/^\/\//.test(raw)) return null;

  return raw;
}

export default function NotificationClickRouter(): null {
  const router = useRouter();

  // de-dupe repeated SW messages (some browsers can fire twice)
  const lastNavRef = useRef<{ url: string; at: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent<unknown>) => {
      const msg = parseNotificationClickedMessage(event.data);
      if (!msg) return;

      const url = normalizePath(msg.url);
      if (!url) return;

      const now = Date.now();
      const last = lastNavRef.current;

      if (last && last.url === url && now - last.at < 1500) {
        return; // ignore duplicate within 1.5s
      }

      lastNavRef.current = { url, at: now };

      // ✅ Route without reloading and keep app state intact
      router.push(url);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [router]);

  return null;
}
