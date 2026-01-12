// src/lib/dashboard/stats.ts

type Tx = {
  amount: number;
  type: "expense" | "income";
};

export function computeTotals(list: Tx[]) {
  const totalExpense = list
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalIncome = list
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;

  return { totalExpense, totalIncome, balance };
}
