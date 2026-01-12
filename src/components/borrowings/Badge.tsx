"use client";

export default function Badge({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: "overdue" | "today" | "soon" | "ok" | "paid";
}) {
  const cls =
    kind === "overdue"
      ? "bg-rose-500/15 text-rose-200 border-rose-500/25"
      : kind === "today"
      ? "bg-amber-500/15 text-amber-200 border-amber-500/25"
      : kind === "soon"
      ? "bg-indigo-500/15 text-indigo-200 border-indigo-500/25"
      : kind === "paid"
      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/25"
      : "bg-white/10 text-white/70 border-white/10";

  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}
