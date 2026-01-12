"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { getIdTokenResult } from "firebase/auth";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ModalPortal from "@/components/ui/ModalPortal";
import { useRouter } from "next/navigation";

const ADMIN_UI_KEY = "admin_ui_enabled";

export function isAdminUiEnabled() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(ADMIN_UI_KEY) === "true";
}

export function setAdminUiEnabled(v: boolean) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMIN_UI_KEY, v ? "true" : "false");
}

export default function AdminUnlock() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ long press timer
  const timerRef = useRef<number | null>(null);

  function startPress() {
    if (timerRef.current) return;

    timerRef.current = window.setTimeout(() => {
      setOpen(true);
      setMsg(null);
      setSecret("");
      setShowSecret(false);
    }, 1200);
  }

  function endPress() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function closeModal() {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      setMsg(null);
      setSecret("");
      setShowSecret(false);
    }, 180);
  }

  // ✅ Smooth open animation
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, [open]);

  // ✅ ESC close
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * ✅ Improved (secure) behavior:
   * - Still requires secret (no bypass)
   * - BUT: if admin claim already exists, we don't call API again
   * - Saves backend calls + avoids repeated claim writes
   */
  async function enableAdminUi() {
    setMsg(null);

    const user = auth.currentUser;
    if (!user) {
      setMsg("❌ Login first, then unlock admin.");
      return;
    }

    if (!secret.trim()) {
      setMsg("❌ Please enter admin secret.");
      return;
    }

    setLoading(true);

    try {
      // ✅ Refresh token first (maybe already admin)
      await user.getIdToken(true);

      const tokenResultBefore = await getIdTokenResult(user);
      const alreadyAdmin = Boolean(tokenResultBefore.claims.admin);

      // ✅ Only call API if claim not set
      if (!alreadyAdmin) {
        const res = await fetch("/api/admin/set-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: user.uid,
            secret: secret.trim(),
          }),
        });

        const data = (await res.json()) as { success?: boolean; error?: string };

        if (!res.ok) {
          setMsg(`❌ ${data.error ?? "Unauthorized"}`);
          return;
        }

        // ✅ Refresh token so new claim loads
        await user.getIdToken(true);
      }

      const tokenResultAfter = await getIdTokenResult(user);
      const isAdmin = Boolean(tokenResultAfter.claims.admin);

      if (!isAdmin) {
        setMsg("⚠️ Claim updated but not visible yet. Logout + Login once.");
        return;
      }

      // ✅ Enable Admin UI for this session BEFORE redirect
      setAdminUiEnabled(true);

      setMsg("✅ Admin mode enabled. Redirecting...");

      // ✅ Close modal smoothly then redirect once
      setVisible(false);
      setTimeout(() => {
        setOpen(false);
        router.push("/admin/dashboard");
      }, 250);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Something went wrong";
      setMsg(`❌ ${m}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ✅ Long press trigger */}
      <button
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        className="ml-3 text-[11px] text-white/30 hover:text-white/60 transition select-none"
        title="Hold 1.2 sec for Admin"
        type="button"
      >
        Admin
      </button>

      {/* ✅ CENTER MODAL */}
      {open && (
        <ModalPortal>
          <div
            className={[
              "fixed inset-0 z-[99999] flex items-center justify-center p-4",
              "bg-black/60 backdrop-blur-md transition-opacity duration-200",
              visible ? "opacity-100" : "opacity-0",
            ].join(" ")}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div
              className={[
                "w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6",
                "shadow-2xl shadow-black/60",
                "transition-all duration-200",
                visible ? "scale-100 translate-y-0" : "scale-95 translate-y-2",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white">Admin Unlock</h3>
                  <p className="text-sm text-white/60 mt-1">
                    Enter secret to enable Admin Mode (session based).
                  </p>
                </div>

                <button
                  onClick={closeModal}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition"
                  type="button"
                >
                  Close ✕
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {/* Secret input with show/hide */}
                <div className="relative">
                  <Input
                    placeholder="Enter ADMIN_SETUP_SECRET"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    type={showSecret ? "text" : "password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition"
                    title={showSecret ? "Hide secret" : "Show secret"}
                  >
                    {showSecret ? "🙈" : "👁️"}
                  </button>
                </div>

                {msg && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                    {msg}
                  </div>
                )}

                <Button
                  onClick={enableAdminUi}
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Please wait..." : "Enable Admin Mode"}
                </Button>

                <p className="text-xs text-white/50">
                  Tip: Click outside or press <b>ESC</b> to close.
                </p>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
