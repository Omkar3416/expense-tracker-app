// src/components/dashboard/DashboardRangePicker.tsx
"use client";

import type { RangeKey } from "@/lib/dashboard/dateRanges";

type Props = {
  range: RangeKey;
  setRange: (v: RangeKey) => void;

  dayAnchor: string;
  setDayAnchor: (v: string) => void;

  weekAnchor: string;
  setWeekAnchor: (v: string) => void;

  monthIndex: number;
  setMonthIndex: (v: number) => void;

  monthYear: number;
  setMonthYear: (v: number) => void;

  selectedYear: number;
  setSelectedYear: (v: number) => void;

  customFrom: string;
  setCustomFrom: (v: string) => void;

  customTo: string;
  setCustomTo: (v: string) => void;

  label: string;
};

export default function DashboardRangePicker({
  range,
  setRange,
  dayAnchor,
  setDayAnchor,
  weekAnchor,
  setWeekAnchor,
  monthIndex,
  setMonthIndex,
  monthYear,
  setMonthYear,
  selectedYear,
  setSelectedYear,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  label,
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["day", "week", "month", "year", "custom"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={[
              "px-4 py-2 rounded-2xl border text-sm font-semibold transition",
              range === key
                ? "bg-indigo-500/20 border-indigo-400/30"
                : "bg-white/5 border-white/10 hover:bg-white/10",
            ].join(" ")}
          >
            {key === "day"
              ? "Day"
              : key === "week"
              ? "Week"
              : key === "month"
              ? "Month"
              : key === "year"
              ? "Year"
              : "Custom"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {range === "day" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60">Day</span>
            <input
              type="date"
              value={dayAnchor}
              onChange={(e) => setDayAnchor(e.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
            />
          </div>
        )}

        {range === "week" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Week Anchor</span>
              <input
                type="date"
                value={weekAnchor}
                onChange={(e) => setWeekAnchor(e.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>
            <span className="text-xs text-white/40">
              Week range auto-calculated from this date
            </span>
          </>
        )}

        {range === "month" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60">Month</span>
            <input
              type="month"
              value={`${monthYear}-${String(monthIndex + 1).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                if (!y || !m) return;
                setMonthYear(y);
                setMonthIndex(m - 1);
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
            />
          </div>
        )}

        {range === "year" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/60">Year</span>
            <select
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 10 }).map((_, i) => {
                const y = currentYear - i;
                return (
                  <option key={y} value={y} className="bg-[#0B1220]">
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {range === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/60">From</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/60">To</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>
          </>
        )}

        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="text-xs text-white/50">Selected range</span>
          <span className="text-sm font-semibold text-white/80">{label}</span>
        </div>
      </div>
    </div>
  );
}
