"use client";

import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Wallet,
} from "lucide-react";
import { formatDate, formatRupiah } from "@/lib/format";
import type { Account, FinanceState, Transaction } from "@/lib/types";
import { CategoryIcon } from "./category-icon";

export function TransactionsView({ state, onAdd, onEdit, onDelete }: {
  state: FinanceState;
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "expense" | "income" | "transfer">("all");
  const [openMenu, setOpenMenu] = useState<string>();
  const filtered = state.transactions.filter((item) => {
    const category = state.categories.find((entry) => entry.id === item.categoryId)?.name ?? "transfer";
    return (filter === "all" || item.type === filter) && `${item.note} ${category}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="page detail-page">
      <section className="toolbar-card">
        <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari catatan atau kategori..." /></label>
        <div className="filter-tabs">
          {(["all", "expense", "income", "transfer"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Semua" : value === "expense" ? "Pengeluaran" : value === "income" ? "Pemasukan" : "Transfer"}</button>)}
        </div>
        <button className="primary-button" onClick={onAdd}><Plus size={18} /> Tambah</button>
      </section>

      <section className="panel full-list-panel">
        <div className="list-summary"><div><strong>{filtered.length} transaksi</strong><span>Bulan ini</span></div><button><span>Terbaru</span><ChevronDown size={16} /></button></div>
        <div className="transaction-list">
          {filtered.map((item) => {
            const category = state.categories.find((entry) => entry.id === item.categoryId);
            const account = state.accounts.find((entry) => entry.id === item.accountId);
            const typeIcon = item.type === "income" ? <ArrowDownLeft /> : item.type === "expense" ? <ArrowUpRight /> : <ArrowRightLeft />;
            return (
              <div className="transaction-row large" key={item.id}>
                <span className="category-symbol" style={{ color: category?.color ?? "#66756f", background: `${category?.color ?? "#66756f"}18` }}>{category ? <CategoryIcon name={category.icon} size={20} /> : typeIcon}</span>
                <div className="transaction-main"><strong>{item.note || category?.name || "Transfer antar akun"}</strong><small>{category?.name ?? "Transfer"} · {account?.name}</small></div>
                <div className="transaction-person"><span className={`mini-avatar ${item.createdBy.toLowerCase()}`}>{item.createdBy.slice(0, 2).toUpperCase()}</span><small>{item.createdBy}</small></div>
                <div className="transaction-value"><strong className={item.type}>{item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}{formatRupiah(item.amount)}</strong><small>{formatDate(item.date, true)}</small></div>
                <div className="row-menu">
                  <button aria-label="Menu transaksi" onClick={() => setOpenMenu(openMenu === item.id ? undefined : item.id)}><MoreHorizontal size={20} /></button>
                  {openMenu === item.id && <div><button onClick={() => { onEdit(item); setOpenMenu(undefined); }}><Pencil size={15} /> Edit</button><button className="danger" onClick={() => { onDelete(item.id); setOpenMenu(undefined); }}><Trash2 size={15} /> Hapus</button></div>}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="empty-state"><Search size={28} /><h3>Transaksi tidak ditemukan</h3><p>Coba kata kunci atau filter yang berbeda.</p></div>}
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
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const limit = state.budgets.reduce((sum, item) => sum + item.amount, 0);

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
        <div className="budget-ring" style={{ "--percent": `${Math.min(100, Math.round(spent / Math.max(limit, 1) * 100)) * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(spent / Math.max(limit, 1) * 100)}%</strong><small>terpakai</small></div></div>
      </section>
      <div className="section-title"><div><p>PER KATEGORI</p><h2>Jaga pengeluaran tetap sehat</h2></div><button className="secondary-button" onClick={onAdd}><Plus size={17} /> Anggaran</button></div>
      <section className="budget-grid">
        {state.budgets.map((budget) => {
          const category = state.categories.find((item) => item.id === budget.categoryId)!;
          const categorySpent = expenses.filter((item) => item.categoryId === budget.categoryId).reduce((sum, item) => sum + item.amount, 0);
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
    return { ...account, balance: account.initialBalance + movement };
  }), [state.accounts, state.transactions]);
  const total = accounts.reduce((sum, item) => sum + item.balance, 0);

  return (
    <div className="page detail-page accounts-page">
      <section className="accounts-summary"><div><span><Building2 size={21} /></span><div><p>Total aset likuid</p><h2>{formatRupiah(total)}</h2></div></div><button className="primary-button" onClick={onAdd}><Plus size={18} /> Tambah akun</button></section>
      <div className="section-title"><div><p>AKUN TERHUBUNG</p><h2>Semua sumber dana</h2></div><span>{accounts.length} akun aktif</span></div>
      <section className="accounts-grid">
        {accounts.map((account) => {
          const Icon = accountIcon(account);
          const count = state.transactions.filter((item) => item.accountId === account.id || item.destinationAccountId === account.id).length;
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
