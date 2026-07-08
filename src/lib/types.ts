export type TransactionType = "expense" | "income" | "transfer";
export type ViewId = "dashboard" | "transactions" | "budgets" | "accounts";

export interface Account {
  id: string;
  name: string;
  kind: "bank" | "cash" | "ewallet";
  initialBalance: number;
  color: string;
  lastFour?: string;
}

export interface Category {
  id: string;
  name: string;
  type: "expense" | "income";
  color: string;
  icon: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  note: string;
  date: string;
  createdBy: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  transactionId?: string;
}

export interface FinanceState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  notifications: AppNotification[];
}
