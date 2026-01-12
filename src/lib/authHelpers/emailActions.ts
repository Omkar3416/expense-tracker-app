// src/lib/auth/emailActions.ts

import { sendEmailVerification, type User } from "firebase/auth";

/**
 * ✅ URL for Firebase email actions (verifyEmail + resetPassword)
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
const ACTION_URL = APP_URL
  ? `${APP_URL.replace(/\/$/, "")}/reset-password`
  : "";

export function getActionUrlForEmails(): string {
  const url =
    ACTION_URL ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/reset-password`
      : "");

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_APP_URL (action URL not available).");
  }

  return url;
}

export async function sendVerifyEmail(user: User) {
  const url = getActionUrlForEmails();
  await sendEmailVerification(user, {
    url,
    handleCodeInApp: true,
  });
}
