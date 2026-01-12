// src/lib/auth.ts

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  getIdTokenResult,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  type User,
} from "firebase/auth";

import { auth } from "./firebaseClient";
import { setAdminUiEnabled } from "@/components/admin/AdminUnlock";

import {
  getAdminGoogleConfig,
  isAllowedByEmail,
  MAIN_ADMIN_EMAIL,
  normalizeEmail,
  type AdminGoogleConfig,
} from "@/lib/authHelpers/adminGoogleConfig";

import { logSecurityEvent } from "@/lib/authHelpers/securityLogs";
import {
  sendVerifyEmail,
  getActionUrlForEmails,
} from "@/lib/authHelpers/emailActions";
import {
  getFirebaseCustomEmail,
  getFirebaseErrorCode,
} from "@/lib/authHelpers/firebaseErrorHelpers";

/**
 * ✅ Secure Remember-me persistence
 */
async function applyPersistence(remember: boolean) {
  try {
    await setPersistence(
      auth,
      remember ? browserLocalPersistence : browserSessionPersistence
    );
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* ✅ Email sign-in methods helper (ONLY for Google conflict message) */
/* ------------------------------------------------------------------ */
export async function getEmailSignInMethods(email: string): Promise<string[]> {
  const safe = email.trim();
  if (!safe) return [];
  try {
    const methods = await fetchSignInMethodsForEmail(auth, safe);
    return Array.isArray(methods) ? methods : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* ✅ Email / Password Login/Register                                 */
/* ------------------------------------------------------------------ */
export async function login(email: string, password: string, remember: boolean) {
  await applyPersistence(remember);

  const res = await signInWithEmailAndPassword(auth, email.trim(), password);

  if (!res.user.emailVerified) {
    await signOut(auth);
    throw new Error(
      "❌ Your email is not verified. Please verify your email first (check Inbox/Spam), then login again."
    );
  }

  return res.user;
}

export async function register(
  email: string,
  password: string,
  remember: boolean
) {
  await applyPersistence(remember);

  const res = await createUserWithEmailAndPassword(auth, email.trim(), password);

  await sendVerifyEmail(res.user);

  await new Promise((r) => setTimeout(r, 300));

  await signOut(auth);

  return res.user;
}

/* ------------------------------------------------------------------ */
/* ✅ Google Login (Normal Users)                                     */
/* ------------------------------------------------------------------ */
export async function loginWithGoogle(remember: boolean): Promise<User> {
  await applyPersistence(remember);

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const res = await signInWithPopup(auth, provider);

    if (!res.user.emailVerified) {
      await signOut(auth);
      throw new Error(
        "❌ Your Google account email is not verified. Please verify it and try again."
      );
    }

    return res.user;
  } catch (e: unknown) {
    const code = getFirebaseErrorCode(e);

    // ✅ This happens when email exists with password provider
    if (code === "auth/account-exists-with-different-credential") {
      const email = getFirebaseCustomEmail(e);
      if (!email) {
        throw new Error("❌ Google login failed. Please try again.");
      }

      const methods = await getEmailSignInMethods(email);

      if (methods.includes("password")) {
        throw new Error(
          "❌ This email is already registered using Email/Password.\n✅ Please login using Email/Password instead."
        );
      }

      throw new Error(
        "❌ This email is already registered using a different login method."
      );
    }

    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* ✅ Admin Google Login                                              */
/* ------------------------------------------------------------------ */
export async function loginWithGoogleAdminOnly(
  remember: boolean
): Promise<User> {
  await applyPersistence(remember);

  const config = await getAdminGoogleConfig();

  if (!config.adminGoogleEnabled) {
    throw new Error(
      "❌ Admin Google login is disabled. Ask admin to enable it in Admin Panel."
    );
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const res = await signInWithPopup(auth, provider);

    if (!res.user.emailVerified) {
      await signOut(auth);
      throw new Error("❌ Your Google email is not verified. Please verify first.");
    }

    const email = res.user.email ?? null;
    const allowed = isAllowedByEmail(email, config.adminAllowedGoogleEmails);

    if (!allowed) {
      await logSecurityEvent({
        type: "ADMIN_GOOGLE_LOGIN_BLOCKED",
        email,
        uid: res.user.uid ?? null,
        reason: "Not in allowed admin email list",
        extra: { email },
      });

      await signOut(auth);
      throw new Error("❌ This Google account is not allowed for Admin login.");
    }

    return res.user;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Admin Google login error";

    await logSecurityEvent({
      type: "ADMIN_GOOGLE_LOGIN_ERROR",
      email: auth.currentUser?.email ?? null,
      uid: auth.currentUser?.uid ?? null,
      reason: msg,
    });

    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* ✅ Forgot Password                                                 */
/* ------------------------------------------------------------------ */
export async function sendResetPasswordEmail(email: string): Promise<boolean> {
  const url = getActionUrlForEmails();

  await sendPasswordResetEmail(auth, email.trim(), {
    url,
    handleCodeInApp: true,
  });

  return true;
}

/* ------------------------------------------------------------------ */
/* ✅ Resend verification email                                       */
/* ------------------------------------------------------------------ */
export async function resendVerificationEmail(
  email: string,
  password: string,
  remember: boolean
): Promise<boolean> {
  await applyPersistence(remember);

  const res = await signInWithEmailAndPassword(auth, email.trim(), password);

  if (res.user.emailVerified) {
    await signOut(auth);
    throw new Error("✅ Your email is already verified. Please login normally.");
  }

  await sendVerifyEmail(res.user);
  await signOut(auth);

  return true;
}

/* ------------------------------------------------------------------ */
/* ✅ Logout                                                          */
/* ------------------------------------------------------------------ */
export async function logout(): Promise<void> {
  try {
    setAdminUiEnabled(false);
  } catch {}

  await signOut(auth);
}

/* ------------------------------------------------------------------ */
/* ✅ Role (Admin Claim Check)                                        */
/* ------------------------------------------------------------------ */
export async function getRole() {
  const user = auth.currentUser;
  if (!user) return { isAdmin: false, uid: null, email: null };

  try {
    const result = await getIdTokenResult(user);
    const isAdmin = Boolean(result.claims.admin);

    return { isAdmin, uid: user.uid, email: user.email };
  } catch (err: unknown) {
    console.error("getRole failed:", err);
    return { isAdmin: false, uid: user.uid, email: user.email };
  }
}

/* ------------------------------------------------------------------ */
/* ✅ AdminUnlock visibility helper                                   */
/* ------------------------------------------------------------------ */
export async function canShowAdminUnlock(
  email: string | null
): Promise<boolean> {
  if (!email) return false;

  const normalized = normalizeEmail(email);
  if (normalized === MAIN_ADMIN_EMAIL) return true;

  const config = await getAdminGoogleConfig();
  if (!config.adminGoogleEnabled) return false;

  return isAllowedByEmail(normalized, config.adminAllowedGoogleEmails);
}

// ✅ Re-export type for backward compatibility
export type { AdminGoogleConfig };
