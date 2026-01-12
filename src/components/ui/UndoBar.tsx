// src/components/ui/UndoBar.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  message: string;
  seconds?: number;
  onUndo: () => void;
  onClose: () => void;
};

export default function UndoBar({
  open,
  message,
  seconds = 10,
  onUndo,
  onClose,
}: Props) {
  // ✅ deadline stored in state (safe in render)
  const [deadlineTs, setDeadlineTs] = useState<number>(0);

  // ✅ now stored in state (only updated by timer callback)
  const [nowTs, setNowTs] = useState<number>(0);

  useEffect(() => {
    // ✅ IMPORTANT:
    // Your rule-set forbids calling setState directly in effect body.
    // So ALL setState must happen inside callbacks.

    if (!open) {
      // ✅ schedule reset instead of doing it synchronously
      const reset = window.setTimeout(() => {
        setDeadlineTs(0);
        setNowTs(0);
      }, 0);

      return () => {
        window.clearTimeout(reset);
      };
    }

    // ✅ initialize via callback
    const init = window.setTimeout(() => {
      const startNow = Date.now();
      setDeadlineTs(startNow + seconds * 1000);
      setNowTs(startNow);
    }, 0);

    // ✅ tick updates nowTs only inside callback
    const i = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    // ✅ auto close after seconds
    const t = window.setTimeout(() => {
      onClose();
    }, seconds * 1000);

    return () => {
      window.clearTimeout(init);
      window.clearInterval(i);
      window.clearTimeout(t);
    };
  }, [open, seconds, onClose]);

  const left = useMemo(() => {
    if (!open) return 0;

    // ✅ deadline is state (safe)
    if (!deadlineTs) return seconds;

    const ms = deadlineTs - nowTs;
    const s = Math.ceil(ms / 1000);

    return Math.max(0, s);
  }, [open, deadlineTs, nowTs, seconds]);

  const percent = useMemo(() => {
    if (!open) return 0;
    if (seconds <= 0) return 0;

    return Math.round((left / seconds) * 100);
  }, [open, left, seconds]);

  if (!open) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[999] w-[min(680px,calc(100vw-24px))]">
      <div className="rounded-2xl border border-white/10 bg-[#0B1220] shadow-2xl shadow-black/40 overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/90 truncate">
              {message}
            </p>
            <p className="text-xs text-white/50 mt-0.5">
              Undo available for {left}s
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onUndo}
              className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition"
            >
              Undo
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 transition"
            >
              Dismiss
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/5">
          <div
            className="h-1 bg-indigo-400/60 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
