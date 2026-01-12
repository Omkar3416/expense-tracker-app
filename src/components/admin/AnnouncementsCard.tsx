// src/components/admin/AnnouncementsCard.tsx
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebaseClient";

import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

type AnnouncementMode = "dev" | "prod";
type AnnouncementTarget = "all" | "user";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  mode: AnnouncementMode;
  target: AnnouncementTarget;
  targetEmail?: string;
  status: "sent" | "deleted";
  createdBy?: string;
  createdAt?: unknown;
  sentAt?: unknown;
  editedAt?: unknown;
  resentAt?: unknown;
  deletedAt?: unknown;
  deletedBy?: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
};

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseAnnouncement(
  docSnap: QueryDocumentSnapshot<DocumentData>
): AnnouncementRow {
  const data = docSnap.data();

  const title = typeof data.title === "string" ? data.title : "";
  const body = typeof data.body === "string" ? data.body : "";

  const mode: AnnouncementMode =
    data.mode === "prod" || data.mode === "dev" ? data.mode : "dev";

  const target: AnnouncementTarget =
    data.target === "user" || data.target === "all" ? data.target : "all";

  const status: "sent" | "deleted" =
    data.status === "deleted" ? "deleted" : "sent";

  const targetEmail =
    typeof data.targetEmail === "string" ? data.targetEmail : undefined;

  return {
    id: docSnap.id,
    title,
    body,
    mode,
    target,
    targetEmail,
    status,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
    createdAt: data.createdAt ?? undefined,
    sentAt: data.sentAt ?? undefined,
    editedAt: data.editedAt ?? undefined,
    resentAt: data.resentAt ?? undefined,
    deletedAt: data.deletedAt ?? undefined,
    deletedBy: typeof data.deletedBy === "string" ? data.deletedBy : undefined,
  };
}

function formatMaybeTimestamp(v: unknown): string {
  if (!v) return "-";
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString();
  }
  if (typeof v === "object") return "…";
  return String(v);
}

async function safeReadJson(res: Response): Promise<ApiResponse> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      return {
        success: typeof obj.success === "boolean" ? obj.success : undefined,
        error: typeof obj.error === "string" ? obj.error : undefined,
      };
    }
    return {};
  } catch {
    return {};
  }
}

