// src/lib/notifications/messaging/foregroundDedupe.ts

import { warn } from "./logger";

const FG_DEDUPE_KEY = "fcm_fg_seen_ids_v1";

function loadSeenFgIds(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = sessionStorage.getItem(FG_DEDUPE_KEY);
    if (!raw) return new Set();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveSeenFgIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;

  try {
    const arr = Array.from(ids).slice(-100);
    sessionStorage.setItem(FG_DEDUPE_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

/** ✅ returns true if this notificationId should be processed */
export function shouldProcessForegroundNotification(
  notificationId: string | undefined
): boolean {
  if (!notificationId) return true;

  const set = loadSeenFgIds();
  if (set.has(notificationId)) {
    warn("⚠️ Foreground dedupe: skipping already seen notificationId:", notificationId);
    return false;
  }

  set.add(notificationId);
  saveSeenFgIds(set);
  return true;
}
