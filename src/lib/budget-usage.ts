import type { FinanceState } from "./types";

export function getBudgetUsage(state: FinanceState, month: string) {
  const total = state.budgets.reduce((sum, budget) => sum + budget.amount, 0);
  const spent = state.budgets.reduce((sum, budget) => {
    if (budget.spent !== undefined) return sum + budget.spent;
    return sum + state.transactions
      .filter((transaction) => transaction.type === "expense" && transaction.categoryId === budget.categoryId && transaction.date.startsWith(month))
      .reduce((transactionSum, transaction) => transactionSum + transaction.amount, 0);
  }, 0);
  const percent = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  return { spent, total, percent };
}
