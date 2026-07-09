import assert from "node:assert/strict";
import test from "node:test";
import { getBudgetUsage } from "../src/lib/budget-usage";
import type { FinanceState } from "../src/lib/types";

const baseState: FinanceState = {
  accounts: [
    { id: "cash", name: "Tunai", kind: "cash", initialBalance: 1_000_000, color: "#111111" },
  ],
  categories: [
    { id: "health", name: "Kesehatan", type: "expense", color: "#197253", icon: "heart-pulse" },
    { id: "food", name: "Makan", type: "expense", color: "#ef765f", icon: "utensils" },
  ],
  transactions: [
    { id: "doctor", type: "expense", amount: 100_000, accountId: "cash", categoryId: "health", note: "Dokter", date: "2026-07-05", createdBy: "Owner", createdAt: "2026-07-05T02:00:00.000Z" },
    { id: "lunch", type: "expense", amount: 250_000, accountId: "cash", categoryId: "food", note: "Makan siang", date: "2026-07-08", createdBy: "Owner", createdAt: "2026-07-08T02:00:00.000Z" },
    { id: "old-health", type: "expense", amount: 70_000, accountId: "cash", categoryId: "health", note: "Obat bulan lalu", date: "2026-06-28", createdBy: "Owner", createdAt: "2026-06-28T02:00:00.000Z" },
  ],
  budgets: [],
  notifications: [],
};

test("budget usage ignores expenses from categories without a budget", () => {
  const usage = getBudgetUsage({
    ...baseState,
    budgets: [{ id: "health-budget", categoryId: "health", amount: 500_000 }],
  }, "2026-07");

  assert.deepEqual(usage, {
    spent: 100_000,
    total: 500_000,
    percent: 20,
  });
});

test("budget usage starts counting a category after its budget is created", () => {
  const usage = getBudgetUsage({
    ...baseState,
    budgets: [
      { id: "health-budget", categoryId: "health", amount: 500_000 },
      { id: "food-budget", categoryId: "food", amount: 300_000 },
    ],
  }, "2026-07");

  assert.deepEqual(usage, {
    spent: 350_000,
    total: 800_000,
    percent: 44,
  });
});

test("budget usage stays zero when no budget exists", () => {
  assert.deepEqual(getBudgetUsage(baseState, "2026-07"), {
    spent: 0,
    total: 0,
    percent: 0,
  });
});

test("budget usage prefers backend spent values when available", () => {
  const usage = getBudgetUsage({
    ...baseState,
    budgets: [{ id: "health-budget", categoryId: "health", amount: 500_000, spent: 175_000 }],
  }, "2026-07");

  assert.deepEqual(usage, {
    spent: 175_000,
    total: 500_000,
    percent: 35,
  });
});
