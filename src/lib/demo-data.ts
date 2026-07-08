import { dateKey } from "./format";
import type { FinanceState, Transaction, TransactionType } from "./types";

const relativeDate = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return dateKey(date);
};

const transaction = (
  id: string,
  type: TransactionType,
  amount: number,
  accountId: string,
  categoryId: string | undefined,
  note: string,
  daysAgo: number,
  createdBy: string,
  destinationAccountId?: string,
): Transaction => ({
  id,
  type,
  amount,
  accountId,
  destinationAccountId,
  categoryId,
  note,
  date: relativeDate(daysAgo),
  createdBy,
  createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
});

export const createDemoState = (): FinanceState => ({
  accounts: [
    { id: "bca", name: "BCA Utama", kind: "bank", initialBalance: 9_550_000, color: "#116149", lastFour: "2841" },
    { id: "jago", name: "Jago Bersama", kind: "bank", initialBalance: 4_200_000, color: "#e97856", lastFour: "0918" },
    { id: "gopay", name: "GoPay", kind: "ewallet", initialBalance: 380_000, color: "#4c82f7" },
    { id: "cash", name: "Uang Tunai", kind: "cash", initialBalance: 650_000, color: "#a879e1" },
  ],
  categories: [
    { id: "food", name: "Makan & minum", type: "expense", color: "#ef765f", icon: "utensils" },
    { id: "transport", name: "Transportasi", type: "expense", color: "#4c82f7", icon: "car" },
    { id: "shopping", name: "Belanja", type: "expense", color: "#a879e1", icon: "shopping" },
    { id: "home", name: "Rumah tangga", type: "expense", color: "#e5a63b", icon: "home" },
    { id: "health", name: "Kesehatan", type: "expense", color: "#49a784", icon: "heart" },
    { id: "entertainment", name: "Hiburan", type: "expense", color: "#de6d9e", icon: "sparkles" },
    { id: "salary", name: "Gaji", type: "income", color: "#178461", icon: "wallet" },
    { id: "bonus", name: "Bonus & lainnya", type: "income", color: "#43a87f", icon: "gift" },
  ],
  transactions: [
    transaction("t1", "expense", 186_500, "gopay", "food", "Makan malam Sushi Hiro", 0, "Alya"),
    transaction("t2", "expense", 68_000, "bca", "transport", "Bensin", 1, "Imam"),
    transaction("t3", "expense", 412_900, "jago", "shopping", "Belanja bulanan", 2, "Alya"),
    transaction("t4", "income", 12_500_000, "bca", "salary", "Gaji bulan ini", 4, "Imam"),
    transaction("t5", "expense", 250_000, "bca", "home", "Token listrik", 5, "Imam"),
    transaction("t6", "expense", 145_000, "jago", "health", "Vitamin & obat", 7, "Alya"),
    transaction("t7", "expense", 89_000, "gopay", "entertainment", "Nonton bioskop", 8, "Imam"),
    transaction("t8", "expense", 223_400, "jago", "food", "Dinner anniversary", 10, "Alya"),
    transaction("t9", "income", 1_750_000, "jago", "bonus", "Freelance desain", 11, "Alya"),
    transaction("t10", "transfer", 1_000_000, "bca", undefined, "Isi rekening bersama", 12, "Imam", "jago"),
  ],
  budgets: [
    { id: "b1", categoryId: "food", amount: 1_500_000 },
    { id: "b2", categoryId: "transport", amount: 800_000 },
    { id: "b3", categoryId: "shopping", amount: 1_200_000 },
    { id: "b4", categoryId: "home", amount: 1_000_000 },
    { id: "b5", categoryId: "entertainment", amount: 500_000 },
  ],
  notifications: [
    { id: "n1", title: "Pengeluaran baru dari Alya", body: "Rp186.500 · Makan & minum", time: "Baru saja", read: false, transactionId: "t1" },
    { id: "n2", title: "Pengeluaran baru dari Alya", body: "Rp412.900 · Belanja", time: "2 hari lalu", read: false, transactionId: "t3" },
    { id: "n3", title: "Pemasukan baru dari Alya", body: "Rp1.750.000 · Bonus & lainnya", time: "11 hari lalu", read: true, transactionId: "t9" },
  ],
});
