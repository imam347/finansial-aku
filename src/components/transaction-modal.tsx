"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Landmark, Smartphone, Wallet, X } from "lucide-react";
import { getAccountBalance } from "@/lib/account-balance";
import { dateKey, formatRupiah } from "@/lib/format";
import type { FinanceState, Transaction, TransactionType } from "@/lib/types";
import { CategoryIcon } from "./category-icon";

function AccountPicker({ label, state, value, excludeId, onChange }: { label: string; state: FinanceState; value: string; excludeId?: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const accounts = state.accounts.filter((account) => account.id !== excludeId);
  const selected = accounts.find((account) => account.id === value) ?? accounts[0];
  const Icon = selected?.kind === "bank" ? Landmark : selected?.kind === "ewallet" ? Smartphone : Wallet;

  return <div className="account-picker-field"><span>{label}</span><div className="account-picker">
    <button type="button" className="account-picker-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {selected ? <><i style={{ color: selected.color, background: `${selected.color}18` }}><Icon size={17} /></i><span><strong>{selected.name}</strong><small>{formatRupiah(getAccountBalance(state, selected.id), true)}</small></span></> : <span><strong>Pilih akun</strong></span>}<ChevronDown size={17} />
    </button>
    {open && <div className="account-picker-menu" role="listbox">{accounts.map((account) => {
      const AccountIcon = account.kind === "bank" ? Landmark : account.kind === "ewallet" ? Smartphone : Wallet;
      return <button type="button" role="option" aria-selected={account.id === selected?.id} key={account.id} className={account.id === selected?.id ? "active" : ""} onClick={() => { onChange(account.id); setOpen(false); }}><i style={{ color: account.color, background: `${account.color}18` }}><AccountIcon size={17} /></i><span><strong>{account.name}</strong><small>{formatRupiah(getAccountBalance(state, account.id), true)}</small></span>{account.id === selected?.id && <Check size={15} />}</button>;
    })}</div>}
  </div></div>;
}

export function TransactionModal({ state, editing, currentUserName, onSave, onClose }: {
  state: FinanceState;
  editing?: Transaction;
  currentUserName: string;
  onSave: (transaction: Transaction) => void | Promise<void>;
  onClose: () => void;
}) {
  const [type, setType] = useState<TransactionType>(editing?.type ?? "expense");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [accountId, setAccountId] = useState(editing?.accountId ?? state.accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState(editing?.destinationAccountId ?? state.accounts[1]?.id ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [date, setDate] = useState(editing?.date ?? dateKey(new Date()));
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState("");

  const categories = useMemo(() => state.categories.filter((item) => item.type === (type === "income" ? "income" : "expense")), [state.categories, type]);
  const selectedCategoryId = categories.some((item) => item.id === categoryId) ? categoryId : categories[0]?.id ?? "";
  const numericAmount = Number(amount.replace(/\D/g, ""));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (numericAmount <= 0) return setError("Masukkan nominal transaksi.");
    if (!accountId) return setError("Pilih akun sumber dana.");
    if (type === "transfer" && (!destinationAccountId || destinationAccountId === accountId)) return setError("Pilih akun tujuan yang berbeda.");
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      type,
      amount: numericAmount,
      accountId,
      destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
      categoryId: type === "transfer" ? undefined : selectedCategoryId,
      note: note.trim() || (type === "transfer" ? "Transfer antar akun" : categories.find((item) => item.id === selectedCategoryId)?.name ?? "Transaksi"),
      date,
      createdBy: editing?.createdBy ?? currentUserName,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="transaction-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="transaction-title">
        <div className="modal-heading"><div><p>CATATAN KEUANGAN</p><h2 id="transaction-title">{editing ? "Edit transaksi" : "Catat transaksi baru"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></div>

        <div className="type-tabs">
          <button type="button" className={type === "expense" ? "active expense" : ""} onClick={() => setType("expense")}><ArrowUpRight size={17} /> Pengeluaran</button>
          <button type="button" className={type === "income" ? "active income" : ""} onClick={() => setType("income")}><ArrowDownLeft size={17} /> Pemasukan</button>
          <button type="button" className={type === "transfer" ? "active transfer" : ""} onClick={() => setType("transfer")}><ArrowRightLeft size={17} /> Transfer</button>
        </div>

        <label className="amount-field">
          <span>Nominal</span>
          <div><small>Rp</small><input autoFocus inputMode="numeric" aria-label="Nominal rupiah" value={numericAmount ? new Intl.NumberFormat("id-ID").format(numericAmount) : ""} onChange={(event) => { setAmount(event.target.value); setError(""); }} placeholder="0" /></div>
        </label>

        {type !== "transfer" && <fieldset className="category-picker"><legend>Kategori</legend><div>{categories.map((category) => <button type="button" key={category.id} className={selectedCategoryId === category.id ? "active" : ""} onClick={() => setCategoryId(category.id)}><span style={{ color: category.color, background: `${category.color}18` }}><CategoryIcon name={category.icon} size={19} /></span><small>{category.name}</small>{selectedCategoryId === category.id && <i><Check size={11} /></i>}</button>)}</div></fieldset>}

        <div className="form-grid">
          <AccountPicker label={type === "transfer" ? "Dari akun" : "Akun"} state={state} value={accountId} onChange={(id) => { setAccountId(id); if (id === destinationAccountId) setDestinationAccountId(state.accounts.find((account) => account.id !== id)?.id ?? ""); }} />
          {type === "transfer" ? <AccountPicker label="Ke akun" state={state} value={destinationAccountId} excludeId={accountId} onChange={setDestinationAccountId} /> : <label><span>Tanggal</span><div className="date-wrap"><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></label>}
        </div>
        {type === "transfer" && <label className="full-field"><span>Tanggal</span><div className="date-wrap"><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></label>}

        <label className="full-field"><span>Catatan <small>(opsional)</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={type === "expense" ? "Contoh: Makan malam berdua" : type === "income" ? "Contoh: Gaji bulan ini" : "Contoh: Isi rekening bersama"} maxLength={100} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" type="submit"><Check size={18} /> {editing ? "Simpan perubahan" : "Simpan transaksi"}</button></div>
      </form>
    </div>
  );
}
