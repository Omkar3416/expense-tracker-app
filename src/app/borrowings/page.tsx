// src/app/borrowings/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import ModalPortal from "@/components/ui/ModalPortal";
import UndoBar from "@/components/ui/UndoBar";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  type Borrowing,
  type BorrowingCategory,
  type BorrowingType,
  upsertBorrowingToRepo,
  deleteBorrowingFromRepo,
  fetchBorrowings,
} from "@/store/features/borrowings/borrowingSlice";

import { useAuthUser } from "@/store/AuthProvider";

import BorrowingsStats from "@/components/borrowings/BorrowingsStats";
import BorrowingsReminders from "@/components/borrowings/BorrowingsReminders";
import BorrowingsAddForm from "@/components/borrowings/BorrowingsAddForm";
import BorrowingsList, {
  type BorrowingsFilterKey,
} from "@/components/borrowings/BorrowingsList";
import BorrowingsModals from "@/components/borrowings/BorrowingsModals";

import {
  todayISO,
  daysUntil,
  toggleBorrowingPaid,
  addBorrowingPayment,
  formatMoney,
} from "@/lib/borrowings/borrowingsHelpers";

import {
  exportBorrowingsCSV,
  exportBorrowingsPDF,
} from "@/lib/borrowings/borrowingsExport";

import {
  formatBorrowingShare,
  legacyCopyToClipboard,
  timeAgo,
  tryClipboardWrite,
} from "@/lib/borrowings/borrowingsUIHelpers";

import {
  addTrashItem,
  clearTrash,
  loadTrash,
  removeTrashItem,
  type TrashItem,
} from "@/lib/storageTrash";
import TrashUnifiedModal from "@/components/ui/TrashUnifiedModal";
import type { Transaction } from "@/store/features/transactions/transactionSlice";
import { upsertTransactionToRepo } from "@/store/features/transactions/transactionSlice";

const BORROWING_CATEGORIES: { value: BorrowingCategory; label: string }[] = [
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "business", label: "Business" },
];

