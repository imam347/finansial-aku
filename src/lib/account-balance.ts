import type { FinanceState } from "./types";

export function getAccountBalance(state: FinanceState, accountId: string) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return 0;
  if (typeof account.balance === "number" && Number.isFinite(account.balance)) return account.balance;

  return state.transactions.reduce((balance, transaction) => {
    if (transaction.type === "income" && transaction.accountId === accountId) return balance + transaction.amount;
    if (transaction.type === "expense" && transaction.accountId === accountId) return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.accountId === accountId) return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.destinationAccountId === accountId) return balance + transaction.amount;
    return balance;
  }, account.initialBalance);
}
