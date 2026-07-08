import { getTransactionDateRange } from "./date-ranges";
import type { FinanceState, HouseholdMember, Transaction, TransactionFilters } from "./types";

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  query: "",
  types: [],
  accountIds: [],
  categoryIds: [],
  memberIds: [],
  datePreset: "month",
  sort: "newest",
};

export function transactionRpcParams(householdId: string, filters: TransactionFilters, limit: number, offset: number) {
  const range = getTransactionDateRange(filters.datePreset, new Date(), filters.dateFrom, filters.dateTo);
  return {
    p_household_id: householdId,
    p_search: filters.query.trim() || null,
    p_types: filters.types.length ? filters.types : null,
    p_account_ids: filters.accountIds.length ? filters.accountIds : null,
    p_category_ids: filters.categoryIds.length ? filters.categoryIds : null,
    p_created_by_ids: filters.memberIds.length ? filters.memberIds : null,
    p_date_from: range.from || null,
    p_date_to: range.to || null,
    p_amount_min: filters.amountMin ?? null,
    p_amount_max: filters.amountMax ?? null,
    p_sort: filters.sort,
    p_limit: limit,
    p_offset: offset,
  };
}

export function mapTransactionRow(row: Record<string, unknown>, members: HouseholdMember[]): Transaction {
  const creatorId = String(row.created_by ?? "");
  const member = members.find((item) => item.id === creatorId);
  return {
    id: String(row.id),
    type: row.type as Transaction["type"],
    amount: Number(row.amount),
    accountId: String(row.account_id),
    destinationAccountId: row.destination_account_id ? String(row.destination_account_id) : undefined,
    categoryId: row.category_id ? String(row.category_id) : undefined,
    note: String(row.note ?? ""),
    date: String(row.transaction_date),
    createdBy: String(row.created_by_name ?? member?.name ?? "Anggota"),
    createdById: creatorId,
    createdByAvatarUrl: member?.avatarUrl,
    createdAt: String(row.created_at),
  };
}

export function filterDemoTransactions(state: FinanceState, members: HouseholdMember[], filters: TransactionFilters) {
  const range = getTransactionDateRange(filters.datePreset, new Date(), filters.dateFrom, filters.dateTo);
  const query = filters.query.trim().toLocaleLowerCase("id-ID");
  const result = state.transactions.filter((item) => {
    const category = state.categories.find((entry) => entry.id === item.categoryId)?.name ?? "transfer";
    const account = state.accounts.find((entry) => entry.id === item.accountId)?.name ?? "";
    const destination = state.accounts.find((entry) => entry.id === item.destinationAccountId)?.name ?? "";
    const searchable = `${item.note} ${category} ${account} ${destination} ${item.createdBy}`.toLocaleLowerCase("id-ID");
    return (!query || searchable.includes(query))
      && (!filters.types.length || filters.types.includes(item.type))
      && (!filters.accountIds.length || filters.accountIds.includes(item.accountId) || Boolean(item.destinationAccountId && filters.accountIds.includes(item.destinationAccountId)))
      && (!filters.categoryIds.length || Boolean(item.categoryId && filters.categoryIds.includes(item.categoryId)))
      && (!filters.memberIds.length || Boolean(item.createdById && filters.memberIds.includes(item.createdById)) || members.some((member) => filters.memberIds.includes(member.id) && member.name === item.createdBy))
      && (!range.from || item.date >= range.from)
      && (!range.to || item.date <= range.to)
      && (filters.amountMin === undefined || item.amount >= filters.amountMin)
      && (filters.amountMax === undefined || item.amount <= filters.amountMax);
  });
  return result.sort((left, right) => {
    if (filters.sort === "amount_desc") return right.amount - left.amount;
    if (filters.sort === "amount_asc") return left.amount - right.amount;
    const comparison = `${left.date}-${left.createdAt}`.localeCompare(`${right.date}-${right.createdAt}`);
    return filters.sort === "oldest" ? comparison : -comparison;
  });
}
