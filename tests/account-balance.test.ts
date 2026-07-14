import assert from "node:assert/strict";
import test from "node:test";
import { getAccountBalance } from "../src/lib/account-balance";
import type { FinanceState } from "../src/lib/types";

const baseState: FinanceState = {
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  notifications: [],
};

test("account balance prefers backend balance when available", () => {
  const state: FinanceState = {
    ...baseState,
    accounts: [{ id: "bank", name: "Bank", kind: "bank", initialBalance: 1_000_000, balance: 7_500_000, color: "#116149" }],
    transactions: [
      { id: "recent-expense", type: "expense", amount: 500_000, accountId: "bank", categoryId: "food", note: "Recent only", date: "2026-07-14", createdBy: "Owner", createdAt: "2026-07-14T02:00:00.000Z" },
    ],
  };

  assert.equal(getAccountBalance(state, "bank"), 7_500_000);
});

test("account balance falls back to local transactions when backend balance is missing", () => {
  const state: FinanceState = {
    ...baseState,
    accounts: [
      { id: "cash", name: "Cash", kind: "cash", initialBalance: 1_000_000, color: "#8a9a93" },
      { id: "bank", name: "Bank", kind: "bank", initialBalance: 2_000_000, color: "#116149" },
    ],
    transactions: [
      { id: "income", type: "income", amount: 300_000, accountId: "cash", categoryId: "salary", note: "Income", date: "2026-07-14", createdBy: "Owner", createdAt: "2026-07-14T02:00:00.000Z" },
      { id: "expense", type: "expense", amount: 125_000, accountId: "cash", categoryId: "food", note: "Expense", date: "2026-07-14", createdBy: "Owner", createdAt: "2026-07-14T03:00:00.000Z" },
    ],
  };

  assert.equal(getAccountBalance(state, "cash"), 1_175_000);
});

test("account balance fallback moves transfer between source and destination accounts", () => {
  const state: FinanceState = {
    ...baseState,
    accounts: [
      { id: "cash", name: "Cash", kind: "cash", initialBalance: 1_000_000, color: "#8a9a93" },
      { id: "bank", name: "Bank", kind: "bank", initialBalance: 2_000_000, color: "#116149" },
    ],
    transactions: [
      { id: "transfer", type: "transfer", amount: 400_000, accountId: "cash", destinationAccountId: "bank", note: "Transfer", date: "2026-07-14", createdBy: "Owner", createdAt: "2026-07-14T04:00:00.000Z" },
    ],
  };

  assert.equal(getAccountBalance(state, "cash"), 600_000);
  assert.equal(getAccountBalance(state, "bank"), 2_400_000);
});
