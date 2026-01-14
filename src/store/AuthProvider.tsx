// src/store/AuthProvider.tsx
"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";

import { ensureUserProfile, type UserProfile } from "@/lib/firestore/users";
import { ensureAuthConfigDocExists } from "@/lib/firestore/appConfig";

const AuthContext = createContext<User | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // ✅ Ensure config doc exists (run once)
  useEffect(() => {
    ensureAuthConfigDocExists().catch(() => {
      // ignore (offline / permissions)
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      /**
       * ✅ IMPORTANT:
       * We still require email for app features,
       * but Firestore user doc ID is UID (NOT email).
       */
      const email = u?.email?.trim().toLowerCase() ?? null;

      // ✅ Only create/update user profile if:
      // - user exists
      // - email exists
      // - email is verified
      if (u && email && u.emailVerified) {
        const profile: UserProfile = {
          uid: u.uid,
          email,
          name: u.displayName ?? "",
        };

        try {
          await ensureUserProfile(profile);
        } catch {
          // ignore (offline / network fail)
        }
      }
    });

    return () => unsub();
  }, []);

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuthUser() {
  return useContext(AuthContext);
}
