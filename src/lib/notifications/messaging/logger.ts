// src/lib/notifications/messaging/logger.ts

export function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log("[FCM]", ...args);
}

export function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn("[FCM]", ...args);
}

export function errLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error("[FCM]", ...args);
}
