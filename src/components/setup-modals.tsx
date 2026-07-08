"use client";

import { FormEvent, useState } from "react";
import { Check, Pencil, ReceiptText, X } from "lucide-react";
import type { Account, Budget, FinanceState } from "@/lib/types";
import { formatRupiah } from "@/lib/format";
import { CategoryIcon } from "./category-icon";

const colors = ["#116149", "#4C82F7", "#A879E1", "#EF765F", "#E5A63B"];

export function AccountModal({ account, onSave, onClose }: { account?: Account; onSave: (account: Account) => void | Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(account?.kind ?? "bank");
  const [balance, setBalance] = useState(account ? String(account.initialBalance) : "");
  const [lastFour, setLastFour] = useState(account?.lastFour ?? "");
  const [color, setColor] = useState(account?.color ?? colors[0]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({ id: account?.id ?? crypto.randomUUID(), name: name.trim(), kind, initialBalance: Number(balance.replace(/\D/g, "")), color, lastFour: kind === "cash" ? undefined : lastFour || undefined });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="transaction-modal setup-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="account-form-title">
    <div className="modal-heading"><div><p>SUMBER DANA</p><h2 id="account-form-title">{account ? "Edit akun" : "Tambah akun baru"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><X size={21} /></button></div>
    <div className="type-tabs account-types">{(["bank", "ewallet", "cash"] as const).map((value) => <button type="button" className={kind === value ? "active transfer" : ""} key={value} onClick={() => setKind(value)}>{value === "bank" ? "Rekening bank" : value === "ewallet" ? "E-wallet" : "Uang tunai"}</button>)}</div>
    <label className="full-field"><span>Nama akun</span><input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: BCA Utama" /></label>
    <label className="full-field"><span>Saldo awal</span><input required inputMode="numeric" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0" /></label>
    {kind !== "cash" && <label className="full-field"><span>4 digit terakhir <small>(opsional)</small></span><input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Contoh: 2841" /></label>}
    <fieldset className="color-picker"><legend>Warna akun</legend><div>{colors.map((item) => <button type="button" key={item} style={{ background: item }} className={color === item ? "active" : ""} onClick={() => setColor(item)}>{color === item && <Check size={14} />}</button>)}</div></fieldset>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button"><Check size={18} /> {account ? "Simpan perubahan" : "Simpan akun"}</button></div>
  </form></div>;
}

export function AccountDetailsModal({ account, balance, transactions, onEdit, onShowTransactions, onClose }: { account: Account; balance: number; transactions: number; onEdit: () => void; onShowTransactions: () => void; onClose: () => void }) {
  const kindLabel = account.kind === "bank" ? "Rekening bank" : account.kind === "ewallet" ? "Dompet digital" : "Uang tunai";
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="transaction-modal setup-modal account-detail-modal" role="dialog" aria-modal="true" aria-labelledby="account-detail-title">
    <div className="modal-heading"><div><p>DETAIL AKUN</p><h2 id="account-detail-title">{account.name}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><X size={21} /></button></div>
    <div className="account-detail-hero" style={{ "--account-color": account.color } as React.CSSProperties}><span>{kindLabel}</span><strong>{formatRupiah(balance)}</strong>{account.lastFour && <small>Nomor akun •••• {account.lastFour}</small>}</div>
    <dl className="account-detail-list"><div><dt>Saldo awal</dt><dd>{formatRupiah(account.initialBalance)}</dd></div><div><dt>Aktivitas tercatat</dt><dd><button type="button" className="account-activity-link" onClick={onShowTransactions}>{transactions} transaksi</button></dd></div><div><dt>Jenis akun</dt><dd>{kindLabel}</dd></div></dl>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Tutup</button><button type="button" className="secondary-button" onClick={onShowTransactions}><ReceiptText size={17} /> Lihat transaksi</button><button type="button" className="primary-button" onClick={onEdit}><Pencil size={17} /> Edit akun</button></div>
  </section></div>;
}

export function BudgetModal({ state, onSave, onClose }: { state: FinanceState; onSave: (budget: Budget) => void | Promise<void>; onClose: () => void }) {
  const available = state.categories.filter((category) => category.type === "expense" && !state.budgets.some((budget) => budget.categoryId === category.id));
  const [categoryId, setCategoryId] = useState(available[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!categoryId) return;
    void onSave({ id: crypto.randomUUID(), categoryId, amount: Number(amount.replace(/\D/g, "")) });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="transaction-modal setup-modal" onSubmit={submit}>
    <div className="modal-heading"><div><p>RENCANA BULANAN</p><h2>Tambah anggaran</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></div>
    {available.length ? <><fieldset className="category-picker budget-category-picker"><legend>Pilih kategori</legend><div>{available.map((category) => <button type="button" key={category.id} className={categoryId === category.id ? "active" : ""} onClick={() => setCategoryId(category.id)}><span style={{ color: category.color, background: `${category.color}18` }}><CategoryIcon name={category.icon} /></span><small>{category.name}</small></button>)}</div></fieldset><label className="amount-field"><span>Batas anggaran</span><div><small>Rp</small><input required inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></div></label></> : <div className="empty-state"><h3>Semua kategori sudah dianggarkan</h3><p>Edit nominal dari kartu anggaran yang tersedia.</p></div>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button>{available.length > 0 && <button className="primary-button"><Check size={18} /> Simpan anggaran</button>}</div>
  </form></div>;
}
