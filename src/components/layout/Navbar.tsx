// src/components/layout/Navbar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AdminUnlock, {
  isAdminUiEnabled,
  setAdminUiEnabled,
} from "@/components/admin/AdminUnlock";
import AdminBadge from "@/components/admin/AdminBadge";
import { useEffect, useMemo, useRef, useState } from "react";
import { canShowAdminUnlock, getRole, logout } from "@/lib/auth";

import { auth } from "@/lib/firebaseClient";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";

import {
  DataMode,
  getDataMode,
  getDataModeLabel,
  setDataMode,
} from "@/lib/dataMode";

import NotificationBell from "@/components/notifications/NotificationBell";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [adminMode, setAdminMode] = useState(false);

  // ✅ Data mode state (Auto/Firestore/Local)
  const [mode, setMode] = useState<DataMode>("auto");

  // ✅ Profile dropdown state
  const [me, setMe] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  // ✅ show admin unlock button only for allowlisted users
  const [showAdminUnlock, setShowAdminUnlock] = useState(false);

  // ✅ Load current user (reactive)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setMe(u);
    });
    return () => unsub();
  }, []);

  // ✅ Determine whether Admin Unlock should be visible
  useEffect(() => {
    let alive = true;

    async function check() {
      const email = me?.email ?? null;

      if (!email) {
        if (alive) setShowAdminUnlock(false);
        return;
      }

      try {
        const ok = await canShowAdminUnlock(email);
        if (alive) setShowAdminUnlock(ok);
      } catch {
        if (alive) setShowAdminUnlock(false);
      }
    }

    check();

    return () => {
      alive = false;
    };
  }, [me?.email]);

  // ✅ Load admin mode (custom claim + session UI flag)
  useEffect(() => {
    let alive = true;

    async function load() {
      const role = await getRole();
      const uiEnabled = isAdminUiEnabled();

      if (!alive) return;

      const isAdminNow = role.isAdmin && uiEnabled;
      setAdminMode(isAdminNow);

      // ✅ Sync UI dropdown value from storage (for admins)
      // ✅ For normal users: force auto mode
      if (isAdminNow) {
        setMode(getDataMode());
      } else {
        setDataMode("auto");
        setMode("auto");
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [pathname]);

  // ✅ Reset admin UI when browser closes / refresh / reload
  useEffect(() => {
    function handleBeforeUnload() {
      setAdminUiEnabled(false);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ✅ Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!profileRef.current) return;
      const target = e.target as Node;
      if (!profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }

    if (profileOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  function handleModeChange(next: DataMode) {
    // ✅ only admins can switch (extra safety)
    if (!adminMode) return;

    setDataMode(next);
    setMode(next);

    // Optional: reload to make sure pages re-fetch with new mode
    window.location.reload();
  }

  async function exitAdminMode() {
    setAdminUiEnabled(false);
    setAdminMode(false);

    // ✅ Force back to Auto mode for normal session
    setDataMode("auto");
    setMode("auto");

    router.push("/dashboard");
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const navItems = useMemo(() => {
    const items = [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Transactions", href: "/transactions" },
      { label: "Borrowings", href: "/borrowings" },

      // ✅ NEW: Reminders section
      { label: "Reminders", href: "/reminders" },
    ];

    if (adminMode) {
      items.push({ label: "Admin Dashboard", href: "/admin/dashboard" });
    }

    return items;
  }, [adminMode]);

  // ✅ hide navbar on login page
  if (pathname === "/login") return null;

  const displayName =
    me?.displayName ||
    (me?.email ? me.email.split("@")[0] : null) ||
    "User";

  const photoURL = me?.photoURL || null;

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="backdrop-blur-xl bg-white/5 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-4">
          {/* ✅ LEFT: Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-3 group shrink-0"
          >
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-cyan-400 shadow-lg shadow-indigo-500/30" />
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <p className="font-bold leading-none text-white group-hover:text-white/90 transition">
                  Expense Tracker
                </p>
                <AdminBadge />
              </div>
              <p className="text-xs text-white/60 group-hover:text-white/70 transition">
                Smart finance dashboard
              </p>
            </div>
          </Link>

          {/* ✅ CENTER: Nav */}
          <nav className="hidden md:flex flex-1 items-center justify-center gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap",
                    active
                      ? "bg-white/10 text-white shadow shadow-white/10"
                      : "text-white/70 hover:text-white hover:bg-white/5",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* ✅ RIGHT */}
          <div className="flex flex-1 md:flex-none items-center justify-end gap-2">
            {/* ✅ Data Mode Toggle (Admin only) */}
            {adminMode && (
              <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-xs text-white/60">Data:</span>
                <select
                  value={mode}
                  onChange={(e) =>
                    handleModeChange(e.target.value as DataMode)
                  }
                  className="bg-transparent text-sm font-semibold text-white outline-none"
                >
                  <option value="auto" className="bg-[#0B1220]">
                    Auto
                  </option>
                  <option value="firestore" className="bg-[#0B1220]">
                    Firestore
                  </option>
                  <option value="local" className="bg-[#0B1220]">
                    Local
                  </option>
                </select>

                <span className="text-xs text-white/50">
                  ({getDataModeLabel(mode)})
                </span>
              </div>
            )}

            {/* ✅ Exit Admin mode button */}
            {adminMode && (
              <button
                onClick={exitAdminMode}
                className="hidden sm:inline-flex rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition"
                type="button"
              >
                Exit Admin
              </button>
            )}

            {/* ✅ Admin long press button ONLY for allowlisted users, ONLY when not in adminMode */}
            {!adminMode && showAdminUnlock && <AdminUnlock />}

            {/* ✅ Notifications bell (safe, does not auto request permission) */}
            <NotificationBell />

            {/* ✅ Avatar button */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center overflow-hidden"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                {photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoURL}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-white/80 font-bold text-sm">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>

              {/* ✅ Profile dropdown */}
              {profileOpen && (
                <div className="absolute right-0 mt-3 w-[320px] rounded-3xl border border-white/10 bg-[#0B1220]/90 backdrop-blur-xl shadow-xl shadow-black/30 p-4">
                  <div className="flex items-center gap-3">
                    {photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoURL}
                        alt="Profile"
                        className="h-12 w-12 rounded-2xl object-cover border border-white/10"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-white/70 font-bold">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {displayName}
                      </p>
                      <p className="text-xs text-white/60 truncate">
                        {me?.email ?? "No email"}
                      </p>
                      <p className="mt-1 text-[11px] text-white/40">
                        Role:{" "}
                        <span className="text-white/70 font-semibold">
                          {adminMode ? "Admin" : "User"}
                        </span>
                      </p>
                    </div>
                  </div>

                  {me?.uid && (
                    <p className="mt-3 text-[11px] text-white/40 break-all">
                      UID: {me.uid}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href="/dashboard"
                      onClick={() => setProfileOpen(false)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 transition text-center"
                    >
                      Go to Dashboard
                    </Link>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 transition"
                    >
                      Logout
                    </button>
                  </div>

                  {adminMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        exitAdminMode();
                      }}
                      className="mt-3 w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 transition"
                    >
                      Exit Admin Mode
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ✅ MOBILE NAV */}
        <div className="md:hidden px-4 pb-4">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "px-4 py-2 rounded-xl text-sm font-medium transition",
                    active
                      ? "bg-white/10 text-white shadow shadow-white/10"
                      : "text-white/70 hover:text-white hover:bg-white/5",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
