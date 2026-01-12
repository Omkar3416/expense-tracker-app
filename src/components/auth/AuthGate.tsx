// src/components/auth/AuthGate.tsx
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, getIdTokenResult, reload } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { usePathname, useRouter } from "next/navigation";
import { isAdminUiEnabled } from "@/components/admin/AdminUnlock";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        // ✅ Public pages always accessible
        if (pathname === "/login" || pathname === "/reset-password") {
          // ✅ IMPORTANT FIX:
          // Do NOT redirect to dashboard if email is not verified
          if (user) {
            try {
              await reload(user);
            } catch {
              // ignore
            }

            // ✅ Only verified users can go dashboard
            if (user.emailVerified) {
              router.replace("/dashboard");
              return;
            }

            // ✅ Unverified users should stay on login
            setReady(true);
            return;
          }

          setReady(true);
          return;
        }

        // ✅ not logged in
        if (!user) {
          router.replace("/login");
          return;
        }

        // ✅ email verification required (for password users)
        try {
          await reload(user);
        } catch {
          // ignore
        }

        if (user.email && !user.emailVerified) {
          router.replace("/login");
          return;
        }

        // ✅ admin route protection
        if (pathname.startsWith("/admin")) {
          try {
            const tokenResult = await getIdTokenResult(user, true);
            const claimAdmin = Boolean(tokenResult.claims.admin);
            const adminUi = isAdminUiEnabled();

            if (!claimAdmin || !adminUi) {
              router.replace("/dashboard");
              return;
            }
          } catch {
            router.replace("/dashboard");
            return;
          }
        }

        setReady(true);
      } catch {
        router.replace("/login");
      }
    });

    return () => unsub();
  }, [pathname, router]);

  if (!ready && pathname !== "/login" && pathname !== "/reset-password") {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
