// src/app/reset-password/ResetPasswordClient.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
  type ActionCodeInfo,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebaseClient";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Mode = "verifyEmail" | "resetPassword" | "action" | null;

type SearchParamsLike = {
  get(key: string): string | null;
};

function getParam(sp: SearchParamsLike, key: string): string | null {
  const v = sp.get(key);
  return v ? v.trim() : null;
}

function getContinueUrl(searchParams: SearchParamsLike): string | null {
  const raw = getParam(searchParams, "continueUrl");
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.toString();
  } catch {
    return null;
  }
}

function getFirebaseErrorCode(e: unknown): string | null {
  // FirebaseError has `code` like "auth/expired-action-code"
  const fe = e as Partial<FirebaseError> | null;
  const code = fe?.code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

export default function ResetPasswordClient() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6 text-white/60">
          Loading...
        </main>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams(); // ReadonlyURLSearchParams

  const mode = useMemo<Mode>(() => {
    const m = getParam(searchParams, "mode");
    if (m === "verifyEmail" || m === "resetPassword" || m === "action") return m;
    return null;
  }, [searchParams]);

  const oobCode = useMemo<string | null>(() => {
    return getParam(searchParams, "oobCode");
  }, [searchParams]);

  const continueUrl = useMemo<string | null>(() => {
    return getContinueUrl(searchParams);
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [resetReady, setResetReady] = useState(false);

  const [actionResolved, setActionResolved] = useState<
    "verifyEmail" | "resetPassword" | null
  >(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      setStatus(null);
      setResetReady(false);
      setActionResolved(null);

      if (!mode || !oobCode) {
        setError("Invalid or expired link. Please request again.");
        setLoading(false);
        return;
      }

      try {
        if (mode === "verifyEmail") {
          await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setStatus("✅ Email verified successfully. Please login again.");
          return;
        }

        if (mode === "resetPassword") {
          await verifyPasswordResetCode(auth, oobCode);
          setResetReady(true);
          return;
        }

        if (mode === "action") {
          const info: ActionCodeInfo = await checkActionCode(auth, oobCode);

          if (info.operation === "VERIFY_EMAIL") {
            await applyActionCode(auth, oobCode);
            setActionResolved("verifyEmail");
            setStatus("✅ Email verified successfully. Please login again.");
            return;
          }

          if (info.operation === "PASSWORD_RESET") {
            await verifyPasswordResetCode(auth, oobCode);
            setActionResolved("resetPassword");
            setResetReady(true);
            return;
          }

          setError("Unsupported action. Please request a new link.");
          return;
        }

        setError("Unsupported action.");
      } catch (e: unknown) {
        const code = getFirebaseErrorCode(e);

        if (code === "auth/expired-action-code") {
          setError("This link has expired. Please request a new one.");
        } else if (code === "auth/invalid-action-code") {
          setError("Invalid link. Please request a new one.");
        } else {
          setError("Invalid or expired link. Please request again.");
        }
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [mode, oobCode]);

  async function handleResetPassword() {
    setError(null);
    setStatus(null);

    if (!oobCode) {
      setError("Invalid reset link.");
      return;
    }

    if (newPass.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPass !== confirmPass) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPass);
      setStatus("✅ Password reset successfully. Please login again.");
      setResetReady(false);
    } catch (e: unknown) {
      const code = getFirebaseErrorCode(e);

      if (code === "auth/expired-action-code") {
        setError("This link has expired. Please request a new one.");
      } else if (code === "auth/invalid-action-code") {
        setError("Invalid link. Please request a new one.");
      } else {
        setError("Password reset failed. Please request again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function goToLogin() {
    router.replace("/login");
  }

  function goToContinueUrl() {
    if (continueUrl) {
      window.location.href = continueUrl;
      return;
    }
    router.replace("/login");
  }

  const finalModeTitle =
    mode === "verifyEmail"
      ? "Verify Email"
      : mode === "resetPassword"
      ? "Reset Password"
      : mode === "action"
      ? actionResolved === "verifyEmail"
        ? "Verify Email"
        : actionResolved === "resetPassword"
        ? "Reset Password"
        : "Action"
      : "Action";

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
        <h1 className="text-3xl font-bold tracking-tight">{finalModeTitle}</h1>

        <p className="text-white/60 mt-2 text-sm">
          Secure action powered by Firebase.
        </p>

        <div className="mt-6 space-y-3">
          {loading && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              Please wait...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          {status && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              {status}
            </div>
          )}

          {resetReady && !status && (
            <div className="space-y-3">
              <Input
                placeholder="New password"
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />

              <Input
                placeholder="Confirm password"
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
              />

              <Button
                onClick={handleResetPassword}
                className="w-full"
                disabled={loading}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          )}

          {!loading &&
            (mode === "verifyEmail" || actionResolved === "verifyEmail") && (
              <Button onClick={goToLogin} className="w-full">
                Go to Login
              </Button>
            )}

          {status && (
            <Button onClick={goToContinueUrl} className="w-full">
              Continue
            </Button>
          )}

          {!loading && !status && (
            <button
              onClick={goToLogin}
              className="text-sm text-white/70 hover:text-white underline w-full"
              type="button"
            >
              Back to Login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
