// src/components/borrowings/BorrowingsModals.tsx
"use client";

import ModalPortal from "@/components/ui/ModalPortal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import PaymentModal from "@/components/borrowings/PaymentModal";

import type {
  Borrowing,
  BorrowingCategory,
  BorrowingType,
} from "@/store/features/borrowings/borrowingSlice";

import { formatMoney } from "@/lib/borrowings/borrowingsHelpers";

type CategoryOption = { value: BorrowingCategory; label: string };

type Props = {
  // Payment
  paymentOpen: boolean;
  paymentPerson: string;
  paymentRemaining: number;
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;

  paymentDate: string;
  setPaymentDate: (v: string) => void;

  onCancelPayment: () => void;
  onConfirmPayment: () => void;

  // Edit
  editOpen: boolean;
  editing: Borrowing | null;
  editPerson: string;
  setEditPerson: (v: string) => void;
  editAmount: string;
  setEditAmount: (v: string) => void;
  editType: BorrowingType;
  setEditType: (v: BorrowingType) => void;
  editCategory: BorrowingCategory;
  setEditCategory: (v: BorrowingCategory) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  editNote: string;
  setEditNote: (v: string) => void;
  categories: CategoryOption[];
  onCloseEdit: () => void;
  onSaveEdit: () => void;

  // Delete
  deleteOpen: boolean;
  deleteTarget: Borrowing | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;

  // Share
  shareOpen: boolean;
  shareTitle: string;
  shareText: string;
  onCloseShare: () => void;
  onCopyShareText: () => void;
};

export default function BorrowingsModals(props: Props) {
  return (
    <>
      <PaymentModal
        open={props.paymentOpen}
        person={props.paymentPerson}
        remaining={props.paymentRemaining}
        paymentAmount={props.paymentAmount}
        setPaymentAmount={props.setPaymentAmount}
        paymentDate={props.paymentDate}
        setPaymentDate={props.setPaymentDate}
        onCancel={props.onCancelPayment}
        onConfirm={props.onConfirmPayment}
      />

      {props.editOpen && props.editing && (
        <EditModal
          editPerson={props.editPerson}
          setEditPerson={props.setEditPerson}
          editAmount={props.editAmount}
          setEditAmount={props.setEditAmount}
          editType={props.editType}
          setEditType={props.setEditType}
          editCategory={props.editCategory}
          setEditCategory={props.setEditCategory}
          editDueDate={props.editDueDate}
          setEditDueDate={props.setEditDueDate}
          editNote={props.editNote}
          setEditNote={props.setEditNote}
          categories={props.categories}
          onClose={props.onCloseEdit}
          onSave={props.onSaveEdit}
        />
      )}

      {props.deleteOpen && props.deleteTarget && (
        <DeleteModal
          target={props.deleteTarget}
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      )}

      {props.shareOpen && (
        <ShareModal
          title={props.shareTitle}
          text={props.shareText}
          onClose={props.onCloseShare}
          onCopy={props.onCopyShareText}
        />
      )}
    </>
  );
}

/* -------- existing modals below unchanged -------- */

function EditModal({
  editPerson,
  setEditPerson,
  editAmount,
  setEditAmount,
  editType,
  setEditType,
  editCategory,
  setEditCategory,
  editDueDate,
  setEditDueDate,
  editNote,
  setEditNote,
  categories,
  onClose,
  onSave,
}: {
  editPerson: string;
  setEditPerson: (v: string) => void;
  editAmount: string;
  setEditAmount: (v: string) => void;
  editType: BorrowingType;
  setEditType: (v: BorrowingType) => void;
  editCategory: BorrowingCategory;
  setEditCategory: (v: BorrowingCategory) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  editNote: string;
  setEditNote: (v: string) => void;
  categories: CategoryOption[];
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />

        <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">Edit Borrowing</h3>
              <p className="text-xs text-white/60 mt-1">
                Update person, amount, due date, type, category and note.
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
            >
              Close
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="Person name"
              value={editPerson}
              onChange={(e) => setEditPerson(e.target.value)}
            />

            <Input
              placeholder="Amount (₹)"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              type="number"
            />

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={editType}
              onChange={(e) => setEditType(e.target.value as BorrowingType)}
            >
              <option value="borrowed" className="bg-[#0B1220]">
                I Borrowed
              </option>
              <option value="lent" className="bg-[#0B1220]">
                I Lent
              </option>
            </select>

            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as BorrowingCategory)}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value} className="bg-[#0B1220]">
                  {c.label}
                </option>
              ))}
            </select>

            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-white/60">Due date</p>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
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
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
            >
              Cancel
            </button>

            <Button onClick={onSave} className="px-6">
              Save
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function DeleteModal({
  target,
  onCancel,
  onConfirm,
}: {
  target: Borrowing;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={onCancel} />

        <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
          <h3 className="text-xl font-bold">Delete Borrowing?</h3>

          <p className="text-sm text-white/60 mt-2">
            This will permanently delete this borrowing entry.
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold">{target.person}</p>
            <p className="text-xs text-white/60 mt-1">
              {target.type.toUpperCase()} • ₹{formatMoney(target.amount)} • Due:{" "}
              {target.dueDate}
            </p>
            {target.note ? (
              <p className="text-xs text-white/50 mt-2">Note: {target.note}</p>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
            >
              Cancel
            </button>

            <button
              onClick={onConfirm}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold hover:bg-rose-500/20 transition"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function ShareModal({
  title,
  text,
  onClose,
  onCopy,
}: {
  title: string;
  text: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />

        <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="text-xs text-white/60 mt-1">
                Your browser blocked share/copy (common on HTTP). Copy it
                manually or use the Copy button.
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
            >
              Close
            </button>
          </div>

          <textarea
            value={text}
            readOnly
            className="mt-4 w-full h-56 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/90 outline-none"
          />

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
            >
              Cancel
            </button>

            <Button onClick={onCopy} className="px-6">
              Copy
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
