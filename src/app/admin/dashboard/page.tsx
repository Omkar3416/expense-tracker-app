// src/app/admin/dashboard/page.tsx
"use client";

import { logout } from "@/lib/auth";
import { auth } from "@/lib/firebaseClient";
import { useRouter } from "next/navigation";
import { useState } from "react";

import AdminGoogleConfigCard from "@/components/admin/AdminGoogleConfigCard";
import SecurityLogsCard from "@/components/admin/SecurityLogsCard";
import AnnouncementsCard from "@/components/admin/AnnouncementsCard";

export default function AdminDashboardPage() {
  const router = useRouter();

  // ---------- Existing functionality (KEEP) ----------
  const [loadingExit, setLoadingExit] = useState(false);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  async function exitAdminMode() {
    const user = auth.currentUser;
    if (!user) return;

    const secret = prompt("Enter ADMIN_SETUP_SECRET to remove admin") || "";
    if (!secret.trim()) return;

    setLoadingExit(true);

    try {
      const res = await fetch("/api/admin/remove-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          secret: secret.trim(),
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok) {
        alert(data.error ?? "Failed to remove admin");
        return;
      }

      // ✅ refresh token
      await user.getIdToken(true);

      router.push("/dashboard");
    } finally {
      setLoadingExit(false);
    }
  }

  return (
    <main className="pt-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Admin Dashboard{" "}
            <span className="text-white/40 text-lg font-medium">(admin)</span>
          </h1>

          <p className="text-white/60 mt-2">
            Only admin users can access this page.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={exitAdminMode}
            disabled={loadingExit}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition disabled:opacity-60"
          >
            {loadingExit ? "Removing..." : "Exit Admin Mode"}
          </button>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Cards */}
      <AdminGoogleConfigCard />
      <SecurityLogsCard />
      <AnnouncementsCard />

      {/* Placeholder */}
      <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/80">
          ✅ Admin Features will come here (manage users, reports, etc.)
        </p>
      </div>
    </main>
  );
}
