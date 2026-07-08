export type TransactionType = "expense" | "income" | "transfer";
export type ViewId = "dashboard" | "transactions" | "budgets" | "accounts";

export interface Account {
  id: string;
  name: string;
  kind: "bank" | "cash" | "ewallet";
  initialBalance: number;
  color: string;
  lastFour?: string;
  balance?: number;
  transactionCount?: number;
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
  createdById?: string;
  createdByAvatarUrl?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  spent?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  transactionId?: string;
  actorName?: string;
  actorAvatarUrl?: string;
}

export type DashboardPeriod = "week" | "month";

export interface DashboardSummary {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  budgetTotal: number;
  categoryExpenses: { categoryId: string; value: number }[];
  activity: { date: string; expense: number }[];
}

export type TransactionSort = "newest" | "oldest" | "amount_desc" | "amount_asc";
export type TransactionDatePreset = "all" | "today" | "week" | "month" | "last30" | "custom";

export interface TransactionFilters {
  query: string;
  types: TransactionType[];
  accountIds: string[];
  categoryIds: string[];
  memberIds: string[];
  datePreset: TransactionDatePreset;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  sort: TransactionSort;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  hasMore: boolean;
}

export interface HouseholdMember {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface FinanceState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  notifications: AppNotification[];
}