export default function AnnouncementsCard() {
  const [annMode, setAnnMode] = useState<AnnouncementMode>("dev");
  const [annTarget, setAnnTarget] = useState<AnnouncementTarget>("all");
  const [annTargetEmail, setAnnTargetEmail] = useState<string>("");

  const [annTitle, setAnnTitle] = useState<string>("");
  const [annBody, setAnnBody] = useState<string>("");

  const [annSendLoading, setAnnSendLoading] = useState<boolean>(false);
  const [annSendErr, setAnnSendErr] = useState<string | null>(null);
  const [annSendOk, setAnnSendOk] = useState<string | null>(null);

  const [annLoading, setAnnLoading] = useState<boolean>(false);
  const [annErr, setAnnErr] = useState<string | null>(null);
  const [annRows, setAnnRows] = useState<AnnouncementRow[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editBody, setEditBody] = useState<string>("");

  // ✅ DEV mode restriction: dev notifications should only be sent to ALL admins (topic)
  // so we force target to "all"
  useEffect(() => {
    if (annMode === "dev" && annTarget !== "all") {
      setAnnTarget("all");
      setAnnTargetEmail("");
    }
  }, [annMode, annTarget]);

  async function loadAnnouncements() {
    setAnnLoading(true);
    setAnnErr(null);

    try {
      const ref = collection(db, "announcements");
      const q = query(ref, orderBy("sentAt", "desc"), limit(50));
      const snap = await getDocs(q);

      const rows: AnnouncementRow[] = snap.docs.map(parseAnnouncement);
      setAnnRows(rows);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to load announcements.";
      setAnnErr(msg);
    } finally {
      setAnnLoading(false);
    }
  }

  function resetAnnouncementFormMessages() {
    setAnnSendErr(null);
    setAnnSendOk(null);
  }

  function validateAnnouncementForm(): string | null {
    if (!annTitle.trim()) return "Title is required.";
    if (!annBody.trim()) return "Body is required.";

    // ✅ DEV restriction: target must be ALL only
    if (annMode === "dev" && annTarget !== "all") {
      return "DEV mode can only send to ALL (admin/dev topic).";
    }

    if (annTarget === "user") {
      const e = normalizeEmail(annTargetEmail);
      if (!e) return "Target email is required.";
      if (!isValidEmail(e)) return "Invalid target email format.";
    }

    return null;
  }

  async function sendAnnouncement() {
    resetAnnouncementFormMessages();

    const validation = validateAnnouncementForm();
    if (validation) {
      setAnnSendErr(`❌ ${validation}`);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setAnnSendErr("❌ Not logged in.");
      return;
    }

    setAnnSendLoading(true);

    try {
      const token = await user.getIdToken();

      const payload = {
        title: annTitle.trim(),
        body: annBody.trim(),
        mode: annMode,
        target: annTarget,
        targetEmail:
          annTarget === "user" ? normalizeEmail(annTargetEmail) : undefined,
      };

      const res = await fetch("/api/notifications/send-announcement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await safeReadJson(res);

      if (!res.ok) {
        setAnnSendErr(data.error ?? "❌ Failed to send announcement.");
        return;
      }

      setAnnSendOk("✅ Announcement sent successfully.");
      setAnnTitle("");
      setAnnBody("");
      setAnnTargetEmail("");

      await loadAnnouncements();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "❌ Failed to send announcement.";
      setAnnSendErr(msg);
    } finally {
      setAnnSendLoading(false);
    }
  }

  function startEditAnnouncement(row: AnnouncementRow) {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditBody(row.body);
  }

  function cancelEditAnnouncement() {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
  }

  async function saveEditedAnnouncement(id: string) {
    setAnnErr(null);

    if (!editTitle.trim() || !editBody.trim()) {
      setAnnErr("❌ Title and Body are required to save.");
      return;
    }

    try {
      const ref = doc(db, "announcements", id);
      await updateDoc(ref, {
        title: editTitle.trim(),
        body: editBody.trim(),
        editedAt: serverTimestamp(),
      });

      cancelEditAnnouncement();
      await loadAnnouncements();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "❌ Failed to edit announcement.";
      setAnnErr(msg);
    }
  }

  async function resendAnnouncement(id: string) {
    setAnnErr(null);

    const user = auth.currentUser;
    if (!user) {
      setAnnErr("❌ Not logged in.");
      return;
    }

    try {
      const token = await user.getIdToken();

      const res = await fetch("/api/notifications/resend-announcement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ announcementId: id }),
      });

      const data = await safeReadJson(res);

      if (!res.ok) {
        setAnnErr(data.error ?? "❌ Failed to resend.");
        return;
      }

      await loadAnnouncements();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "❌ Failed to resend.";
      setAnnErr(msg);
    }
  }

  async function deleteAnnouncement(id: string) {
    const ok = confirm(
      "Delete this announcement? (This keeps history in users)"
    );
    if (!ok) return;

    setAnnErr(null);

    try {
      const user = auth.currentUser;
      const email = user?.email ? normalizeEmail(user.email) : "unknown";

      const ref = doc(db, "announcements", id);
      await updateDoc(ref, {
        status: "deleted",
        deletedAt: serverTimestamp(),
        deletedBy: email,
      });

      await loadAnnouncements();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "❌ Failed to delete announcement.";
      setAnnErr(msg);
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  return (
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">
            Announcements (Push Notifications)
          </h2>
          <p className="text-white/60 mt-1 text-sm">
            Send push notifications in <b>DEV</b> or <b>PROD</b> mode.
          </p>
        </div>

        <button
          onClick={loadAnnouncements}
          disabled={annLoading}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-60"
        >
          {annLoading ? "Loading..." : "Reload History"}
        </button>
      </div>

      {annSendErr && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {annSendErr}
        </div>
      )}
      {annSendOk && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {annSendOk}
        </div>
      )}
      {annErr && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {annErr}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">Send Announcement</h3>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm text-white/70">Mode</label>
              <select
                value={annMode}
                onChange={(e) =>
                  setAnnMode(e.target.value as AnnouncementMode)
                }
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                disabled={annSendLoading}
              >
                <option value="dev">DEV (announcements_dev)</option>
                <option value="prod">PROD (announcements_prod)</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-sm text-white/70">Target</label>
              <select
                value={annTarget}
                onChange={(e) =>
                  setAnnTarget(e.target.value as AnnouncementTarget)
                }
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                disabled={annSendLoading || annMode === "dev"}
              >
                <option value="all">All Users</option>
                <option value="user">Particular User</option>
              </select>
            </div>

            {annMode === "dev" && (
              <p className="text-xs text-white/50">
                ✅ DEV mode is restricted to <b>ALL</b> only (admin/dev topic).
              </p>
            )}

            {annTarget === "user" && annMode === "prod" && (
              <div className="flex flex-col gap-1">
                <label className="text-sm text-white/70">User Email</label>
                <input
                  value={annTargetEmail}
                  onChange={(e) => setAnnTargetEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  disabled={annSendLoading}
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/70">Title</label>
              <input
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Enter notification title"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                disabled={annSendLoading}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/70">Body</label>
              <textarea
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder="Enter notification message"
                className="min-h-[110px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                disabled={annSendLoading}
              />
            </div>

            <button
              onClick={sendAnnouncement}
              disabled={annSendLoading}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 transition disabled:opacity-60"
            >
              {annSendLoading ? "Sending..." : "Send Notification"}
            </button>

            <p className="text-xs text-white/50">
              ✅ Dev sends to topic <b>announcements_dev</b>. Prod sends to{" "}
              <b>announcements_prod</b>.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">Announcement History</h3>
          <p className="text-xs text-white/50 mt-1">
            Latest 50 announcements from Firestore collection{" "}
            <b>announcements</b>.
          </p>

          <div className="mt-4 space-y-2">
            {annLoading && (
              <p className="text-sm text-white/50">Loading history...</p>
            )}
            {!annLoading && annRows.length === 0 && (
              <p className="text-sm text-white/50">No announcements yet.</p>
            )}

            {annRows.map((row) => {
              const isEditing = editingId === row.id;

              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-white/90">
                        {row.title || "(no title)"}
                        <span className="ml-2 text-xs text-white/50">
                          ({row.mode.toUpperCase()} •{" "}
                          {row.target.toUpperCase()}
                          {row.target === "user" && row.targetEmail
                            ? ` • ${row.targetEmail}`
                            : ""}
                          )
                        </span>
                      </p>

                      <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">
                        {row.body || "(no body)"}
                      </p>

                      <div className="mt-2 text-[11px] text-white/40 space-y-1">
                        <div>
                          Sent:{" "}
                          <span className="text-white/60">
                            {formatMaybeTimestamp(row.sentAt)}
                          </span>
                        </div>
                        <div>
                          Edited:{" "}
                          <span className="text-white/60">
                            {formatMaybeTimestamp(row.editedAt)}
                          </span>
                        </div>
                        <div>
                          Resent:{" "}
                          <span className="text-white/60">
                            {formatMaybeTimestamp(row.resentAt)}
                          </span>
                        </div>
                        <div>
                          Deleted:{" "}
                          <span className="text-white/60">
                            {formatMaybeTimestamp(row.deletedAt)}
                          </span>
                        </div>
                        {row.status === "deleted" && (
                          <div className="text-rose-200/80">
                            Status: DELETED
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!isEditing && (
                        <>
                          <button
                            onClick={() => startEditAnnouncement(row)}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 transition"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => resendAnnouncement(row.id)}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500/20 transition"
                          >
                            Resend
                          </button>

                          <button
                            onClick={() => deleteAnnouncement(row.id)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/20 transition"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                        placeholder="Edit title"
                      />
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="min-h-[90px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                        placeholder="Edit body"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEditedAnnouncement(row.id)}
                          className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 transition"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditAnnouncement}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                        >
                          Cancel
                        </button>
                      </div>

                      <p className="text-xs text-white/50">
                        ⚠️ Editing only changes Firestore history. Resend will
                        send the latest content.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
