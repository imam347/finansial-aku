import type { FinanceState } from "./types";

export function getDashboardCategoryExpenses(
  state: FinanceState,
  month: string,
  summaryValues?: { categoryId: string; value: number }[],
  totalExpense?: number,
) {
  const items = state.categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      ...category,
      value: Math.max(0, summaryValues?.find((item) => item.categoryId === category.id)?.value
        ?? state.transactions
          .filter((transaction) => transaction.type === "expense" && transaction.categoryId === category.id && transaction.date.startsWith(month))
          .reduce((sum, transaction) => sum + transaction.amount, 0)),
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
  const targetTotal = Math.max(0, totalExpense ?? items.reduce((sum, item) => sum + item.value, 0));
  const itemTotal = items.reduce((sum, item) => sum + item.value, 0);
  if (targetTotal === 0) return [];
  if (itemTotal === 0) return [{
    id: "__other_expense",
    name: "Lainnya",
    type: "expense" as const,
    color: "#8a9a93",
    icon: "wallet",
    value: targetTotal,
  }];
  if (itemTotal < targetTotal) return [...items, {
    id: "__other_expense",
    name: "Lainnya",
    type: "expense" as const,
    color: "#8a9a93",
    icon: "wallet",
    value: targetTotal - itemTotal,
  }];
  return items;
}

export function getDashboardActivity(state: FinanceState, range: { from: string; to: string }) {
  const result: { date: string; expense: number }[] = [];
  const cursor = new Date(`${range.from}T00:00:00`);
  const end = new Date(`${range.to}T00:00:00`);
  while (cursor <= end) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    result.push({
      date,
      expense: state.transactions
        .filter((transaction) => transaction.type === "expense" && transaction.date === date)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
