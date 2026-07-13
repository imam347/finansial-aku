"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Filter,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { formatDate, formatRupiah } from "@/lib/format";
import { getBudgetUsage } from "@/lib/budget-usage";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_TRANSACTION_FILTERS, filterDemoTransactions, mapTransactionRow, transactionRpcParams } from "@/lib/transaction-query";
import type { Account, FinanceState, HouseholdMember, Transaction, TransactionFilters } from "@/lib/types";
import { CategoryIcon } from "./category-icon";
import { type ImportTransactionRow, TransactionSheetTools } from "./transaction-sheet-tools";
import { UserAvatar } from "./user-avatar";

function createDefaultTransactionFilters(): TransactionFilters {
  return {
    ...DEFAULT_TRANSACTION_FILTERS,
    types: [],
    accountIds: [],
    categoryIds: [],
    memberIds: [],
  };
}

function createAccountTransactionFilters(accountId: string): TransactionFilters {
  return {
    ...createDefaultTransactionFilters(),
    datePreset: "all",
    accountIds: [accountId],
  };
}

export function TransactionsView({ state, householdId, members, refreshToken, accountFilterRequest, onRefresh, onToast, onImport, onAdd, onEdit, onDelete }: {
  state: FinanceState;
  householdId?: string;
  members: HouseholdMember[];
  refreshToken: number;
  accountFilterRequest?: { accountId: string; token: number };
  onRefresh: () => void | Promise<void>;
  onToast: (message: string) => void;
  onImport: (rows: ImportTransactionRow[]) => Promise<{ inserted: number; duplicates: number; errors: { row: number; message: string }[] }>;
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const initialFilters = accountFilterRequest ? createAccountTransactionFilters(accountFilterRequest.accountId) : createDefaultTransactionFilters();
  const [filters, setFilters] = useState<TransactionFilters>(() => initialFilters);
  const [debouncedQuery, setDebouncedQuery] = useState(() => initialFilters.query);
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(accountFilterRequest));
  const [openMenu, setOpenMenu] = useState<string>();
  const requestId = useRef(0);
  const appliedAccountFilterToken = useRef(accountFilterRequest?.token ?? 0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(filters.query), 300);
    return () => window.clearTimeout(timer);
  }, [filters.query]);

  const appliedFilters = useMemo<TransactionFilters>(() => ({
    query: debouncedQuery,
    types: filters.types,
    accountIds: filters.accountIds,
    categoryIds: filters.categoryIds,
    memberIds: filters.memberIds,
    datePreset: filters.datePreset,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    amountMin: filters.amountMin,
    amountMax: filters.amountMax,
    sort: filters.sort,
  }), [debouncedQuery, filters.types, filters.accountIds, filters.categoryIds, filters.memberIds, filters.datePreset, filters.dateFrom, filters.dateTo, filters.amountMin, filters.amountMax, filters.sort]);

  const fetchPage = async (offset = 0, replace = true, overrideFilters = appliedFilters, limit = 50) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      let page: Transaction[];
      let count: number;
      if (householdId) {
        const { data, error } = await createSupabaseClient().rpc("list_transactions", transactionRpcParams(householdId, overrideFilters, limit, offset));
        if (error) throw error;
        const rows = (data ?? []) as Record<string, unknown>[];
        page = rows.map((row) => mapTransactionRow(row, members));
        count = Number(rows[0]?.total_count ?? 0);
      } else {
        const filtered = filterDemoTransactions(state, members, overrideFilters);
        page = filtered.slice(offset, offset + limit);
        count = filtered.length;
      }
      if (currentRequest !== requestId.current) return [];
      setItems((current) => replace ? page : [...current, ...page]);
      setTotal(count);
      return page;
    } catch (error) {
      if (currentRequest === requestId.current) onToast(error instanceof Error ? error.message : "Gagal memuat transaksi");
      return [];
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchPage(), 0);
    return () => window.clearTimeout(timer);
  }, [appliedFilters, householdId, refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilters = (patch: Partial<TransactionFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const activeFilterCount = filters.accountIds.length + filters.categoryIds.length + filters.memberIds.length + filters.types.length + (filters.amountMin !== undefined ? 1 : 0) + (filters.amountMax !== undefined ? 1 : 0) + (filters.datePreset !== "month" ? 1 : 0);
  const filterPanelId = "transaction-advanced-filters";

  useEffect(() => {
    if (!accountFilterRequest || appliedAccountFilterToken.current === accountFilterRequest.token) return;
    appliedAccountFilterToken.current = accountFilterRequest.token;
    const timer = window.setTimeout(() => {
      const nextFilters = createAccountTransactionFilters(accountFilterRequest.accountId);
      setFilters(nextFilters);
      setDebouncedQuery(nextFilters.query);
      setFiltersOpen(true);
      setOpenMenu(undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountFilterRequest]);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const lockBodyScroll = window.matchMedia("(max-width: 760px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (lockBodyScroll) document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (lockBodyScroll) document.body.style.overflow = previousOverflow;
    };
  }, [filtersOpen]);

  const getExportRows = async () => {
    if (total > 20_000) throw new Error("Hasil melebihi 20.000 baris. Persempit filter sebelum mengekspor.");
    if (!householdId) return filterDemoTransactions(state, members, appliedFilters).slice(0, 20_000);
    const exported: Transaction[] = [];
    for (let offset = 0; offset < Math.min(total, 20_000); offset += 500) {
      const { data, error } = await createSupabaseClient().rpc("list_transactions", transactionRpcParams(householdId, appliedFilters, 500, offset));
      if (error) throw error;
      exported.push(...((data ?? []) as Record<string, unknown>[]).map((row) => mapTransactionRow(row, members)));
    }
    return exported;
  };

  const findDuplicateReferences = async (references: string[]) => {
    if (!householdId) {
      const stored = JSON.parse(window.localStorage.getItem("finansial-import-references") ?? "[]") as string[];
      return new Set(references.filter((reference) => stored.includes(reference)));
    }
    const found = new Set<string>();
    for (let index = 0; index < references.length; index += 100) {
      const { data, error } = await createSupabaseClient().from("transactions").select("source_reference").eq("household_id", householdId).eq("source", "excel").in("source_reference", references.slice(index, index + 100));
      if (error) throw error;
      for (const row of data ?? []) if (row.source_reference) found.add(row.source_reference);
    }
    return found;
  };

  return (
    <div className="page detail-page">
      <section className="toolbar-card">
        <label><Search size={18} /><input value={filters.query} onChange={(event) => updateFilters({ query: event.target.value })} placeholder="Cari catatan, akun, kategori, atau anggota..." /></label>
        <div className="filter-tabs">
          {(["all", "expense", "income", "transfer"] as const).map((value) => <button key={value} className={(value === "all" ? !filters.types.length : filters.types[0] === value) ? "active" : ""} onClick={() => updateFilters({ types: value === "all" ? [] : [value] })}>{value === "all" ? "Semua" : value === "expense" ? "Pengeluaran" : value === "income" ? "Pemasukan" : "Transfer"}</button>)}
        </div>
        <button type="button" className="secondary-button filter-button" aria-controls={filterPanelId} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><Filter size={17} /> Filter{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
        <button className="primary-button" onClick={onAdd}><Plus size={18} /> Tambah</button>
      </section>
      {filtersOpen && <div className="transaction-filter-layer"><button type="button" className="transaction-filter-backdrop" onClick={() => setFiltersOpen(false)} aria-label="Tutup filter transaksi" /><section id={filterPanelId} className="panel advanced-filters" aria-label="Filter transaksi"><div className="advanced-filter-heading"><strong>Filter transaksi</strong><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Tutup filter"><X size={18} /></button></div><div className="advanced-filter-grid">
        <label><span>Periode</span><select value={filters.datePreset} onChange={(event) => updateFilters({ datePreset: event.target.value as TransactionFilters["datePreset"] })}><option value="all">Semua tanggal</option><option value="today">Hari ini</option><option value="week">Minggu ini</option><option value="month">Bulan ini</option><option value="last30">30 hari terakhir</option><option value="custom">Rentang khusus</option></select></label>
        {filters.datePreset === "custom" && <><label><span>Dari</span><input type="date" value={filters.dateFrom ?? ""} onChange={(event) => updateFilters({ dateFrom: event.target.value || undefined })} /></label><label><span>Sampai</span><input type="date" value={filters.dateTo ?? ""} onChange={(event) => updateFilters({ dateTo: event.target.value || undefined })} /></label></>}
        <label><span>Akun</span><select value={filters.accountIds[0] ?? ""} onChange={(event) => updateFilters({ accountIds: event.target.value ? [event.target.value] : [] })}><option value="">Semua akun</option>{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label><span>Kategori</span><select value={filters.categoryIds[0] ?? ""} onChange={(event) => updateFilters({ categoryIds: event.target.value ? [event.target.value] : [] })}><option value="">Semua kategori</option>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label><span>Anggota</span><select value={filters.memberIds[0] ?? ""} onChange={(event) => updateFilters({ memberIds: event.target.value ? [event.target.value] : [] })}><option value="">Semua anggota</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label><span>Nominal minimum</span><input inputMode="numeric" value={filters.amountMin ?? ""} onChange={(event) => updateFilters({ amountMin: event.target.value ? Number(event.target.value.replace(/\D/g, "")) : undefined })} placeholder="0" /></label>
        <label><span>Nominal maksimum</span><input inputMode="numeric" value={filters.amountMax ?? ""} onChange={(event) => updateFilters({ amountMax: event.target.value ? Number(event.target.value.replace(/\D/g, "")) : undefined })} placeholder="Tanpa batas" /></label>
        <label><span>Urutan</span><select value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value as TransactionFilters["sort"] })}><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="amount_desc">Nominal terbesar</option><option value="amount_asc">Nominal terkecil</option></select></label>
      </div><button type="button" className="text-link reset-filter" onClick={() => setFilters(createDefaultTransactionFilters())}>Reset semua filter</button></section></div>}

      <TransactionSheetTools accounts={state.accounts} categories={state.categories} getExportRows={getExportRows} findDuplicateReferences={findDuplicateReferences} onImport={async (rows) => { const result = await onImport(rows); await onRefresh(); return result; }} onToast={onToast} />

      <section className="panel full-list-panel">
        <div className="list-summary"><div><strong>{total} transaksi</strong><span>sesuai filter</span></div><button type="button" onClick={() => updateFilters({ sort: filters.sort === "newest" ? "oldest" : "newest" })}><span>{filters.sort === "newest" ? "Terbaru" : filters.sort === "oldest" ? "Terlama" : filters.sort === "amount_desc" ? "Nominal terbesar" : "Nominal terkecil"}</span><ChevronDown size={16} /></button></div>
        <div className="transaction-list">
          {items.map((item) => {
            const category = state.categories.find((entry) => entry.id === item.categoryId);
            const account = state.accounts.find((entry) => entry.id === item.accountId);
            const typeIcon = item.type === "income" ? <ArrowDownLeft /> : item.type === "expense" ? <ArrowUpRight /> : <ArrowRightLeft />;
            return (
              <div className="transaction-row large" key={item.id}>
                <span className="category-symbol" style={{ color: category?.color ?? "#66756f", background: `${category?.color ?? "#66756f"}18` }}>{category ? <CategoryIcon name={category.icon} size={20} /> : typeIcon}</span>
                <div className="transaction-main"><strong>{item.note || category?.name || "Transfer antar akun"}</strong><small>{category?.name ?? "Transfer"} · {account?.name}</small></div>
                <div className="transaction-person"><UserAvatar name={item.createdBy} src={item.createdByAvatarUrl} className="mini-avatar" /><small>{item.createdBy}</small></div>
                <div className="transaction-value"><strong className={item.type}>{item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}{formatRupiah(item.amount)}</strong><small>{formatDate(item.date, true)}</small></div>
                <div className="row-menu">
                  <button aria-label="Menu transaksi" onClick={() => setOpenMenu(openMenu === item.id ? undefined : item.id)}><MoreHorizontal size={20} /></button>
                  {openMenu === item.id && <div><button onClick={() => { onEdit(item); setOpenMenu(undefined); }}><Pencil size={15} /> Edit</button><button className="danger" onClick={() => { onDelete(item.id); setOpenMenu(undefined); }}><Trash2 size={15} /> Hapus</button></div>}
                </div>
              </div>
            );
          })}
          {!items.length && !loading && <div className="empty-state"><Search size={28} /><h3>Transaksi tidak ditemukan</h3><p>Coba kata kunci atau filter yang berbeda.</p></div>}
          {loading && <div className="list-loading">Memuat transaksi...</div>}
          {items.length < total && <button type="button" className="load-more" disabled={loading} onClick={() => void fetchPage(items.length, false)}>Muat lagi</button>}
        </div>
      </section>
    </div>
  );
}

export function BudgetsView({ state, setState, onBudgetUpdate, onBudgetDelete, onAdd }: { state: FinanceState; setState: Dispatch<SetStateAction<FinanceState>>; onBudgetUpdate?: (id: string, amount: number) => void | Promise<void>; onBudgetDelete: (id: string) => void | Promise<void>; onAdd: () => void }) {
  const [editingId, setEditingId] = useState<string>();
  const [value, setValue] = useState("");
  const currentMonth = new Date().toISOString().slice(0, 7);
  const expenses = state.transactions.filter((item) => item.type === "expense" && item.date.startsWith(currentMonth));
  const budgetUsage = getBudgetUsage(state, currentMonth);
  const spent = budgetUsage.spent;
  const limit = budgetUsage.total;

  const saveBudget = (id: string) => {
    const amount = Number(value.replace(/\D/g, ""));
    if (!amount) return;
    if (onBudgetUpdate) void onBudgetUpdate(id, amount);
    else setState((current) => ({ ...current, budgets: current.budgets.map((budget) => budget.id === id ? { ...budget, amount } : budget) }));
    setEditingId(undefined);
  };

  return (
    <div className="page detail-page budget-page">
      <section className="budget-hero">
        <div><p>TOTAL ANGGARAN JULI</p><h2>{formatRupiah(limit)}</h2><span>{formatRupiah(spent)} sudah digunakan</span></div>
        <div className="budget-ring" style={{ "--percent": `${budgetUsage.percent * 3.6}deg` } as React.CSSProperties}><div><strong>{budgetUsage.percent}%</strong><small>terpakai</small></div></div>
      </section>
      <div className="section-title"><div><p>PER KATEGORI</p><h2>Jaga pengeluaran tetap sehat</h2></div><button className="secondary-button" onClick={onAdd}><Plus size={17} /> Anggaran</button></div>
      <section className="budget-grid">
        {state.budgets.map((budget) => {
          const category = state.categories.find((item) => item.id === budget.categoryId)!;
          const categorySpent = budget.spent ?? expenses.filter((item) => item.categoryId === budget.categoryId).reduce((sum, item) => sum + item.amount, 0);
          const percent = Math.round(categorySpent / budget.amount * 100);
          return (
            <article className="budget-card" key={budget.id}>
              <div className="budget-card-top"><span style={{ color: category.color, background: `${category.color}18` }}><CategoryIcon name={category.icon} size={21} /></span><div className="budget-actions"><button aria-label={`Edit anggaran ${category.name}`} onClick={() => { setEditingId(editingId === budget.id ? undefined : budget.id); setValue(String(budget.amount)); }}><Pencil size={16} /></button><button className="danger" aria-label={`Hapus anggaran ${category.name}`} onClick={() => { if (window.confirm(`Hapus anggaran ${category.name}?`)) void onBudgetDelete(budget.id); }}><Trash2 size={16} /></button></div></div>
              <h3>{category.name}</h3>
              <div className="budget-numbers"><strong>{formatRupiah(categorySpent)}</strong><span>dari {formatRupiah(budget.amount)}</span></div>
              <div className={`progress ${percent >= 80 ? "warning" : ""}`}><i style={{ width: `${Math.min(100, percent)}%`, background: category.color }} /></div>
              <small><strong>{percent}%</strong> terpakai · tersisa {formatRupiah(Math.max(0, budget.amount - categorySpent))}</small>
              {editingId === budget.id && <div className="inline-edit"><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" /><button onClick={() => saveBudget(budget.id)}>Simpan</button></div>}
            </article>
          );
        })}
      </section>
    </div>
  );
}

const accountIcon = (account: Account) => account.kind === "bank" ? Landmark : account.kind === "ewallet" ? Smartphone : Wallet;

export function AccountsView({ state, onAdd, onDetail, onEdit }: { state: FinanceState; onAdd: () => void; onDetail: (account: Account, balance: number, transactions: number) => void; onEdit: (account: Account) => void }) {
  const [openMenu, setOpenMenu] = useState<string>();
  const accounts = useMemo(() => state.accounts.map((account) => {
    const movement = state.transactions.reduce((sum, item) => {
      if (item.type === "income" && item.accountId === account.id) return sum + item.amount;
      if (item.type === "expense" && item.accountId === account.id) return sum - item.amount;
      if (item.type === "transfer" && item.accountId === account.id) return sum - item.amount;
      if (item.type === "transfer" && item.destinationAccountId === account.id) return sum + item.amount;
      return sum;
    }, 0);
    return { ...account, balance: account.balance ?? account.initialBalance + movement };
  }), [state.accounts, state.transactions]);
  const total = accounts.reduce((sum, item) => sum + item.balance, 0);

  return (
    <div className="page detail-page accounts-page">
      <section className="accounts-summary"><div><span><Building2 size={21} /></span><div><p>Total aset likuid</p><h2>{formatRupiah(total)}</h2></div></div><button className="primary-button" onClick={onAdd}><Plus size={18} /> Tambah akun</button></section>
      <div className="section-title"><div><p>AKUN TERHUBUNG</p><h2>Semua sumber dana</h2></div><span>{accounts.length} akun aktif</span></div>
      <section className="accounts-grid">
        {accounts.map((account) => {
          const Icon = accountIcon(account);
          const count = account.transactionCount ?? state.transactions.filter((item) => item.accountId === account.id || item.destinationAccountId === account.id).length;
          return (
            <article className="account-card" key={account.id} style={{ "--account-color": account.color } as React.CSSProperties}>
              <div className="account-accent" /><div className="account-top"><span><Icon size={22} /></span><div className="row-menu account-menu"><button aria-label={`Menu akun ${account.name}`} onClick={() => setOpenMenu(openMenu === account.id ? undefined : account.id)}><MoreHorizontal size={20} /></button>{openMenu === account.id && <div><button onClick={() => { onDetail(account, account.balance, count); setOpenMenu(undefined); }}><ArrowUpRight size={15} /> Detail</button><button onClick={() => { onEdit(account); setOpenMenu(undefined); }}><Pencil size={15} /> Edit</button></div>}</div></div>
              <p>{account.kind === "bank" ? "REKENING BANK" : account.kind === "ewallet" ? "DOMPET DIGITAL" : "TUNAI"}</p>
              <h3>{account.name} {account.lastFour && <small>•• {account.lastFour}</small>}</h3>
              <strong>{formatRupiah(account.balance)}</strong>
              <div className="account-foot"><span>{count} transaksi tercatat</span><button onClick={() => onDetail(account, account.balance, count)}>Detail <ArrowUpRight size={14} /></button></div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
