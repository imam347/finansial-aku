import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardActivity, getDashboardCategoryExpenses } from "../src/lib/dashboard-aggregation";
import type { FinanceState } from "../src/lib/types";

const state: FinanceState = {
  accounts: [{ id: "cash", name: "Tunai", kind: "cash", initialBalance: 1_000_000, color: "#111111" }],
  categories: [
    { id: "food", name: "Makan", type: "expense", color: "#ef765f", icon: "utensils" },
    { id: "salary", name: "Gaji", type: "income", color: "#197253", icon: "briefcase" },
  ],
  transactions: [
    { id: "lunch", type: "expense", amount: 120_000, accountId: "cash", categoryId: "food", note: "Makan siang", date: "2026-07-10", createdBy: "Owner", createdAt: "2026-07-10T02:00:00.000Z" },
    { id: "transfer", type: "transfer", amount: 300_000, accountId: "cash", destinationAccountId: "cash", categoryId: "food", note: "Transfer", date: "2026-07-10", createdBy: "Owner", createdAt: "2026-07-10T03:00:00.000Z" },
    { id: "old-food", type: "expense", amount: 50_000, accountId: "cash", categoryId: "food", note: "Bulan lalu", date: "2026-06-30", createdBy: "Owner", createdAt: "2026-06-30T02:00:00.000Z" },
  ],
  budgets: [],
  notifications: [],
};

test("dashboard category expenses ignore transfers", () => {
  assert.deepEqual(getDashboardCategoryExpenses(state, "2026-07").map((item) => ({ id: item.id, value: item.value })), [
    { id: "food", value: 120_000 },
  ]);
});

test("dashboard activity ignores transfers and fills empty days", () => {
  assert.deepEqual(getDashboardActivity(state, { from: "2026-07-09", to: "2026-07-11" }), [
    { date: "2026-07-09", expense: 0 },
    { date: "2026-07-10", expense: 120_000 },
    { date: "2026-07-11", expense: 0 },
  ]);
});

test("dashboard category expenses add untracked expense totals as lainnya", () => {
  const stateWithMissingCategory = {
    ...state,
    transactions: [
      ...state.transactions,
      { id: "deleted-category", type: "expense" as const, amount: 80_000, accountId: "cash", categoryId: "deleted", note: "Kategori lama", date: "2026-07-11", createdBy: "Owner", createdAt: "2026-07-11T02:00:00.000Z" },
    ],
  };
  assert.deepEqual(getDashboardCategoryExpenses(stateWithMissingCategory, "2026-07", undefined, 200_000).map((item) => ({ id: item.id, value: item.value })), [
    { id: "food", value: 120_000 },
    { id: "__other_expense", value: 80_000 },
  ]);
});

test("dashboard category expenses keep category values instead of proportional scaling", () => {
  assert.deepEqual(getDashboardCategoryExpenses(state, "2026-07", [{ categoryId: "food", value: 420_000 }], 120_000).map((item) => ({ id: item.id, value: item.value })), [
    { id: "food", value: 420_000 },
  ]);
});