export default function BorrowingsPage() {
  const dispatch = useAppDispatch();
  const user = useAuthUser();
  const uid = user?.uid;

  const searchParams = useSearchParams();
  const openId = searchParams.get("open");

  const list = useAppSelector((s) => s.borrowings.list) as Borrowing[];

  // scrolling/highlight
  const [itemRefs] = useState(() => new Map<string, HTMLDivElement | null>());
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // ✅ Undo Bar
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoBorrowing, setUndoBorrowing] = useState<Borrowing | null>(null);
  const undoSeconds = 10;

  // ✅ Trash Modal
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]);

  function refreshTrash() {
    setTrash(loadTrash(uid));
  }

  // load
  useEffect(() => {
    dispatch(fetchBorrowings({ uid }));
  }, [uid, dispatch]);

  // load trash on uid change
  useEffect(() => {
    refreshTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /* ---------------- Add form ---------------- */

  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<BorrowingType>("borrowed");
  const [category, setCategory] = useState<BorrowingCategory>("friend");
  const [dueDate, setDueDate] = useState(() => todayISO());
  const [note, setNote] = useState("");

  function handleAdd() {
    const amt = Number(amount);

    if (!person.trim()) return;
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!dueDate) return;

    const nowIso = new Date().toISOString();

    const newItem: Borrowing = {
      id: uuidv4(),
      person: person.trim(),
      amount: amt,
      amountPaid: 0,
      payments: [],
      type,
      category,
      dueDate,
      note: note.trim() || undefined,
      status: "pending",
      createdAt: nowIso,
      updatedAt: null,
      paidAt: null,
      createdByUid: user?.uid,
      createdByEmail: user?.email ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    };

    dispatch(upsertBorrowingToRepo({ uid, borrowing: newItem }));

    setPerson("");
    setAmount("");
    setType("borrowed");
    setCategory("friend");
    setDueDate(todayISO());
    setNote("");
  }

  /* ---------------- Search + Filter ---------------- */

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BorrowingsFilterKey>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return list.filter((b) => {
      const matchesSearch =
        !q ||
        b.person.toLowerCase().includes(q) ||
        (b.note?.toLowerCase().includes(q) ?? false);

      const overdue = b.status === "pending" && daysUntil(b.dueDate) < 0;

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "overdue"
          ? overdue
          : b.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [list, query, filter]);

  /* ---------------- Stats + Reminders ---------------- */

  const pendingCount = useMemo(
    () => list.filter((b) => b.status === "pending").length,
    [list]
  );

  const overdueCount = useMemo(
    () =>
      list.filter((b) => b.status === "pending" && daysUntil(b.dueDate) < 0)
        .length,
    [list]
  );

  const dueTodayCount = useMemo(
    () =>
      list.filter((b) => b.status === "pending" && daysUntil(b.dueDate) === 0)
        .length,
    [list]
  );

  const dueSoonCount = useMemo(
    () =>
      list.filter(
        (b) =>
          b.status === "pending" &&
          daysUntil(b.dueDate) > 0 &&
          daysUntil(b.dueDate) <= 3
      ).length,
    [list]
  );

  const borrowReminders = useMemo(() => {
    return list
      .filter((b) => b.status === "pending" && b.amount > b.amountPaid)
      .map((b) => ({ ...b, d: daysUntil(b.dueDate) }))
      .filter((b) => b.d <= 7)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
  }, [list]);

  /* ---------------- Payment Modal ---------------- */

  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    id: string | null;
    person: string;
    remaining: number;
  }>({ open: false, id: null, person: "", remaining: 0 });

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => todayISO());

  function openPaymentModal(b: Borrowing) {
    const remaining = Math.max(0, b.amount - b.amountPaid);
    setPaymentModal({ open: true, id: b.id, person: b.person, remaining });
    setPaymentAmount("");
    setPaymentDate(todayISO());
  }

  function closePaymentModal() {
    setPaymentModal({ open: false, id: null, person: "", remaining: 0 });
    setPaymentAmount("");
    setPaymentDate(todayISO());
  }

  function confirmPayment() {
    if (!paymentModal.id) return;

    const pay = Number(paymentAmount);
    if (!Number.isFinite(pay) || pay <= 0) return;
    if (!paymentDate) return;

    const target = list.find((b) => b.id === paymentModal.id);
    if (!target) return;

    const updated = addBorrowingPayment(target, pay, paymentDate);

    dispatch(
      upsertBorrowingToRepo({
        uid,
        borrowing: {
          ...updated,
          updatedAt: new Date().toISOString(),
          updatedByUid: user?.uid,
          updatedByEmail: user?.email ?? null,
        },
      })
    );

    closePaymentModal();
  }

  /* ---------------- Edit Modal ---------------- */

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const editing = useMemo(
    () => list.find((b) => b.id === editId) ?? null,
    [list, editId]
  );

  const [editPerson, setEditPerson] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<BorrowingType>("borrowed");
  const [editCategory, setEditCategory] = useState<BorrowingCategory>("friend");
  const [editDueDate, setEditDueDate] = useState(todayISO());
  const [editNote, setEditNote] = useState("");

  function openEdit(b: Borrowing) {
    setEditId(b.id);
    setEditPerson(b.person);
    setEditAmount(String(b.amount));
    setEditType(b.type);
    setEditCategory(b.category);
    setEditDueDate(b.dueDate || todayISO());
    setEditNote(b.note ?? "");
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
  }

  function saveEdit() {
    if (!editing) return;

    const amt = Number(editAmount);
    if (!editPerson.trim()) return;
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!editDueDate) return;

    dispatch(
      upsertBorrowingToRepo({
        uid,
        borrowing: {
          ...editing,
          person: editPerson.trim(),
          amount: amt,
          type: editType,
          category: editCategory,
          dueDate: editDueDate,
          note: editNote.trim() || undefined,
          updatedAt: new Date().toISOString(),
          updatedByUid: user?.uid,
          updatedByEmail: user?.email ?? null,
        },
      })
    );

    closeEdit();
  }

  /* ---------------- Delete Modal (+ Undo + Trash) ---------------- */

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Borrowing | null>(null);

  function requestDelete(b: Borrowing) {
    setDeleteTarget(b);
    setDeleteOpen(true);
  }

  function cancelDelete() {
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;

    const deletedAt = new Date().toISOString();

    // ✅ store in trash (LOCAL)
    addTrashItem(uid, { kind: "borrowing", deletedAt, item: deleteTarget });
    refreshTrash();

    // ✅ show undo bar
    setUndoBorrowing(deleteTarget);
    setUndoOpen(true);

    // ✅ delete from repo (existing behavior)
    dispatch(deleteBorrowingFromRepo({ uid, id: deleteTarget.id }));

    cancelDelete();
  }

  function closeUndo() {
    setUndoOpen(false);
    setUndoBorrowing(null);
  }

  function handleUndoDelete() {
    if (!undoBorrowing) return;

    // ✅ restore to repo
    dispatch(upsertBorrowingToRepo({ uid, borrowing: undoBorrowing }));

    // ✅ remove restored item from trash (optional)
    const all = loadTrash(uid);
    const match = all.find(
      (x) => x.kind === "borrowing" && x.item.id === undoBorrowing.id
    );
    if (match) removeTrashItem(uid, match.deletedAt);

    refreshTrash();

    setUndoOpen(false);
    setUndoBorrowing(null);
  }

  /* ---------------- Toggle Paid ---------------- */

  function handleTogglePaid(b: Borrowing) {
    dispatch(upsertBorrowingToRepo({ uid, borrowing: toggleBorrowingPaid(b) }));
  }

  /* ---------------- Share Modal ---------------- */

  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareTitle, setShareTitle] = useState("");

  async function shareBorrowing(b: Borrowing) {
    const msg = formatBorrowingShare(b);

    setShareTitle("Share Borrowing");
    setShareText(msg);

    try {
      if (navigator.share) {
        await navigator.share({ title: "Borrowing", text: msg });
        return;
      }
    } catch {
      // ignore
    }

    const copied = await tryClipboardWrite(msg);
    if (copied) return alert("✅ Borrowing copied to clipboard");

    setShareOpen(true);
  }

  async function copyShareText() {
    const ok = await tryClipboardWrite(shareText);
    if (ok) return alert("✅ Copied!");

    const ok2 = legacyCopyToClipboard(shareText);
    if (ok2) return alert("✅ Copied!");

    alert("❌ Copy failed on this browser. Please copy manually.");
  }

  function closeShare() {
    setShareOpen(false);
    setShareText("");
    setShareTitle("");
  }

  /* ---------------- Exports ---------------- */

  const exportCSV = () => exportBorrowingsCSV(list);
  const exportPDF = () => exportBorrowingsPDF(list);

  /* ---------------- Optional Notifications ---------------- */

  const lastNotifyRef = useRef<number>(0);

  useEffect(() => {
    async function setupNotifications() {
      if (!("Notification" in window)) return;

      const now = Date.now();
      if (now - lastNotifyRef.current < 120_000) return;

      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          return;
        }
      }

      if (Notification.permission !== "granted") return;

      const dueNow = list.filter(
        (b) => b.status === "pending" && daysUntil(b.dueDate) <= 0
      );

      if (dueNow.length > 0) {
        lastNotifyRef.current = now;
        new Notification("Expense Tracker Reminder", {
          body: `${dueNow.length} borrowing(s) are due today or overdue.`,
        });
      }
    }

    setupNotifications();
  }, [list]);

  /* ---------------- Auto Open (?open=ID) ---------------- */

  useEffect(() => {
    if (!openId || list.length === 0) return;

    const target = list.find((b) => b.id === openId);
    if (!target) return;

    const start = setTimeout(() => {
      setHighlightId(openId);

      const el = itemRefs.get(openId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

      openEdit(target);
    }, 250);

    const clearGlow = setTimeout(() => {
      setHighlightId((prev) => (prev === openId ? null : prev));
    }, 2500);

    return () => {
      clearTimeout(start);
      clearTimeout(clearGlow);
    };
  }, [openId, list, itemRefs]);

  const borrowingTrash = useMemo(() => {
    return trash.filter((x) => x.kind === "borrowing");
  }, [trash]);

  return (
    <main className="pt-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Borrowings</h1>
          <p className="text-white/60 mt-2">
            Track money you borrowed or lent — with category, partial payments,
            reminders, and exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportCSV}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            Export CSV
          </button>

          <button
            onClick={exportPDF}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            Export PDF
          </button>

          <Link
            href="/dashboard"
            className="text-sm font-semibold text-white/80 hover:text-white underline"
          >
            Back to Dashboard
          </Link>
          {/* ✅ Deleted History */}
          <button
            onClick={() => {
              refreshTrash();
              setTrashOpen(true);
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition flex items-center gap-2"
          >
            <span className="text-white/80">🗑</span>
            Deleted History
            <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
              {borrowingTrash.length}
            </span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <BorrowingsStats
        total={list.length}
        pending={pendingCount}
        overdue={overdueCount}
        today={dueTodayCount}
        soon={dueSoonCount}
      />

      {/* Upcoming Reminders */}
      <BorrowingsReminders reminders={borrowReminders} />

      {/* Main Layout */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BorrowingsAddForm
          person={person}
          setPerson={setPerson}
          amount={amount}
          setAmount={setAmount}
          type={type}
          setType={setType}
          category={category}
          setCategory={setCategory}
          dueDate={dueDate}
          setDueDate={setDueDate}
          note={note}
          setNote={setNote}
          categories={BORROWING_CATEGORIES}
          onAdd={handleAdd}
        />

        <BorrowingsList
          list={list}
          filtered={filtered}
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
          highlightId={highlightId}
          itemRefs={itemRefs}
          overdueCount={overdueCount}
          dueTodayCount={dueTodayCount}
          dueSoonCount={dueSoonCount}
          onAddPayment={openPaymentModal}
          onEdit={openEdit}
          onShare={shareBorrowing}
          onTogglePaid={handleTogglePaid}
          onDelete={requestDelete}
          timeAgo={timeAgo}
        />
      </div>

      {/* ✅ Undo bar */}
      <UndoBar
        open={undoOpen}
        message={
          undoBorrowing
            ? `Borrowing deleted: ${undoBorrowing.person}`
            : "Borrowing deleted"
        }
        seconds={undoSeconds}
        onUndo={handleUndoDelete}
        onClose={closeUndo}
      />

      {/* ✅ Trash Modal */}
      {/* {trashOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setTrashOpen(false)}
            />

            <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Deleted History</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Restore deleted borrowings or delete permanently.
                  </p>
                </div>

                <button
                  onClick={() => setTrashOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-white/50">
                  Total deleted:{" "}
                  <span className="font-semibold text-white/70">
                    {borrowingTrash.length}
                  </span>
                </p>

                <button
                  onClick={() => {
                    clearTrash(uid);
                    refreshTrash();
                  }}
                  className="text-xs text-rose-200 hover:text-rose-100 underline"
                >
                  Clear all
                </button>
              </div>

              <div className="mt-5 space-y-3 max-h-[60vh] overflow-auto pr-1">
                {borrowingTrash.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
                    No deleted borrowings.
                  </div>
                ) : (
                  borrowingTrash.map((x) => {
                    const item = x.item as Borrowing;
                    const remaining = Math.max(
                      0,
                      item.amount - item.amountPaid
                    );

                    return (
                      <div
                        key={x.deletedAt}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {item.person} • ₹{formatMoney(item.amount)} •{" "}
                              {item.type.toUpperCase()}
                            </p>

                            <p className="text-xs text-white/60 mt-1">
                              Deleted: {new Date(x.deletedAt).toLocaleString()}
                            </p>

                            <p className="text-xs text-white/50 mt-1">
                              Due: {item.dueDate} • Remaining: ₹
                              {formatMoney(remaining)}
                            </p>

                            {item.note ? (
                              <p className="text-xs text-white/60 mt-2 break-words">
                                Note: {item.note}
                              </p>
                            ) : null}
                          </div>

                          <div className="shrink-0 flex flex-col gap-2">
                            <button
                              onClick={() => {
                                dispatch(
                                  upsertBorrowingToRepo({
                                    uid,
                                    borrowing: item,
                                  })
                                );
                                removeTrashItem(uid, x.deletedAt);
                                refreshTrash();
                                setTrashOpen(false);
                              }}
                              className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition"
                            >
                              Restore
                            </button>

                            <button
                              onClick={() => {
                                removeTrashItem(uid, x.deletedAt);
                                refreshTrash();
                              }}
                              className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
                            >
                              Delete forever
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )} */}
      <TrashUnifiedModal
        uid={uid}
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        trash={trash}
        refreshTrash={refreshTrash}
        onRestoreTransaction={(t: Transaction) => {
          dispatch(upsertTransactionToRepo({ uid, tx: t }));
        }}
        onRestoreBorrowing={(b: Borrowing) => {
          dispatch(upsertBorrowingToRepo({ uid, borrowing: b }));
        }}
        formatMoney={formatMoney}
      />

      {/* All Modals */}
      <BorrowingsModals
        paymentOpen={paymentModal.open}
        paymentPerson={paymentModal.person}
        paymentRemaining={paymentModal.remaining}
        paymentAmount={paymentAmount}
        setPaymentAmount={setPaymentAmount}
        paymentDate={paymentDate}
        setPaymentDate={setPaymentDate}
        onCancelPayment={closePaymentModal}
        onConfirmPayment={confirmPayment}
        editOpen={editOpen}
        editing={editing}
        editPerson={editPerson}
        setEditPerson={setEditPerson}
        editAmount={editAmount}
        setEditAmount={setEditAmount}
        editType={editType}
        setEditType={setEditType}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        editDueDate={editDueDate}
        setEditDueDate={setEditDueDate}
        editNote={editNote}
        setEditNote={setEditNote}
        categories={BORROWING_CATEGORIES}
        onCloseEdit={closeEdit}
        onSaveEdit={saveEdit}
        deleteOpen={deleteOpen}
        deleteTarget={deleteTarget}
        onCancelDelete={cancelDelete}
        onConfirmDelete={confirmDelete}
        shareOpen={shareOpen}
        shareTitle={shareTitle}
        shareText={shareText}
        onCloseShare={closeShare}
        onCopyShareText={copyShareText}
      />
    </main>
  );
}
