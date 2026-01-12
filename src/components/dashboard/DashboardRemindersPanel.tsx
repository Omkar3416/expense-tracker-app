// src/components/dashboard/DashboardRemindersPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ModalPortal from "@/components/ui/ModalPortal";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { RootState } from "@/store/store";

import {
  type Reminder,
  upsertReminderToRepo,
  deleteReminderFromRepo,
} from "@/store/features/reminders/reminderSlice";

import {
  type Category,
  upsertCategoryToRepo,
} from "@/store/features/categories/categorySlice";

import { formatMoney, todayISO, daysUntil } from "@/lib/dashboard/dashboardHelpers";

type Props = {
  uid?: string;
  userUid?: string;
  userEmail?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const ok = !Number.isNaN(d.getTime());
  if (!ok) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function DashboardRemindersPanel({ uid, userUid, userEmail }: Props) {
  const dispatch = useAppDispatch();
  const reminders = useAppSelector((s: RootState) => s.reminders.list);
  const categories = useAppSelector((s: RootState) => s.categories.list);

  const reminderCategories = useMemo(() => {
    return categories.filter((c) => c.type === "reminder");
  }, [categories]);

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [dueDate, setDueDate] = useState(() => todayISO());
  const [note, setNote] = useState("");

  const [manageOpen, setManageOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<Reminder | null>(null);

  const upcoming = useMemo(() => {
    const active = reminders.filter((r) => r.status !== "completed");
    const sorted = [...active].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return sorted.slice(0, 6);
  }, [reminders]);

  function openAddCategory() {
    setNewCatName("");
    setAddCategoryOpen(true);
  }

  function closeAddCategory() {
    setAddCategoryOpen(false);
    setNewCatName("");
  }

  function createReminderCategory() {
    const name = newCatName.trim();
    if (!name) return;

    const exists = reminderCategories.some((c) => normalizeName(c.name) === normalizeName(name));
    if (exists) {
      alert("⚠️ This reminder category already exists.");
      return;
    }

    const now = nowIso();

    const c: Category = {
      id: uuidv4(),
      name,
      type: "reminder",
      createdAt: now,
      updatedAt: null,
      createdByUid: userUid,
      createdByEmail: userEmail ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    };

    dispatch(upsertCategoryToRepo({ uid, category: c }));

    // ✅ auto-select it for reminder creation
    setCategoryId(c.id);

    closeAddCategory();
  }

  function openAddReminder() {
    if (reminderCategories.length === 0) {
      alert("⚠️ Please create a reminder category first (ex: Light Bill, LIC, Loan EMI).");
      return;
    }

    setTitle("");
    setAmount("");
    setNote("");
    setDueDate(todayISO());
    setCategoryId(reminderCategories[0]?.id ?? "");
    setAddOpen(true);
  }

  function closeAddReminder() {
    setAddOpen(false);
  }

  function createReminder() {
    const t = title.trim();
    if (!t) return;
    if (!dueDate) return;
    if (!categoryId) return;

    const amt = amount.trim() ? Number(amount) : undefined;
    if (typeof amt !== "undefined" && (!Number.isFinite(amt) || amt < 0)) {
      alert("❌ Invalid amount");
      return;
    }

    const now = nowIso();

    const r: Reminder = {
      id: uuidv4(),
      title: t,
      categoryId,
      amount: typeof amt === "number" ? amt : undefined,
      note: note.trim() || undefined,

      dueDate,
      nextTriggerDate: dueDate,

      frequency: "monthly", // ✅ default (your common use case)
      status: "active",

      createdAt: now,
      updatedAt: null,
      createdByUid: userUid,
      createdByEmail: userEmail ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
      linkedTransactionId: null,
      pausedAt: null,
      completedAt: null,
    };

    dispatch(upsertReminderToRepo({ uid, reminder: r }));
    closeAddReminder();
  }

  function openManage(r: Reminder) {
    setManageTarget(r);
    setManageOpen(true);
  }

  function closeManage() {
    setManageOpen(false);
    setManageTarget(null);
  }

  function setStatus(status: "active" | "paused" | "completed") {
    if (!manageTarget) return;

    const now = nowIso();
    const updated: Reminder = {
      ...manageTarget,
      status,
      updatedAt: now,
      updatedByUid: userUid,
      updatedByEmail: userEmail ?? null,
      pausedAt: status === "paused" ? now : null,
      completedAt: status === "completed" ? now : null,
    };

    dispatch(upsertReminderToRepo({ uid, reminder: updated }));
    setManageTarget(updated);
  }

  function deleteReminder() {
    if (!manageTarget) return;
    dispatch(deleteReminderFromRepo({ uid, id: manageTarget.id }));
    closeManage();
  }

  function categoryName(id: string) {
    return reminderCategories.find((c) => c.id === id)?.name ?? "Unknown";
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Reminders</h2>
          <p className="text-sm text-white/60 mt-1">
            Bills, LIC premium, loan EMI — start/stop/pause/resume supported. Push notifications will plug into this later.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={openAddCategory}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            + Reminder Category
          </button>

          <button
            onClick={openAddReminder}
            className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-sm font-semibold hover:bg-indigo-500/20 transition"
          >
            + Add Reminder
          </button>
        </div>
      </div>

      {/* Categories row */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {reminderCategories.length === 0 ? (
          <span className="text-xs text-white/50">
            No reminder categories yet. Create one like <span className="text-white/80 font-semibold">Light Bill</span> or{" "}
            <span className="text-white/80 font-semibold">Loan EMI</span>.
          </span>
        ) : (
          reminderCategories.map((c) => (
            <span
              key={c.id}
              className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70"
              title={`Created: ${formatDateTime(c.createdAt)}`}
            >
              {c.name}
            </span>
          ))
        )}
      </div>

      {/* Upcoming list */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {upcoming.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
            🎉 No reminders yet. Add one to track bills and upcoming payments.
          </div>
        ) : (
          upcoming.map((r) => {
            const d = daysUntil(r.dueDate);
            const badge = d < 0 ? "Overdue" : d === 0 ? "Today" : `${d} day(s)`;
            const badgeClass =
              d < 0
                ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
                : d <= 2
                ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";

            return (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.title}</p>
                    <p className="text-xs text-white/60 mt-1">
                      Category: <span className="text-white/80">{categoryName(r.categoryId)}</span>
                    </p>
                    <p className="text-xs text-white/60 mt-1">
                      Due: <span className="text-white/80">{r.dueDate}</span>
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      Created: <span className="text-white/60">{formatDateTime(r.createdAt)}</span>
                    </p>
                  </div>

                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                    {badge}
                  </span>
                </div>

                {typeof r.amount === "number" ? (
                  <p className="mt-3 text-lg font-bold">₹{formatMoney(r.amount)}</p>
                ) : (
                  <p className="mt-3 text-sm text-white/60">Amount not set</p>
                )}

                {r.note ? (
                  <p className="mt-2 text-xs text-white/60 break-words">Note: {r.note}</p>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-white/50">
                    Status: <span className="text-white/80 font-semibold">{r.status}</span>
                  </span>

                  <button
                    onClick={() => openManage(r)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                  >
                    Manage
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Category Modal */}
      {addCategoryOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[270] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeAddCategory} />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Add Reminder Category</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Examples: Light Bill, LIC Premium, Loan EMI
                  </p>
                </div>

                <button
                  onClick={closeAddCategory}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <Input
                  placeholder="Category name"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />

                <div className="mt-4 flex items-center justify-end gap-3">
                  <button
                    onClick={closeAddCategory}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>

                  <Button onClick={createReminderCategory} className="px-6">
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Add Reminder Modal */}
      {addOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[280] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeAddReminder} />

            <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Add Reminder</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Reminders support start/stop/pause/resume and will trigger push notifications later.
                  </p>
                </div>

                <button
                  onClick={closeAddReminder}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Title (e.g. Light Bill)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                <Input
                  placeholder="Amount (optional)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                />

                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {reminderCategories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0B1220]">
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="space-y-1">
                  <p className="text-xs text-white/60">Due Date</p>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                </div>

                <div className="md:col-span-2">
                  <Input
                    placeholder="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={closeAddReminder}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                >
                  Cancel
                </button>

                <Button onClick={createReminder} className="px-6">
                  Save
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Manage Reminder Modal */}
      {manageOpen && manageTarget && (
        <ModalPortal>
          <div className="fixed inset-0 z-[290] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeManage} />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Manage Reminder</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Start / Pause / Complete or Delete this reminder.
                  </p>
                </div>

                <button
                  onClick={closeManage}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-semibold">{manageTarget.title}</p>
                  <p className="text-xs text-white/60 mt-1">
                    Category: <span className="text-white/80">{categoryName(manageTarget.categoryId)}</span>
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    Due: <span className="text-white/80">{manageTarget.dueDate}</span>
                  </p>

                  <p className="text-xs text-white/50 mt-2">
                    Created: <span className="text-white/70">{formatDateTime(manageTarget.createdAt)}</span>
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    Updated:{" "}
                    <span className="text-white/70">
                      {manageTarget.updatedAt ? formatDateTime(manageTarget.updatedAt) : "Never"}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setStatus("active")}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/20 transition"
                  >
                    Start / Resume
                  </button>

                  <button
                    onClick={() => setStatus("paused")}
                    className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold hover:bg-amber-500/20 transition"
                  >
                    Pause / Stop
                  </button>

                  <button
                    onClick={() => setStatus("completed")}
                    className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-sm font-semibold hover:bg-indigo-500/20 transition"
                  >
                    Mark Completed
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    onClick={deleteReminder}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition"
                  >
                    Delete
                  </button>

                  <button
                    onClick={closeManage}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

function normalizeName(s: string) {
  return s.trim().toLowerCase();
}
