// src/components/admin/SecurityLogsCard.tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

type SecurityLogRow = {
  id: string;
  type?: string;
  ok?: boolean;
  reason?: string;
  email?: string | null;
  uid?: string | null;
  ip?: string;
  userAgent?: string;
  createdAt?: unknown;
};

function parseSecurityLog(
  docSnap: QueryDocumentSnapshot<DocumentData>
): SecurityLogRow {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    type: typeof data.type === "string" ? data.type : undefined,
    ok: typeof data.ok === "boolean" ? data.ok : undefined,
    reason: typeof data.reason === "string" ? data.reason : undefined,
    email:
      typeof data.email === "string" || data.email === null
        ? (data.email as string | null)
        : undefined,
    uid:
      typeof data.uid === "string" || data.uid === null
        ? (data.uid as string | null)
        : undefined,
    ip: typeof data.ip === "string" ? data.ip : undefined,
    userAgent: typeof data.userAgent === "string" ? data.userAgent : undefined,
    createdAt: data.createdAt ?? undefined,
  };
}

export default function SecurityLogsCard() {
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsErr, setLogsErr] = useState<string | null>(null);
  const [logs, setLogs] = useState<SecurityLogRow[]>([]);

  async function loadSecurityLogs() {
    setLogsLoading(true);
    setLogsErr(null);

    try {
      const ref = collection(db, "securityLogs");
      const q = query(ref, orderBy("createdAt", "desc"), limit(30));
      const snap = await getDocs(q);

      const rows: SecurityLogRow[] = snap.docs.map(parseSecurityLog);
      setLogs(rows);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to load security logs. Check rules.";
      setLogsErr(msg);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    loadSecurityLogs();
  }, []);

  return (
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Security Logs</h2>
          <p className="text-white/60 mt-1 text-sm">
            Track blocked admin Google attempts and errors.
          </p>
        </div>

        <button
          onClick={loadSecurityLogs}
          disabled={logsLoading}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-60"
        >
          {logsLoading ? "Loading..." : "Reload Logs"}
        </button>
      </div>

      {logsErr && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {logsErr}
        </div>
      )}

      <div className="mt-5 space-y-2">
        {logs.length === 0 && !logsLoading && (
          <p className="text-sm text-white/50">No logs found yet.</p>
        )}

        {logs.map((l) => (
          <div
            key={l.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-white/90">
                  {l.type ?? "event"}
                  {typeof l.ok === "boolean" && (
                    <span className="ml-2 text-xs text-white/60">
                      ({l.ok ? "OK" : "BLOCKED"})
                    </span>
                  )}
                </p>

                {l.reason && (
                  <p className="text-xs text-white/60 mt-1">{l.reason}</p>
                )}
              </div>

              <div className="text-xs text-white/40">
                {l.email ? `Email: ${l.email}` : ""}
                {l.uid ? ` | UID: ${l.uid}` : ""}
              </div>
            </div>

            {(l.ip || l.userAgent) && (
              <p className="mt-2 text-[11px] text-white/40 break-words">
                {l.ip ? `IP: ${l.ip} ` : ""}
                {l.userAgent ? `| UA: ${l.userAgent}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
