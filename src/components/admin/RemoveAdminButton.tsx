"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { getRole, logout } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function RemoveAdminButton() {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Check role on mount
  useEffect(() => {
    async function load() {
      const role = await getRole();
      setIsAdmin(role.isAdmin);
    }
    load();
  }, []);

  if (!isAdmin) return null;

  async function handleRemoveAdmin() {
    const user = auth.currentUser;
    if (!user) return;

    const secret = prompt("Enter ADMIN_SETUP_SECRET to remove admin");
    if (!secret) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/remove-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          secret,
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok) {
        alert(data.error ?? "Failed to remove admin");
        return;
      }

      await user.getIdToken(true);

      alert("✅ Admin removed. You are now a normal user.");

      // ✅ easiest: logout and login again (fresh token always)
      await logout();
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRemoveAdmin}
      disabled={loading}
      className="ml-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition disabled:opacity-50"
      type="button"
      title="Remove admin access from this account"
    >
      {loading ? "Removing..." : "Remove Admin"}
    </button>
  );
}
