// src/lib/auth/firebaseErrorHelpers.ts

import type { AuthError } from "firebase/auth";

export function getFirebaseErrorCode(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const maybe = e as Partial<AuthError>;
  return typeof maybe.code === "string" ? maybe.code : null;
}

export function getFirebaseCustomEmail(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const obj = e as { customData?: unknown };
  if (!obj.customData || typeof obj.customData !== "object") return null;
  const cd = obj.customData as { email?: unknown };
  return typeof cd.email === "string" ? cd.email : null;
}
