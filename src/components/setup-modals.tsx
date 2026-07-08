"use client";

import { FormEvent, useState } from "react";
import { Check, X } from "lucide-react";
import type { Account, Budget, FinanceState } from "@/lib/types";
import { CategoryIcon } from "./category-icon";

const colors = ["#116149", "#4C82F7", "#A879E1", "#EF765F", "#E5A63B"];

export function AccountModal({ onSave, onClose }: { onSave: (account: Account) => void | Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Account["kind"]>("bank");
  const [balance, setBalance] = useState("");
  const [color, setColor] = useState(colors[0]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({ id: crypto.randomUUID(), name: name.trim(), kind, initialBalance: Number(balance.replace(/\D/g, "")), color });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="transaction-modal setup-modal" onSubmit={submit}>
    <div className="modal-heading"><div><p>SUMBER DANA</p><h2>Tambah akun baru</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></div>
    <div className="type-tabs account-types">{(["bank", "ewallet", "cash"] as const).map((value) => <button type="button" className={kind === value ? "active transfer" : ""} key={value} onClick={() => setKind(value)}>{value === "bank" ? "Rekening bank" : value === "ewallet" ? "E-wallet" : "Uang tunai"}</button>)}</div>
    <label className="full-field"><span>Nama akun</span><input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: BCA Utama" /></label>
    <label className="full-field"><span>Saldo awal</span><input required inputMode="numeric" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0" /></label>
    <fieldset className="color-picker"><legend>Warna akun</legend><div>{colors.map((item) => <button type="button" key={item} style={{ background: item }} className={color === item ? "active" : ""} onClick={() => setColor(item)}>{color === item && <Check size={14} />}</button>)}</div></fieldset>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button"><Check size={18} /> Simpan akun</button></div>
  </form></div>;
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
