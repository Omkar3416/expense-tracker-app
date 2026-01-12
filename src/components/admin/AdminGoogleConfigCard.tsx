// src/components/admin/AdminGoogleConfigCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebaseClient";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

type AdminGoogleConfig = {
  adminAllowedGoogleEmails: string[];
  adminGoogleEnabled: boolean;
};

const DEFAULT_CONFIG: AdminGoogleConfig = {
  adminAllowedGoogleEmails: [],
  adminGoogleEnabled: true,
};

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function AdminGoogleConfigCard() {
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configErr, setConfigErr] = useState<string | null>(null);
  const [configOk, setConfigOk] = useState<string | null>(null);

  const [config, setConfig] = useState<AdminGoogleConfig>(DEFAULT_CONFIG);
  const [newEmail, setNewEmail] = useState("");

  const configRef = useMemo(() => doc(db, "appConfig", "auth"), []);

  async function loadConfig() {
    setConfigLoading(true);
    setConfigErr(null);
    setConfigOk(null);

    try {
      const snap = await getDoc(configRef);

      if (!snap.exists()) {
        await setDoc(
          configRef,
          {
            ...DEFAULT_CONFIG,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        setConfig(DEFAULT_CONFIG);
        setConfigOk("✅ appConfig/auth created automatically.");
        return;
      }

      const data = snap.data() as Partial<AdminGoogleConfig>;

      const loaded: AdminGoogleConfig = {
        adminAllowedGoogleEmails: Array.isArray(data.adminAllowedGoogleEmails)
          ? data.adminAllowedGoogleEmails
          : [],
        adminGoogleEnabled: Boolean(data.adminGoogleEnabled),
      };

      loaded.adminAllowedGoogleEmails = Array.from(
        new Set(loaded.adminAllowedGoogleEmails.map(normalizeEmail))
      );

      setConfig(loaded);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to load config. Check Firestore rules.";
      setConfigErr(msg);
    } finally {
      setConfigLoading(false);
    }
  }

  async function saveConfig(next: AdminGoogleConfig) {
    setConfigSaving(true);
    setConfigErr(null);
    setConfigOk(null);

    try {
      const clean: AdminGoogleConfig = {
        adminGoogleEnabled: Boolean(next.adminGoogleEnabled),
        adminAllowedGoogleEmails: Array.from(
          new Set(next.adminAllowedGoogleEmails.map(normalizeEmail))
        ),
      };

      await setDoc(
        configRef,
        {
          ...clean,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setConfig(clean);
      setConfigOk("✅ Saved successfully.");
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Save failed. Check Firestore rules.";
      setConfigErr(msg);
    } finally {
      setConfigSaving(false);
    }
  }

  function addAllowedEmail() {
    setConfigErr(null);
    setConfigOk(null);

    const e = normalizeEmail(newEmail);
    if (!e) return;

    if (!isValidEmail(e)) {
      setConfigErr("❌ Invalid email format.");
      return;
    }

    if (config.adminAllowedGoogleEmails.includes(e)) {
      setConfigErr("⚠️ Email already exists.");
      return;
    }

    const next: AdminGoogleConfig = {
      ...config,
      adminAllowedGoogleEmails: [...config.adminAllowedGoogleEmails, e],
    };

    setNewEmail("");
    saveConfig(next);
  }

  function removeAllowedEmail(email: string) {
    const next: AdminGoogleConfig = {
      ...config,
      adminAllowedGoogleEmails: config.adminAllowedGoogleEmails.filter(
        (x) => x !== email
      ),
    };
    saveConfig(next);
  }

  function toggleAdminGoogleEnabled(v: boolean) {
    const next: AdminGoogleConfig = { ...config, adminGoogleEnabled: v };
    saveConfig(next);
  }

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Admin Google Login Config</h2>
          <p className="text-white/60 mt-1 text-sm">
            Stored in Firestore: <b>appConfig/auth</b>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadConfig}
            disabled={configLoading || configSaving}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-60"
          >
            {configLoading ? "Loading..." : "Reload"}
          </button>
        </div>
      </div>

      {configErr && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {configErr}
        </div>
      )}

      {configOk && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {configOk}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">Enable Admin Google Login</h3>

          <div className="mt-4 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white/80 select-none">
              <input
                type="checkbox"
                checked={config.adminGoogleEnabled}
                onChange={(e) => toggleAdminGoogleEnabled(e.target.checked)}
                disabled={configSaving || configLoading}
                className="h-4 w-4"
              />
              Enabled
            </label>

            {configSaving && (
              <span className="text-xs text-white/50">Saving...</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">Add Allowed Admin Email</h3>

          <div className="mt-4 flex gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Add admin email (example@gmail.com)"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
              disabled={configSaving || configLoading}
            />
            <button
              onClick={addAllowedEmail}
              disabled={configSaving || configLoading}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 transition disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">Allowed Admin Emails</h3>

          <div className="mt-4 space-y-2">
            {config.adminAllowedGoogleEmails.length === 0 && (
              <p className="text-sm text-white/50">No emails added yet.</p>
            )}

            {config.adminAllowedGoogleEmails.map((e) => (
              <div
                key={e}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <span className="text-sm text-white/80 break-all">{e}</span>

                <button
                  onClick={() => removeAllowedEmail(e)}
                  disabled={configSaving || configLoading}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/20 transition disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 text-xs text-white/50">
        ✅ Note: Admin Google login is only entry gate. Access to <b>/admin</b>{" "}
        is still protected by:
        <br />• Firebase Admin Claim <b>admin: true</b> +<br />
        • AdminUnlock session secret
      </div>
    </div>
  );
}
