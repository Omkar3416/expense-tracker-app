// src/lib/dashboard/dateRanges.ts

export type RangeKey = "day" | "week" | "month" | "year" | "custom";

const DAY = 1000 * 60 * 60 * 24;

function startOfLocalDay(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function parseISODateOnly(iso: string) {
  // iso = YYYY-MM-DD (local date)
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

/**
 * getRange
 * - day: one local day, anchored by dayAnchor (YYYY-MM-DD)
 * - week: week starting Monday, anchored by weekAnchor (YYYY-MM-DD)
 * - month: monthIndex (0-11) + monthYear
 * - year: selectedYear (number)
 * - custom: from-to (YYYY-MM-DD)
 */
export function getRange(params: {
  range: RangeKey;

  // day
  dayAnchor?: string;

  // week
  weekAnchor?: string;

  // month
  monthIndex?: number; // 0-11
  monthYear?: number;

  // year
  selectedYear?: number;

  // custom
  customFrom?: string;
  customTo?: string;
}) {
  const now = new Date();
  const todayISO = new Date().toISOString().slice(0, 10);
  const currentYear = now.getFullYear();

  // ✅ DAY
  if (params.range === "day") {
    const anchorISO = params.dayAnchor ?? todayISO;
    const start = startOfLocalDay(parseISODateOnly(anchorISO));
    return {
      start,
      end: start + DAY,
      label: `Day ${anchorISO}`,
    };
  }

  // ✅ WEEK (Monday → Sunday)
  if (params.range === "week") {
    const anchorISO = params.weekAnchor ?? todayISO;
    const anchor = parseISODateOnly(anchorISO);

    const day = new Date(anchor).getDay(); // 0 Sun ... 6 Sat
    const monday = anchor - ((day + 6) % 7) * DAY;

    const start = startOfLocalDay(monday);
    const end = start + 7 * DAY;

    const startISO = new Date(start).toISOString().slice(0, 10);
    const endISO = new Date(end - DAY).toISOString().slice(0, 10);

    return {
      start,
      end,
      label: `Week ${startISO} → ${endISO}`,
    };
  }

  // ✅ MONTH
  if (params.range === "month") {
    const monthIndex = params.monthIndex ?? now.getMonth();
    const monthYear = params.monthYear ?? currentYear;

    const start = new Date(monthYear, monthIndex, 1).getTime();
    const end = new Date(monthYear, monthIndex + 1, 1).getTime();

    const labelMonth = new Date(monthYear, monthIndex, 1).toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
    });

    return {
      start,
      end,
      label: `Month ${labelMonth}`,
    };
  }

  // ✅ CUSTOM
  if (params.range === "custom") {
    const fromISO = params.customFrom ?? todayISO;
    const toISO = params.customTo ?? fromISO;

    const start = startOfLocalDay(parseISODateOnly(fromISO));
    const end = startOfLocalDay(parseISODateOnly(toISO)) + DAY; // include end date

    return {
      start,
      end,
      label: `${fromISO} → ${toISO}`,
    };
  }

  // ✅ YEAR
  const y = params.selectedYear ?? currentYear;
  const start = new Date(y, 0, 1).getTime();
  const end = new Date(y + 1, 0, 1).getTime();

  return {
    start,
    end,
    label: `Year ${y}`,
  };
}
