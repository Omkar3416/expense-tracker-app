"use client";

export default function BorrowingsStats({
  total,
  pending,
  overdue,
  today,
  soon,
}: {
  total: number;
  pending: number;
  overdue: number;
  today: number;
  soon: number;
}) {
  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-5">
      <StatCard title="Total" value={String(total)} />
      <StatCard title="Pending" value={String(pending)} />
      <StatCard title="Overdue" value={String(overdue)} />
      <StatCard title="Today" value={String(today)} />
      <StatCard title="Due Soon" value={String(soon)} />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
      <p className="text-white/70 text-sm">{title}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
