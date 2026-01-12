// src/components/dashboard/DashboardQuickCategoriesPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ModalPortal from "@/components/ui/ModalPortal";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { RootState } from "@/store/store";

import {
  type Category,
  upsertCategoryToRepo,
  deleteCategoryFromRepo,
} from "@/store/features/categories/categorySlice";

import type { Transaction } from "@/store/features/transactions/transactionSlice";
import { deleteTransactionFromRepo } from "@/store/features/transactions/transactionSlice";

import { formatMoney, todayISO } from "@/lib/dashboard/dashboardHelpers";

type Props = {
  uid?: string;
  userUid?: string;
  userEmail?: string | null;

  // ✅ used to compute totals per category
  transactions: Transaction[];

  // ✅ quick add uses same existing flow
  onQuickAdd: (tx: Transaction) => void;
};

function nowIso() {
  return new Date().toISOString();
}

function nowTimeHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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

function normalizeName(s: string) {
  return s.trim().toLowerCase();
}

export default function DashboardQuickCategoriesPanel({
  uid,
  userUid,
  userEmail,
  transactions,
  onQuickAdd,
}: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const categories = useAppSelector((s: RootState) => s.categories.list);

  const txCategories = useMemo(() => {
    return categories
      .filter((c) => c.type === "transaction")
      .slice()
      .sort((a, b) => {
        const ao = typeof a.sortOrder === "number" ? a.sortOrder : 9999;
        const bo = typeof b.sortOrder === "number" ? b.sortOrder : 9999;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });
  }, [categories]);

  // ✅ modal state (create category)
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  // ✅ rename/delete modal
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<Category | null>(null);
  const [renameName, setRenameName] = useState("");

  // ✅ expand state for inline quick add form
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ✅ expand state for items list inside each category card
  const [itemsExpanded, setItemsExpanded] = useState<Record<string, boolean>>(
    {}
  );

  // ✅ per-category quick add state
  const [quickAmount, setQuickAmount] = useState<Record<string, string>>({});
  const [quickNote, setQuickNote] = useState<Record<string, string>>({});
  const [quickDate, setQuickDate] = useState<Record<string, string>>({});
  const [quickTime, setQuickTime] = useState<Record<string, string>>({});

  const nameCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of txCategories) {
      const k = normalizeName(c.name);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [txCategories]);

  const totals = useMemo(() => {
    const map = new Map<
      string,
      { expense: number; income: number; total: number }
    >();

    for (const c of txCategories) {
      map.set(c.id, { expense: 0, income: 0, total: 0 });
    }

    for (const t of transactions) {
      const catName = normalizeName(t.category);
      const match = txCategories.find((c) => normalizeName(c.name) === catName);
      if (!match) continue;

      const row = map.get(match.id);
      if (!row) continue;

      if (t.type === "expense") row.expense += t.amount;
      else row.income += t.amount;

      row.total = row.income - row.expense;
    }

    return map;
  }, [transactions, txCategories]);

  function openAdd() {
    setNewName("");
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    setNewName("");
  }

  function createCategory() {
    const name = newName.trim();
    if (!name) return;

    // ✅ prevent duplicates (case-insensitive)
    const exists = txCategories.some(
      (c) => normalizeName(c.name) === normalizeName(name)
    );
    if (exists) {
      alert("⚠️ This category already exists. Please choose another name.");
      return;
    }

    const now = nowIso();

    const c: Category = {
      id: uuidv4(),
      name,
      type: "transaction",
      createdAt: now,
      updatedAt: null,

      createdByUid: userUid,
      createdByEmail: userEmail ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    };

    dispatch(upsertCategoryToRepo({ uid, category: c }));
    closeAdd();
  }

  function openManage(c: Category) {
    setManageTarget(c);
    setRenameName(c.name);
    setManageOpen(true);
  }

  function closeManage() {
    setManageOpen(false);
    setManageTarget(null);
    setRenameName("");
  }

  function saveRename() {
    if (!manageTarget) return;
    const name = renameName.trim();
    if (!name) return;

    // ✅ prevent duplicates (except itself)
    const exists = txCategories.some(
      (x) =>
        x.id !== manageTarget.id && normalizeName(x.name) === normalizeName(name)
    );
    if (exists) {
      alert("⚠️ Another category already has this name.");
      return;
    }

    const updated: Category = {
      ...manageTarget,
      name,
      updatedAt: nowIso(),
      updatedByUid: userUid,
      updatedByEmail: userEmail ?? null,
    };

    dispatch(upsertCategoryToRepo({ uid, category: updated }));
    closeManage();
  }

  function deleteCategoryFromCard(c: Category) {
    const ok = confirm(
      `Delete category "${c.name}"?\n\n✅ This will also delete ALL transactions under this category.`
    );
    if (!ok) return;

    const targetName = normalizeName(c.name);

    // ✅ delete ALL transactions of this category
    const matches = transactions.filter(
      (t) => normalizeName(t.category) === targetName
    );

    for (const t of matches) {
      dispatch(deleteTransactionFromRepo({ uid, id: t.id }));
    }

    // ✅ delete category itself
    dispatch(deleteCategoryFromRepo({ uid, id: c.id }));

    // ✅ close expanded views (if open)
    setExpanded((prev) => {
      const copy = { ...prev };
      delete copy[c.id];
      return copy;
    });

    setItemsExpanded((prev) => {
      const copy = { ...prev };
      delete copy[c.id];
      return copy;
    });
  }

  function deleteCategoryFromManageModal() {
    if (!manageTarget) return;

    const ok = confirm(
      `Delete category "${manageTarget.name}"?\n\n✅ This will also delete ALL transactions under this category.`
    );
    if (!ok) return;

    const targetName = normalizeName(manageTarget.name);

    const matches = transactions.filter(
      (t) => normalizeName(t.category) === targetName
    );

    for (const t of matches) {
      dispatch(deleteTransactionFromRepo({ uid, id: t.id }));
    }

    dispatch(deleteCategoryFromRepo({ uid, id: manageTarget.id }));
    closeManage();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = !prev[id];

      // ✅ init defaults when opening for first time
      if (next) {
        setQuickDate((m) => ({ ...m, [id]: m[id] ?? todayISO() }));
        setQuickTime((m) => ({ ...m, [id]: m[id] ?? nowTimeHHMM() }));
        setQuickAmount((m) => ({ ...m, [id]: m[id] ?? "" }));
        setQuickNote((m) => ({ ...m, [id]: m[id] ?? "" }));
      }

      return { ...prev, [id]: next };
    });
  }

  function toggleItemsExpand(id: string) {
    setItemsExpanded((p) => ({ ...p, [id]: !p[id] }));
  }

  function submitQuickAddForCategory(c: Category) {
    const id = c.id;
    const amtRaw = quickAmount[id] ?? "";
    const noteRaw = quickNote[id] ?? "";
    const date = quickDate[id] ?? "";
    const time = quickTime[id] ?? "";

    const amt = Number(amtRaw);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("❌ Invalid amount");
      return;
    }
    if (!date) {
      alert("❌ Please select date");
      return;
    }
    if (!time) {
      alert("❌ Please select time");
      return;
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const isoDate = new Date(`${date}T${time}:00`).toISOString();

    const tx: Transaction = {
      id: uuidv4(),
      amount: amt,
      category: c.name,
      note: noteRaw.trim() || undefined,
      date: isoDate,
      type: "expense",

      createdAt,
      updatedAt: null,

      createdByUid: userUid,
      createdByEmail: userEmail ?? null,
      updatedByUid: undefined,
      updatedByEmail: undefined,
    };

    onQuickAdd(tx);

    // ✅ reset form for this category
    setQuickAmount((m) => ({ ...m, [id]: "" }));
    setQuickNote((m) => ({ ...m, [id]: "" }));
    setQuickDate((m) => ({ ...m, [id]: todayISO() }));
    setQuickTime((m) => ({ ...m, [id]: nowTimeHHMM() }));
  }

  function openTransaction(id: string) {
    router.push(`/transactions?open=${encodeURIComponent(id)}`);
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Quick Categories</h2>
          <p className="text-sm text-white/60 mt-1">
            Create categories like DMart, Kirana, Petrol — and quickly add
            transactions with date & time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAdd}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            + Add Category
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {txCategories.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
            No categories yet. Create one like{" "}
            <span className="text-white/80 font-semibold">DMart</span> or{" "}
            <span className="text-white/80 font-semibold">Petrol</span>.
          </div>
        ) : (
          txCategories.map((c) => {
            const t = totals.get(c.id) ?? { expense: 0, income: 0, total: 0 };
            const dup = (nameCounts.get(normalizeName(c.name)) ?? 0) > 1;

            const isAddOpen = !!expanded[c.id];
            const isItemsOpen = !!itemsExpanded[c.id];

            const targetName = normalizeName(c.name);
            const listAll = transactions
              .filter((x) => normalizeName(x.category) === targetName)
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const preview = isItemsOpen ? listAll : listAll.slice(0, 5);

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {c.name}
                      {dup ? (
                        <span className="ml-2 text-xs text-amber-200/80">
                          (duplicate)
                        </span>
                      ) : null}
                    </p>

                    <p className="text-xs text-white/50 mt-1">
                      Created:{" "}
                      <span className="text-white/70">
                        {formatDateTime(c.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      Updated:{" "}
                      <span className="text-white/60">
                        {c.updatedAt ? formatDateTime(c.updatedAt) : "Never"}
                      </span>
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col gap-2">
                    {/* ✅ Add form toggle */}
                    <button
                      onClick={() => toggleExpand(c.id)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                      title="Expand / Collapse"
                    >
                      {isAddOpen ? "Hide" : "Add"}
                    </button>

                    {/* ✅ Manage */}
                    <button
                      onClick={() => openManage(c)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                      title="Manage category"
                    >
                      Manage
                    </button>

                    {/* ✅ Delete */}
                    <button
                      onClick={() => deleteCategoryFromCard(c)}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition"
                      title="Delete category"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-white/60">Net total</p>
                  <p className="text-xl font-bold mt-1">
                    ₹{formatMoney(t.total)}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    Expense: ₹{formatMoney(t.expense)} • Income: ₹
                    {formatMoney(t.income)}
                  </p>
                </div>

                {/* ✅ Category Items List */}
                <div className="mt-4 rounded-2xl border border-white/10 bg-[#0B1220]/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-white/60 font-semibold">
                      Items ({listAll.length})
                    </p>

                    {listAll.length > 5 && (
                      <button
                        onClick={() => toggleItemsExpand(c.id)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                      >
                        {isItemsOpen ? "Hide" : "Show All"}
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {preview.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-white/50 text-sm">
                        No items yet in {c.name}.
                      </div>
                    ) : (
                      preview.map((tx) => (
                        <div
                          key={tx.id}
                          onClick={() => openTransaction(tx.id)}
                          className="cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-4 hover:bg-white/10 transition"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {tx.note ? tx.note : tx.category}
                            </p>
                            <p className="text-xs text-white/60 mt-1">
                              {new Date(tx.date).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p
                              className={[
                                "text-sm font-bold",
                                tx.type === "expense"
                                  ? "text-rose-200"
                                  : "text-emerald-200",
                              ].join(" ")}
                            >
                              {tx.type === "expense" ? "-" : "+"}₹
                              {formatMoney(tx.amount)}
                            </p>
                            <p className="text-[11px] text-white/50 mt-1">
                              {tx.type}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ✅ Inline Quick Add */}
                {isAddOpen && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
                    <p className="text-sm font-semibold text-white/80">
                      Add Transaction
                    </p>

                    <div className="grid grid-cols-1 gap-2">
                      <Input
                        placeholder="Amount (₹)"
                        type="number"
                        value={quickAmount[c.id] ?? ""}
                        onChange={(e) =>
                          setQuickAmount((m) => ({
                            ...m,
                            [c.id]: e.target.value,
                          }))
                        }
                      />

                      <Input
                        placeholder="Note (optional)"
                        value={quickNote[c.id] ?? ""}
                        onChange={(e) =>
                          setQuickNote((m) => ({
                            ...m,
                            [c.id]: e.target.value,
                          }))
                        }
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={quickDate[c.id] ?? todayISO()}
                          onChange={(e) =>
                            setQuickDate((m) => ({
                              ...m,
                              [c.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                        />

                        <input
                          type="time"
                          value={quickTime[c.id] ?? nowTimeHHMM()}
                          onChange={(e) =>
                            setQuickTime((m) => ({
                              ...m,
                              [c.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
                        />
                      </div>

                      <Button
                        onClick={() => submitQuickAddForCategory(c)}
                        className="w-full"
                      >
                        Add Expense
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Category Modal */}
      {addOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeAdd} />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Add Category</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Examples: DMart, Kirana Store, Petrol, Medicines
                  </p>
                </div>

                <button
                  onClick={closeAdd}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <Input
                  placeholder="Category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />

                <p className="text-xs text-white/50">
                  Created at:{" "}
                  <span className="text-white/70">
                    {formatDateTime(nowIso())}
                  </span>
                </p>

                <div className="mt-4 flex items-center justify-end gap-3">
                  <button
                    onClick={closeAdd}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>

                  <Button onClick={createCategory} className="px-6">
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Manage Modal */}
      {manageOpen && manageTarget && (
        <ModalPortal>
          <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeManage} />

            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Manage Category</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Rename or delete category. Delete will also delete all
                    transactions under this category.
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
                <Input
                  placeholder="Category name"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                />

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-white/60">
                    Created:{" "}
                    <span className="text-white/80">
                      {formatDateTime(manageTarget.createdAt)}
                    </span>
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    Updated:{" "}
                    <span className="text-white/80">
                      {manageTarget.updatedAt
                        ? formatDateTime(manageTarget.updatedAt)
                        : "Never"}
                    </span>
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    onClick={deleteCategoryFromManageModal}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition"
                  >
                    Delete
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={closeManage}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
                    >
                      Cancel
                    </button>

                    <Button onClick={saveRename} className="px-6">
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
