// src/lib/auth/adminGoogleConfig.ts

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

export type AdminGoogleConfig = {
  adminAllowedGoogleEmails: string[];
  adminGoogleEnabled: boolean;
};

/**
 * ✅ Main admin email (always allowed to see Admin unlock UI)
 */
export const MAIN_ADMIN_EMAIL = "omkarpatil1116@gmail.com";

const FALLBACK_CONFIG: AdminGoogleConfig = {
  adminAllowedGoogleEmails: [],
  adminGoogleEnabled: false,
};

let cachedAdminGoogleConfig: AdminGoogleConfig | null = null;
let cachedAt = 0;
const CACHE_MS = 60 * 1000;

export function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export function isAllowedByEmail(email: string | null, allowedEmails: string[]) {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  if (normalized === MAIN_ADMIN_EMAIL) return true;
  return allowedEmails.includes(normalized);
}

/**
 * ✅ Dynamic Admin Google Config (Firestore appConfig/auth)
 */
export async function getAdminGoogleConfig(): Promise<AdminGoogleConfig> {
  const now = Date.now();

  if (cachedAdminGoogleConfig && now - cachedAt < CACHE_MS) {
    return cachedAdminGoogleConfig;
  }

  if (!auth.currentUser) {
    cachedAdminGoogleConfig = FALLBACK_CONFIG;
    cachedAt = now;
    return FALLBACK_CONFIG;
  }

  const ref = doc(db, "appConfig", "auth");

  try {
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      cachedAdminGoogleConfig = FALLBACK_CONFIG;
      cachedAt = now;
      return FALLBACK_CONFIG;
    }

    const data = snap.data() as Partial<AdminGoogleConfig>;

    const config: AdminGoogleConfig = {
      adminAllowedGoogleEmails: Array.isArray(data.adminAllowedGoogleEmails)
        ? data.adminAllowedGoogleEmails.map(normalizeEmail)
        : [],
      adminGoogleEnabled: Boolean(data.adminGoogleEnabled),
    };

    config.adminAllowedGoogleEmails = Array.from(
      new Set(config.adminAllowedGoogleEmails)
    );

    cachedAdminGoogleConfig = config;
    cachedAt = now;
    return config;
  } catch {
    cachedAdminGoogleConfig = FALLBACK_CONFIG;
    cachedAt = now;
    return FALLBACK_CONFIG;
  }
}
