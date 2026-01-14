// src/app/transactions/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ModalPortal from "@/components/ui/ModalPortal";
import UndoBar from "@/components/ui/UndoBar";

import TransactionsRangeHistorySection from "@/components/transactions/TransactionsRangeHistorySection";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  upsertTransactionToRepo,
  deleteTransactionFromRepo,
  fetchTransactions,
  type Transaction,
} from "@/store/features/transactions/transactionSlice";

import { v4 as uuidv4 } from "uuid";
import { useAuthUser } from "@/store/AuthProvider";

import {
  addTrashItem,
  clearTrash,
  loadTrash,
  removeTrashItem,
  type TrashItem,
} from "src/lib/storageTrash";

const categories = ["Food", "Travel", "Bills", "Shopping", "Other"];

type TxTypeFilter = "all" | "expense" | "income";
type TxSortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
// type HistoryViewMode = "list" | "range";

export default function TransactionsPage() {
  const user = useAuthUser();
  const uid = user?.uid;

  const dispatch = useAppDispatch();
  const {
    list: transactions,
    loading,
    error,
  } = useAppSelector((s) => s.transactions);

  const searchParams = useSearchParams();
  const openId = searchParams.get("open");

  // ✅ store refs for scrolling to a specific transaction card
  const [itemRefs] = useState(() => new Map<string, HTMLDivElement | null>());

  // ✅ highlight / focus animation id
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // ✅ prevents repeated open in StrictMode + repeated rerenders
  const handledOpenIdRef = useRef<string | null>(null);
  const openInProgressRef = useRef<boolean>(false);

  // ---------- Add Form ----------
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [txDate, setTxDate] = useState(() => todayISO());

  // ---------- History Filter ----------
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TxTypeFilter>("all");

  const [sortKey, setSortKey] = useState<TxSortKey>("date_desc");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all"); // 01..12

  // ---------- Edit Modal ----------
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const currentEditing = useMemo(
    () => transactions.find((t) => t.id === editId) ?? null,
    [transactions, editId]
  );

  const [editType, setEditType] = useState<"expense" | "income">("expense");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Food");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState(todayISO());

  // ---------- Delete Confirm Modal ----------
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  // ---------- Share Modal (fallback for HTTP / blocked clipboard) ----------
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareTitle, setShareTitle] = useState("");

  // ---------- Undo Bar ----------
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoTx, setUndoTx] = useState<Transaction | null>(null);
  const [undoSeconds] = useState<number>(10);

  // ---------- Trash Modal ----------
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]);

  // ---------- load ----------
  useEffect(() => {
    dispatch(fetchTransactions({ uid }));
  }, [uid, dispatch]);

  useEffect(() => {
    function handler() {
      dispatch(fetchTransactions({ uid }));
    }

    window.addEventListener("trash:restored", handler);
    return () => window.removeEventListener("trash:restored", handler);
  }, [uid, dispatch]);

  // keep trash synced (when uid changes or modal opened)
  useEffect(() => {
    setTrash(loadTrash(uid));
  }, [uid]);

  function refreshTrash() {
    setTrash(loadTrash(uid));
  }

  // ---------- open edit ----------
  function openEdit(t: Transaction) {
    setEditId(t.id);

    setEditType(t.type);
    setEditAmount(String(t.amount));
    setEditCategory(t.category);
    setEditNote(t.note ?? "");
    setEditDate(toISODateInput(t.date));

    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
  }

  // ✅ auto-open from dashboard (?open=ID) + scroll + highlight glow
  useEffect(() => {
    if (!openId) return;
    if (transactions.length === 0) return;

    // ✅ Already handled?
    if (handledOpenIdRef.current === openId) return;

    // ✅ If opening is already running (avoid duplicate)
    if (openInProgressRef.current) return;

    const t = transactions.find((x) => x.id === openId);
    if (!t) return;

    openInProgressRef.current = true;

    const start = setTimeout(() => {
      // ✅ Now mark as handled ONLY when action actually executes
      handledOpenIdRef.current = openId;

      setHighlightId(openId);

      const el = itemRefs.get(openId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

      openEdit(t);

      openInProgressRef.current = false;
    }, 250);

    const clearGlow = setTimeout(() => {
      setHighlightId((prev) => (prev === openId ? null : prev));
    }, 2500);

    return () => {
      clearTimeout(start);
      clearTimeout(clearGlow);

      // ✅ allow effect to run again safely (StrictMode)
      openInProgressRef.current = false;
    };
  }, [openId, transactions, itemRefs]);

  // ---------- add ----------
  function handleAdd() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!txDate) return;

    const nowIso = new Date().toISOString();

    const tx: Transaction = {
      id: uuidv4(),
      amount: amt,
      category,
      note: note.trim() || undefined,
      date: new Date(`${txDate}T12:00:00`).toISOString(),
      type,
      createdAt: nowIso,
      updatedAt: null,

      createdByUid: user?.uid,
      createdByEmail: user?.email ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    };

    dispatch(upsertTransactionToRepo({ uid, tx }));

    setAmount("");
    setNote("");
    setCategory("Food");
    setTxDate(todayISO());
  }

  // ---------- delete ----------
  function requestDelete(t: Transaction) {
    setDeleteTarget(t);
    setDeleteOpen(true);
  }

  function cancelDelete() {
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;

    const deletedAt = new Date().toISOString();

    // ✅ Add to trash history (LOCAL)
    addTrashItem(uid, { kind: "transaction", deletedAt, item: deleteTarget });
    refreshTrash();

    // ✅ Trigger undo bar
    setUndoTx(deleteTarget);
    setUndoOpen(true);

    // ✅ Delete from repo (existing behavior)
    dispatch(deleteTransactionFromRepo({ uid, id: deleteTarget.id }));

    cancelDelete();
  }

  function handleUndoDelete() {
    if (!undoTx) return;

    // ✅ restore back to repo
    dispatch(upsertTransactionToRepo({ uid, tx: undoTx }));

    // ✅ remove this restored tx from trash (optional)
    const all = loadTrash(uid);
    const match = all.find(
      (x) => x.kind === "transaction" && isTransaction(x.item) && x.item.id === undoTx.id
    );
    if (match) {
      removeTrashItem(uid, match.deletedAt);
    }
    refreshTrash();

    setUndoOpen(false);
    setUndoTx(null);
  }

  function closeUndo() {
    setUndoOpen(false);
    setUndoTx(null);
  }

  // ---------- save edit ----------
  function saveEdit() {
    if (!currentEditing) return;

    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!editDate) return;

    const updated: Transaction = {
      ...currentEditing,
      amount: amt,
      category: editCategory,
      note: editNote.trim() || undefined,
      type: editType,
      date: new Date(`${editDate}T12:00:00`).toISOString(),
      updatedAt: new Date().toISOString(),

      updatedByUid: user?.uid,
      updatedByEmail: user?.email ?? null,
    };

    dispatch(upsertTransactionToRepo({ uid, tx: updated }));
    closeEdit();
  }

  // ---------- share ----------
  async function shareTransaction(t: Transaction) {
    const msg = formatTransactionShare(t);

    setShareTitle("Share Transaction");
    setShareText(msg);

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Transaction",
          text: msg,
        });
        return;
      }
    } catch {
      // ignore -> fallback
    }

    const copied = await tryClipboardWrite(msg);
    if (copied) {
      alert("✅ Transaction copied to clipboard");
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

  // ---------- computed filters ----------
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const y = String(d.getFullYear());
      if (y !== "NaN") years.add(y);
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [transactions]);

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) =>
      String(i + 1).padStart(2, "0")
    );
  }, []);

  const filtered = useMemo<Transaction[]>(() => {
    const q = search.trim().toLowerCase();

    const base = transactions.filter((t) => {
      const matchesSearch =
        !q ||
        t.category.toLowerCase().includes(q) ||
        (t.note?.toLowerCase().includes(q) ?? false) ||
        String(t.amount).includes(q) ||
        t.type.toLowerCase().includes(q);

      const matchesType = typeFilter === "all" ? true : t.type === typeFilter;

      const d = new Date(t.date);
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, "0");

      const matchesYear = selectedYear === "all" ? true : y === selectedYear;
      const matchesMonth = selectedMonth === "all" ? true : m === selectedMonth;

      return matchesSearch && matchesType && matchesYear && matchesMonth;
    });

    return sortTransactions(base, sortKey);
  }, [transactions, search, typeFilter, selectedYear, selectedMonth, sortKey]);

  const txTrash = useMemo(() => {
    return trash.filter((x) => x.kind === "transaction");
  }, [trash]);

  return (
    <main className="pt-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Transactions</h1>
          <p className="text-white/60 mt-2">
            Add expenses manually and view your transaction history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
              {txTrash.length}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Form */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
          <h2 className="text-lg font-semibold">
            Add {type === "expense" ? "Expense" : "Income"}
          </h2>

          <div className="mt-5 space-y-3">
            <Input
              placeholder="Amount (₹)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
            />

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={type}
              onChange={(e) => setType(e.target.value as "expense" | "income")}
            >
              <option value="expense" className="bg-[#0B1220]">
                Expense
              </option>
              <option value="income" className="bg-[#0B1220]">
                Income
              </option>
            </select>

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c} className="bg-[#0B1220]">
                  {c}
                </option>
              ))}
            </select>

            {/* Transaction Date */}
            <div className="space-y-1">
              <p className="text-xs text-white/60">Transaction Date</p>
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>

            <Input
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <Button onClick={handleAdd} className="w-full">
              Add {type === "expense" ? "Expense" : "Income"}
            </Button>

            {error && <p className="text-xs text-rose-300 mt-2">{error}</p>}
          </div>
        </div>

        {/* History */}
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">History</h2>
              <p className="text-sm text-white/60 mt-1">
                Search, filter and manage your transactions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs text-white/50">
                Showing{" "}
                <span className="font-semibold text-white/70">
                  {filtered.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white/70">
                  {transactions.length}
                </span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <Input
              placeholder="Search category, note, amount…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:col-span-2"
            />

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TxTypeFilter)}
            >
              <option value="all" className="bg-[#0B1220]">
                All Types
              </option>
              <option value="expense" className="bg-[#0B1220]">
                Expense
              </option>
              <option value="income" className="bg-[#0B1220]">
                Income
              </option>
            </select>

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="all" className="bg-[#0B1220]">
                All Years
              </option>
              {yearOptions.map((y) => (
                <option key={y} value={y} className="bg-[#0B1220]">
                  {y}
                </option>
              ))}
            </select>

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="all" className="bg-[#0B1220]">
                All Months
              </option>
              {monthOptions.map((m) => (
                <option key={m} value={m} className="bg-[#0B1220]">
                  {monthName(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-xs text-white/50">Sort:</span>

            <select
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as TxSortKey)}
            >
              <option value="date_desc" className="bg-[#0B1220]">
                Newest first
              </option>
              <option value="date_asc" className="bg-[#0B1220]">
                Oldest first
              </option>
              <option value="amount_desc" className="bg-[#0B1220]">
                Amount high → low
              </option>
              <option value="amount_asc" className="bg-[#0B1220]">
                Amount low → high
              </option>
            </select>

            <button
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setSelectedYear("all");
                setSelectedMonth("all");
                setSortKey("date_desc");
              }}
              className="text-xs text-white/70 hover:text-white underline"
            >
              Reset
            </button>
          </div>

          {loading && (
            <div className="mt-4 text-sm text-white/60">Loading…</div>
          )}

          {/* ✅ History Output */}
          <TransactionsRangeHistorySection
            transactions={filtered}
            monthName={monthName}
            formatMoney={formatMoney}
            timeAgo={timeAgo}
            itemRefs={itemRefs}
            highlightId={highlightId}
            onEdit={openEdit}
            onShare={shareTransaction}
            onDelete={requestDelete}
          />
        </div>
      </div>

      {/* ✅ Undo bar */}
      <UndoBar
        open={undoOpen}
        message={undoTx ? `Transaction deleted: ${undoTx.category}` : "Deleted"}
        seconds={undoSeconds}
        onUndo={handleUndoDelete}
        onClose={closeUndo}
      />

      {/* ---------- Trash Modal ---------- */}
      {trashOpen && (
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
                    Restore deleted transactions or delete permanently.
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
                    {txTrash.length}
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
                {txTrash.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/50">
                    No deleted transactions.
                  </div>
                ) : (
                  txTrash.map((x) => {
                    const item = isTransaction(x.item) ? x.item : null;
                    if (!item) return null;

                    return (
                      <div
                        key={x.deletedAt}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {item.category} • ₹{formatMoney(item.amount)} •{" "}
                              {item.type.toUpperCase()}
                            </p>
                            <p className="text-xs text-white/60 mt-1">
                              Deleted: {new Date(x.deletedAt).toLocaleString()}
                            </p>
                            <p className="text-xs text-white/50 mt-1">
                              Date: {new Date(item.date).toLocaleString()}
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
                                  upsertTransactionToRepo({ uid, tx: item })
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
      )}

      {/* ---------- Edit Modal ---------- */}
      {editOpen && currentEditing && (
        <ModalPortal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeEdit} />

            <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Edit Transaction</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Update amount, date, note, category or type.
                  </p>
                </div>

                <button
                  onClick={closeEdit}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Amount (₹)"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  type="number"
                />

                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  value={editType}
                  onChange={(e) =>
                    setEditType(e.target.value as "expense" | "income")
                  }
                >
                  <option value="expense" className="bg-[#0B1220]">
                    Expense
                  </option>
                  <option value="income" className="bg-[#0B1220]">
                    Income
                  </option>
                </select>

                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c} className="bg-[#0B1220]">
                      {c}
                    </option>
                  ))}
                </select>

                <div className="space-y-1">
                  <p className="text-xs text-white/60">Transaction Date</p>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                </div>

                <div className="md:col-span-2">
                  <Input
                    placeholder="Note (optional)"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </div>
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

      {/* ---------- Delete Confirm Modal ---------- */}
      {deleteOpen && deleteTarget && (
        <ModalPortal>
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={cancelDelete}
            />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <h3 className="text-xl font-bold">Delete Transaction?</h3>

              <p className="text-sm text-white/60 mt-2">
                This will permanently delete this transaction.
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">{deleteTarget.category}</p>
                <p className="text-xs text-white/60 mt-1">
                  {deleteTarget.type.toUpperCase()} • ₹
                  {formatMoney(deleteTarget.amount)} •{" "}
                  {new Date(deleteTarget.date).toLocaleString()}
                </p>
                {deleteTarget.note ? (
                  <p className="text-xs text-white/50 mt-2">
                    Note: {deleteTarget.note}
                  </p>
                ) : null}
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

      {/* ---------- Share Modal (fallback) ---------- */}
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
                    Your browser blocked share/copy (common on HTTP). Copy it
                    manually or use the Copy button.
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

function isTransaction(x: unknown): x is Transaction {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.category === "string" &&
    (o.type === "expense" || o.type === "income") &&
    typeof o.amount === "number" &&
    typeof o.date === "string" &&
    typeof o.createdAt === "string"
  );
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ISO string -> YYYY-MM-DD
function toISODateInput(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTransactionShare(t: Transaction) {
  const sign = t.type === "expense" ? "-" : "+";
  const when = new Date(t.date).toLocaleString();
  const created = new Date(t.createdAt).toLocaleString();
  const edited = t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "Never";

  return [
    "📌 Transaction",
    `• Type: ${t.type.toUpperCase()}`,
    `• Amount: ${sign}₹${formatMoney(t.amount)}`,
    `• Category: ${t.category}`,
    `• Date: ${when}`,
    t.note ? `• Note: ${t.note}` : "",
    `• Created: ${created}`,
    `• Edited: ${edited}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function timeAgo(iso: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "just now";

  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);

  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  const week = Math.floor(day / 7);
  if (week < 4) return `${week}w ago`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;

  const year = Math.floor(day / 365);
  return `${year}y ago`;
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

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function sortTransactions(
  list: Transaction[],
  sortKey: TxSortKey
): Transaction[] {
  const arr = [...list];

  arr.sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();

    if (sortKey === "date_desc") return tb - ta;
    if (sortKey === "date_asc") return ta - tb;

    if (sortKey === "amount_desc") return b.amount - a.amount;
    if (sortKey === "amount_asc") return a.amount - b.amount;

    return tb - ta;
  });

  return arr;
}

function monthName(mm: string) {
  const map: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dec",
  };

  return map[mm] ? `${map[mm]} (${mm})` : mm;
}
