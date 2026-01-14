// src/app/reminders/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ModalPortal from "@/components/ui/ModalPortal";

import ReminderRow from "@/components/reminders/ReminderRow";

import { useAuthUser } from "@/store/AuthProvider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useSearchParams } from "next/navigation";

import {
  type Reminder,
  fetchReminders,
  upsertReminderToRepo,
  deleteReminderFromRepo,
} from "@/store/features/reminders/reminderSlice";

import {
  computeNextTriggerDate,
  normalizeReminder,
  toISODateOnly,
  istDateTimeToUtcISO,
  isoToISTTimeHHmm,
} from "@/lib/reminders/reminderHelpers";

type Frequency = Reminder["frequency"];

const presetCategories = [
  { id: "lightbill", name: "Light Bill" },
  { id: "lic", name: "LIC Policy" },
  { id: "loan", name: "Loan / EMI" },
  { id: "other", name: "Other" },
];

export default function RemindersPage() {
  const user = useAuthUser();
  const uid = user?.uid;

  const dispatch = useAppDispatch();
  const {
    list: reminders,
    loading,
    error,
  } = useAppSelector((s) => s.reminders);
  const searchParams = useSearchParams();
  const openId = searchParams.get("open");

  useEffect(() => {
    dispatch(fetchReminders({ uid }));
  }, [uid, dispatch]);

  // ---------- Add form ----------
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(presetCategories[0].id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [dueDate, setDueDate] = useState(() => todayISO());
  const [dueTime, setDueTime] = useState<string>("12:00"); // ✅ NEW
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [intervalDays, setIntervalDays] = useState<string>("30");

  // ---------- Edit Modal ----------
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const currentEditing = useMemo(
    () => reminders.find((r) => r.id === editId) ?? null,
    [reminders, editId]
  );

  const [editTitle, setEditTitle] = useState("");
  const [editCategoryId, setEditCategoryId] = useState(presetCategories[0].id);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");

  const [editDueDate, setEditDueDate] = useState(() => todayISO());
  const [editDueTime, setEditDueTime] = useState<string>("12:00"); // ✅ NEW
  const [editFrequency, setEditFrequency] = useState<Frequency>("monthly");
  const [editIntervalDays, setEditIntervalDays] = useState<string>("30");

  // ---------- Delete Confirm Modal ----------
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);

  // ---------- Share Modal ----------
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareTitle, setShareTitle] = useState("");

  function handleAdd() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (!dueDate) return;

    const amtNum = Number(amount);
    const safeAmt = Number.isFinite(amtNum) && amtNum > 0 ? amtNum : undefined;

    const nowIso = new Date().toISOString();

    const dueDateOnly = toISODateOnly(dueDate);

    // ✅ exact IST time -> ISO UTC
    const dueISO = istDateTimeToUtcISO(dueDateOnly, dueTime);

    const interval =
      frequency === "custom"
        ? Math.max(1, editOrAddInterval(intervalDays))
        : undefined;

    const nextTriggerDate = computeNextTriggerDate(
      dueDateOnly,
      frequency,
      interval,
      dueTime
    );

    const r: Reminder = normalizeReminder({
      id: uuidv4(),
      title: cleanTitle,
      categoryId,
      amount: safeAmt,
      note: note.trim() || undefined,

      dueDate: dueISO,
      dueTime,
      timezone: "Asia/Kolkata",

      nextTriggerDate,
      frequency,
      intervalDays: interval,

      repeatEvery: undefined,

      status: "active",
      pausedAt: null,
      completedAt: null,
      linkedTransactionId: null,

      createdAt: nowIso,
      updatedAt: null,

      createdByUid: user?.uid,
      createdByEmail: user?.email ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    });

    dispatch(upsertReminderToRepo({ uid, reminder: r }));

    setTitle("");
    setAmount("");
    setNote("");
    setCategoryId(presetCategories[0].id);
    setDueDate(todayISO());
    setDueTime("12:00");
    setFrequency("monthly");
    setIntervalDays("30");
  }

  function openEdit(r: Reminder) {
    setEditId(r.id);
    setEditTitle(r.title);
    setEditCategoryId(r.categoryId);
    setEditAmount(typeof r.amount === "number" ? String(r.amount) : "");
    setEditNote(r.note ?? "");

    setEditDueDate(toISODateInput(r.dueDate));
    setEditDueTime(r.dueTime ?? isoToISTTimeHHmm(r.dueDate) ?? "12:00");

    setEditFrequency(r.frequency);
    setEditIntervalDays(String(r.intervalDays ?? 30));

    setEditOpen(true);
  }
  useEffect(() => {
    if (!openId || reminders.length === 0) return;

    const target = reminders.find((r) => r.id === openId);
    if (!target) return;

    // Small delay so list/render is stable
    const t = setTimeout(() => {
      openEdit(target);
    }, 250);

    return () => clearTimeout(t);
  }, [openId, reminders]);

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
  }

  function saveEdit() {
    if (!currentEditing) return;

    const cleanTitle = editTitle.trim();
    if (!cleanTitle) return;
    if (!editDueDate) return;

    const amtNum = Number(editAmount);
    const safeAmt = Number.isFinite(amtNum) && amtNum > 0 ? amtNum : undefined;

    const nowIso = new Date().toISOString();

    const dueDateOnly = toISODateOnly(editDueDate);
    const dueISO = istDateTimeToUtcISO(dueDateOnly, editDueTime);

    const interval =
      editFrequency === "custom"
        ? Math.max(1, Number(editOrAddInterval(editIntervalDays)))
        : undefined;

    const nextTriggerDate = computeNextTriggerDate(
      dueDateOnly,
      editFrequency,
      interval,
      editDueTime
    );

    const updated: Reminder = normalizeReminder({
      ...currentEditing,
      title: cleanTitle,
      categoryId: editCategoryId,
      amount: safeAmt,
      note: editNote.trim() || undefined,

      dueDate: dueISO,
      dueTime: editDueTime,
      timezone: "Asia/Kolkata",

      nextTriggerDate,
      frequency: editFrequency,
      intervalDays: interval,

      updatedAt: nowIso,
      updatedByUid: user?.uid,
      updatedByEmail: user?.email ?? null,
    });

    dispatch(upsertReminderToRepo({ uid, reminder: updated }));
    closeEdit();
  }

  function requestDelete(r: Reminder) {
    setDeleteTarget(r);
    setDeleteOpen(true);
  }

  function cancelDelete() {
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch(deleteReminderFromRepo({ uid, id: deleteTarget.id }));
    cancelDelete();
  }

  function togglePause(r: Reminder) {
    const nowIso = new Date().toISOString();

    const nextStatus = r.status === "paused" ? "active" : "paused";

    const updated: Reminder = {
      ...r,
      status: nextStatus,
      pausedAt: nextStatus === "paused" ? nowIso : null,
      updatedAt: nowIso,
      updatedByUid: user?.uid,
      updatedByEmail: user?.email ?? null,
    };

    dispatch(upsertReminderToRepo({ uid, reminder: updated }));
  }

  async function shareReminder(r: Reminder) {
    const msg = formatReminderShare(r);
    setShareTitle("Share Reminder");
    setShareText(msg);

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Reminder",
          text: msg,
        });
        return;
      }
    } catch {
      // ignore
    }

    const copied = await tryClipboardWrite(msg);
    if (copied) {
      alert("✅ Reminder copied to clipboard");
      return;
    }

    setShareOpen(true);
  }

  async function copyShareText() {
    const ok = await tryClipboardWrite(shareText);
    if (ok) {
      alert("✅ Copied!");
      return;
    }

    const ok2 = legacyCopyToClipboard(shareText);
    if (ok2) {
      alert("✅ Copied!");
      return;
    }

    alert("❌ Copy failed on this browser. Please copy manually.");
  }

  function closeShare() {
    setShareOpen(false);
    setShareText("");
    setShareTitle("");
  }

  // ✅ Sort by nextTriggerDate (soonest first)
  const sorted = useMemo(() => {
    return [...reminders].sort(
      (a, b) =>
        new Date(a.nextTriggerDate).getTime() -
        new Date(b.nextTriggerDate).getTime()
    );
  }, [reminders]);

  return (
    <main className="pt-10">
      <div className="mx-auto max-w-6xl px-4 pb-16 space-y-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Reminders</h1>
          <p className="text-white/60 mt-2">
            Create monthly/yearly bills, loan reminders, and future
            notifications.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ✅ Add Reminder */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold">Add Reminder</h2>

            <div className="mt-5 space-y-3">
              <Input
                placeholder="Reminder title (Light bill / LIC / EMI...)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <select
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {presetCategories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0B1220]">
                    {c.name}
                  </option>
                ))}
              </select>

              <Input
                placeholder="Amount (optional)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
              />

              {/* Due date */}
              <div className="space-y-1">
                <p className="text-xs text-white/60">Due Date</p>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              {/* ✅ Due time (IST) */}
              <div className="space-y-1">
                <p className="text-xs text-white/60">Due Time (IST)</p>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              {/* Frequency */}
              <select
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                <option value="monthly" className="bg-[#0B1220]">
                  Monthly
                </option>
                <option value="yearly" className="bg-[#0B1220]">
                  Yearly
                </option>
                <option value="once" className="bg-[#0B1220]">
                  Once
                </option>
                <option value="custom" className="bg-[#0B1220]">
                  Custom (every X days)
                </option>
              </select>

              {frequency === "custom" && (
                <Input
                  placeholder="Interval days (example: 30)"
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(e.target.value)}
                  type="number"
                />
              )}

              <Input
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <Button onClick={handleAdd} className="w-full">
                Add Reminder
              </Button>

              {error && <p className="text-xs text-rose-300 mt-2">{error}</p>}
            </div>
          </div>

          {/* ✅ Reminder List */}
          <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Your Reminders</h2>
                <p className="text-sm text-white/60 mt-1">
                  Stop/start, edit, delete, or share reminders.
                </p>
              </div>

              <div className="text-xs text-white/50">
                Total:{" "}
                <span className="font-semibold text-white/70">
                  {sorted.length}
                </span>
              </div>
            </div>

            {loading && (
              <div className="mt-4 text-sm text-white/60">Loading…</div>
            )}

            <div className="mt-6 space-y-3">
              {sorted.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
                  No reminders yet.
                </div>
              ) : (
                sorted.map((r) => (
                  <ReminderRow
                    key={r.id}
                    r={r}
                    onEdit={openEdit}
                    onDelete={requestDelete}
                    onTogglePause={togglePause}
                    onShare={shareReminder}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Edit Modal */}
      {editOpen && currentEditing && (
        <ModalPortal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeEdit} />

            <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Edit Reminder</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Update title, due date, time, frequency or notes.
                  </p>
                </div>

                <button
                  onClick={closeEdit}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <Input
                  placeholder="Reminder title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />

                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                >
                  {presetCategories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0B1220]">
                      {c.name}
                    </option>
                  ))}
                </select>

                <Input
                  placeholder="Amount (optional)"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  type="number"
                />

                <div className="space-y-1">
                  <p className="text-xs text-white/60">Due Date</p>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                </div>

                {/* ✅ Due time */}
                <div className="space-y-1">
                  <p className="text-xs text-white/60">Due Time (IST)</p>
                  <input
                    type="time"
                    value={editDueTime}
                    onChange={(e) => setEditDueTime(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                </div>

                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  value={editFrequency}
                  onChange={(e) =>
                    setEditFrequency(e.target.value as Frequency)
                  }
                >
                  <option value="monthly" className="bg-[#0B1220]">
                    Monthly
                  </option>
                  <option value="yearly" className="bg-[#0B1220]">
                    Yearly
                  </option>
                  <option value="once" className="bg-[#0B1220]">
                    Once
                  </option>
                  <option value="custom" className="bg-[#0B1220]">
                    Custom (every X days)
                  </option>
                </select>

                {editFrequency === "custom" && (
                  <Input
                    placeholder="Interval days (example: 30)"
                    value={editIntervalDays}
                    onChange={(e) => setEditIntervalDays(e.target.value)}
                    type="number"
                  />
                )}

                <Input
                  placeholder="Note (optional)"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={closeEdit}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                >
                  Cancel
                </button>

                <Button onClick={saveEdit} className="px-6">
                  Save
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ✅ Delete Confirm Modal */}
      {deleteOpen && deleteTarget && (
        <ModalPortal>
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={cancelDelete}
            />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <h3 className="text-xl font-bold">Delete Reminder?</h3>

              <p className="text-sm text-white/60 mt-2">
                This will remove the reminder permanently.
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">{deleteTarget.title}</p>
                <p className="text-xs text-white/60 mt-1">
                  Due: {new Date(deleteTarget.dueDate).toLocaleString()}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={cancelDelete}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                >
                  Cancel
                </button>

                <button
                  onClick={confirmDelete}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ✅ Share Modal (fallback) */}
      {shareOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={closeShare}
            />

            <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">{shareTitle}</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Your browser blocked share/copy. Copy it manually or use the
                    Copy button.
                  </p>
                </div>

                <button
                  onClick={closeShare}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <textarea
                value={shareText}
                readOnly
                className="mt-4 w-full h-56 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/90 outline-none"
              />

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  onClick={closeShare}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                >
                  Cancel
                </button>

                <Button onClick={copyShareText} className="px-6">
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </main>
  );
}

/* ---------------- helpers ---------------- */

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toISODateInput(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function editOrAddInterval(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return n;
}

function formatReminderShare(r: Reminder) {
  const due = new Date(r.dueDate).toLocaleString();
  const next = new Date(r.nextTriggerDate).toLocaleString();
  const created = new Date(r.createdAt).toLocaleString();
  const edited = r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "Never";

  return [
    "⏰ Reminder",
    `• Title: ${r.title}`,
    `• Status: ${r.status.toUpperCase()}`,
    `• Frequency: ${r.frequency.toUpperCase()}`,
    `• Due: ${due}`,
    r.dueTime ? `• Due Time (IST): ${r.dueTime}` : "",
    `• Next Trigger: ${next}`,
    typeof r.amount === "number" ? `• Amount: ₹${r.amount}` : "",
    r.note ? `• Note: ${r.note}` : "",
    `• Created: ${created}`,
    `• Edited: ${edited}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function tryClipboardWrite(text: string) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function legacyCopyToClipboard(text: string) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
