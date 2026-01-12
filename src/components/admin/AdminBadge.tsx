"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/firebaseClient";
import { getIdTokenResult } from "firebase/auth";
import { isAdminUiEnabled } from "@/components/admin/AdminUnlock";

export default function AdminBadge() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      const user = auth.currentUser;

      if (!user) {
        if (alive) setShow(false);
        return;
      }

      try {
        // ✅ DO NOT force refresh here (no true)
        const token = await getIdTokenResult(user);
        const claimAdmin = Boolean(token.claims.admin);
        const uiEnabled = isAdminUiEnabled();

        if (alive) setShow(claimAdmin && uiEnabled);
      } catch {
        if (alive) setShow(false);
      }
    }

    load();

    // ✅ listen for UI admin mode toggle changes (sessionStorage updates)
    function onStorageChange() {
      load();
    }

    window.addEventListener("storage", onStorageChange);

    return () => {
      alive = false;
      window.removeEventListener("storage", onStorageChange);
    };
  }, [pathname]);

  if (!show) return null;

  return (
    <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
      ✅ ADMIN MODE
    </span>
  );
}
