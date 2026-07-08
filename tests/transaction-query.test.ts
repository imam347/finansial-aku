import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TRANSACTION_FILTERS, filterDemoTransactions } from "../src/lib/transaction-query";
import type { FinanceState, HouseholdMember, TransactionFilters } from "../src/lib/types";

const members: HouseholdMember[] = [
  { id: "owner", name: "Owner" },
  { id: "partner", name: "Partner" },
];

const state: FinanceState = {
  accounts: [
    { id: "bca", name: "BCA Utama", kind: "bank", initialBalance: 1_000_000, color: "#111111" },
    { id: "gopay", name: "GoPay", kind: "ewallet", initialBalance: 100_000, color: "#222222" },
    { id: "jago", name: "Jago", kind: "bank", initialBalance: 500_000, color: "#333333" },
  ],
  categories: [
    { id: "food", name: "Makan", type: "expense", color: "#aaaaaa", icon: "utensils" },
    { id: "transport", name: "Transport", type: "expense", color: "#bbbbbb", icon: "car" },
    { id: "salary", name: "Gaji", type: "income", color: "#cccccc", icon: "briefcase" },
  ],
  transactions: [
    {
      id: "coffee",
      type: "expense",
      amount: 25_000,
      accountId: "gopay",
      categoryId: "food",
      note: "Kopi pagi",
      date: "2026-07-04",
      createdBy: "Owner",
      createdById: "owner",
      createdAt: "2026-07-04T02:00:00.000Z",
    },
    {
      id: "rent",
      type: "expense",
      amount: 1_500_000,
      accountId: "bca",
      categoryId: "transport",
      note: "Sewa mobil",
      date: "2026-07-07",
      createdBy: "Partner",
      createdById: "partner",
      createdAt: "2026-07-07T02:00:00.000Z",
    },
    {
      id: "payday",
      type: "income",
      amount: 7_500_000,
      accountId: "bca",
      categoryId: "salary",
      note: "Gaji Juli",
      date: "2026-07-01",
      createdBy: "Owner",
      createdById: "owner",
      createdAt: "2026-07-01T02:00:00.000Z",
    },
    {
      id: "move",
      type: "transfer",
      amount: 300_000,
      accountId: "bca",
      destinationAccountId: "jago",
      note: "Pindah tabungan",
      date: "2026-07-08",
      createdBy: "Owner",
      createdById: "owner",
      createdAt: "2026-07-08T02:00:00.000Z",
    },
  ],
  budgets: [],
  notifications: [],
};

function withFilters(overrides: Partial<TransactionFilters>): TransactionFilters {
  return {
    ...DEFAULT_TRANSACTION_FILTERS,
    datePreset: "custom",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    ...overrides,
  };
}

test("demo transaction filtering applies common filters and search", () => {
  const result = filterDemoTransactions(state, members, withFilters({
    query: "kopi",
    types: ["expense"],
    accountIds: ["gopay"],
    categoryIds: ["food"],
    memberIds: ["owner"],
    amountMin: 10_000,
    amountMax: 50_000,
  }));

  assert.deepEqual(result.map((item) => item.id), ["coffee"]);
});

test("demo transaction filtering includes destination accounts and amount sorting", () => {
  const result = filterDemoTransactions(state, members, withFilters({
    accountIds: ["jago"],
    sort: "amount_desc",
  }));

  assert.deepEqual(result.map((item) => item.id), ["move"]);
});

test("demo transaction filtering sorts newest and oldest deterministically", () => {
  assert.deepEqual(
    filterDemoTransactions(state, members, withFilters({ sort: "newest" })).map((item) => item.id),
    ["move", "rent", "coffee", "payday"],
  );
  assert.deepEqual(
    filterDemoTransactions(state, members, withFilters({ sort: "oldest" })).map((item) => item.id),
    ["payday", "coffee", "rent", "move"],
  );
});
