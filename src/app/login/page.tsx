// src/app/login/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  login,
  register,
  loginWithGoogle,
  loginWithGoogleAdminOnly,
  sendResetPasswordEmail,
  resendVerificationEmail,
} from "@/lib/auth";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ModalPortal from "@/components/ui/ModalPortal";
import { useRouter } from "next/navigation";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(p: string) {
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(p)) return "Password must include 1 uppercase letter.";
  if (!/[a-z]/.test(p)) return "Password must include 1 lowercase letter.";
  if (!/[0-9]/.test(p)) return "Password must include 1 number.";
  if (!/[!@#$%^&*(),.?\":{}|<>_\-+=~`[\]\\;/]/.test(p))
    return "Password must include 1 special character.";
  return null;
}

function passwordRule(password: string) {
  return password.length >= 6;
}

function mapFirebaseError(err: unknown) {
  const msg = err instanceof Error ? err.message : "Something went wrong";

  if (msg.includes("auth/popup-blocked"))
    return "Popup blocked by browser. Please allow popups or try again.";
  if (msg.includes("auth/popup-closed-by-user"))
    return "Popup closed. Please try again.";
  if (msg.includes("auth/operation-not-supported-in-this-environment"))
    return "Google login is not supported in this environment (WebView/Blocked cookies). Please try Chrome / Safari.";
  if (msg.includes("auth/cancelled-popup-request"))
    return "Another popup request was cancelled. Please try again.";
  if (msg.includes("auth/network-request-failed"))
    return "Network error. Please check your internet connection.";

  // ✅ With enumeration protection, Firebase may not tell user-not-found correctly
  if (
    msg.includes("auth/wrong-password") ||
    msg.includes("auth/user-not-found") ||
    msg.includes("auth/invalid-credential") ||
    msg.includes("auth/invalid-login-credentials")
  ) {
    return "❌ Invalid email or password. If you are new, please register first.";
  }

  if (msg.toLowerCase().includes("not verified")) return msg;

  if (msg.includes("auth/email-already-in-use"))
    return "❌ This email is already registered. Please login instead.";

  return msg;
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [adminGoogleLoading, setAdminGoogleLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [resendLoading, setResendLoading] = useState(false);

  // ---------- Forgot Password Modal ----------
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotErr, setForgotErr] = useState<string | null>(null);

  // ---------- Forgot Email Modal ----------
  const [forgotEmailOpen, setForgotEmailOpen] = useState(false);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("remember_email");
      const savedRemember = localStorage.getItem("remember_me");

      if (savedEmail) setEmail(savedEmail);
      if (savedRemember === "true") setRemember(true);
      if (savedRemember === "false") setRemember(false);
    } catch {}
  }, []);

  const emailOk = isValidEmail(email);
  const passOk = passwordRule(password);
  const canSubmit = emailOk && passOk && !loading;

  const isAnyLoading = loading || googleLoading || adminGoogleLoading;

  function persistRememberPrefs(currentEmail: string) {
    try {
      localStorage.setItem("remember_me", String(remember));
      if (remember) localStorage.setItem("remember_email", currentEmail.trim());
      else localStorage.removeItem("remember_email");
    } catch {}
  }

  async function handleSubmit() {
    setErr(null);
    setSuccess(null);

    const safeEmail = email.trim();

    if (!isValidEmail(safeEmail)) {
      setErr("Please enter a valid email address.");
      return;
    }

    if (!passOk) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    if (mode === "register") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setErr(passwordError);
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        await login(safeEmail, password, remember);
        persistRememberPrefs(safeEmail);
        router.push("/dashboard");
        return;
      }

      // ✅ register
      await register(safeEmail, password, remember);

      setSuccess(
        "✅ Please check your email for email verification. We sent you the verification link."
      );

      setMode("login");
      setPassword("");
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (googleLoading || loading || adminGoogleLoading) return;

    setErr(null);
    setSuccess(null);
    setGoogleLoading(true);

    try {
      const user = await loginWithGoogle(remember);
      persistRememberPrefs(user.email ?? email);
      router.push("/dashboard");
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleAdminGoogleLogin() {
    if (adminGoogleLoading || loading || googleLoading) return;

    setErr(null);
    setSuccess(null);
    setAdminGoogleLoading(true);

    try {
      const user = await loginWithGoogleAdminOnly(remember);
      persistRememberPrefs(user.email ?? email);
      router.push("/dashboard");
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setAdminGoogleLoading(false);
    }
  }

  async function handleResendVerification() {
    if (resendLoading) return;

    setErr(null);
    setSuccess(null);
    setResendLoading(true);

    try {
      if (!email.trim() || !password.trim()) {
        setErr("❌ Please enter email and password to resend verification email.");
        return;
      }

      await resendVerificationEmail(email.trim(), password, remember);
      setSuccess("✅ Verification email sent again. Please check Inbox/Spam.");
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
    } finally {
      setResendLoading(false);
    }
  }

  // ---------- Forgot Password ----------
  function openForgot() {
    setForgotOpen(true);
    setForgotEmail(email.trim());
    setForgotMsg(null);
    setForgotErr(null);
  }

  function closeForgot() {
    setForgotOpen(false);
    setForgotLoading(false);
    setForgotMsg(null);
    setForgotErr(null);
  }

  async function sendReset() {
    setForgotMsg(null);
    setForgotErr(null);

    const safe = forgotEmail.trim();

    if (!isValidEmail(safe)) {
      setForgotErr("Please enter a valid email address.");
      return;
    }

    setForgotLoading(true);

    try {
      try {
        await sendResetPasswordEmail(safe);
      } catch {
        // ignore
      }

      setForgotMsg("✅ If this email exists, a password reset link has been sent.");
    } finally {
      setForgotLoading(false);
    }
  }

  function openForgotEmail() {
    setForgotEmailOpen(true);
  }

  function closeForgotEmail() {
    setForgotEmailOpen(false);
  }

  const title = useMemo(
    () => (mode === "login" ? "Login" : "Create account"),
    [mode]
  );

  const showResend = !!err && err.toLowerCase().includes("verify");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>

        <p className="text-white/60 mt-2 text-sm">
          Secure authentication using Firebase.
        </p>

        <div className="mt-6 space-y-3">
          <button
            onClick={handleGoogleLogin}
            disabled={isAnyLoading}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition flex items-center justify-center gap-2 disabled:opacity-60"
            type="button"
          >
            <span className="text-lg">🟦</span>
            {googleLoading ? "Connecting..." : "Continue with Google"}
          </button>

          <button
            onClick={handleAdminGoogleLogin}
            disabled={isAnyLoading}
            className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold hover:bg-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-60"
            type="button"
          >
            <span className="text-lg">🛡️</span>
            {adminGoogleLoading
              ? "Checking Admin..."
              : "Admin Login with Google"}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <p className="text-xs text-white/40">OR</p>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <Input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />

          <div className="relative">
            <Input
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
            />

            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-white/70 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4"
              disabled={isAnyLoading}
            />
            Remember me (stay logged in)
          </label>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={openForgot}
              className="text-xs text-indigo-200 hover:text-indigo-100 underline"
              disabled={isAnyLoading}
            >
              Forgot password?
            </button>

            <button
              type="button"
              onClick={openForgotEmail}
              className="text-xs text-white/60 hover:text-white underline"
              disabled={isAnyLoading}
            >
              Forgot email?
            </button>
          </div>

          {success && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {success}
            </div>
          )}

          {err && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {err}
            </div>
          )}

          {showResend && (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendLoading || isAnyLoading}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-60"
            >
              {resendLoading ? "Sending..." : "Resend Verification Email"}
            </button>
          )}

          <Button onClick={handleSubmit} className="w-full" disabled={!canSubmit}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
          </Button>

          <button
            onClick={() => {
              setErr(null);
              setSuccess(null);
              setMode((m) => (m === "login" ? "register" : "login"));
            }}
            className="text-sm text-white/70 hover:text-white underline w-full"
            type="button"
            disabled={isAnyLoading}
          >
            {mode === "login"
              ? "Don't have an account? Register"
              : "Already have an account? Login"}
          </button>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeForgot} />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Reset Password</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Enter your email and we will send a password reset link.
                  </p>
                </div>

                <button
                  onClick={closeForgot}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <Input
                  placeholder="Email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  type="email"
                />

                {forgotErr && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    {forgotErr}
                  </div>
                )}

                {forgotMsg && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    {forgotMsg}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={closeForgot}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                    disabled={forgotLoading}
                  >
                    Cancel
                  </button>

                  <Button onClick={sendReset} className="px-6" disabled={forgotLoading}>
                    {forgotLoading ? "Sending..." : "Send Link"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Forgot Email Modal */}
      {forgotEmailOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeForgotEmail} />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Forgot Email</h3>
                  <p className="text-xs text-white/60 mt-1">
                    For security, we can’t display emails automatically.
                  </p>
                </div>

                <button
                  onClick={closeForgotEmail}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-2 text-sm text-white/70">
                <p>
                  ✅ Try <b>Continue with Google</b> if you used Google before.
                </p>
                <p>✅ Search your mail inbox for:</p>
                <p className="text-xs text-white/50">
                  • “Firebase” <br />
                  • “Expense Tracker” <br />• “Password reset”
                </p>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={closeForgotEmail} className="px-6">
                  OK
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </main>
  );
}
