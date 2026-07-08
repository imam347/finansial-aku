"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, X } from "lucide-react";
import { dateKey, formatRupiah } from "@/lib/format";
import type { FinanceState, Transaction, TransactionType } from "@/lib/types";
import { CategoryIcon } from "./category-icon";

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
          <label><span>{type === "transfer" ? "Dari akun" : "Akun"}</span><div className="select-wrap"><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatRupiah(account.initialBalance, true)}</option>)}</select><ChevronDown size={16} /></div></label>
          {type === "transfer" ? <label><span>Ke akun</span><div className="select-wrap"><select value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)}>{state.accounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><ChevronDown size={16} /></div></label> : <label><span>Tanggal</span><div className="date-wrap"><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></label>}
        </div>
        {type === "transfer" && <label className="full-field"><span>Tanggal</span><div className="date-wrap"><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></label>}

        <label className="full-field"><span>Catatan <small>(opsional)</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={type === "expense" ? "Contoh: Makan malam berdua" : type === "income" ? "Contoh: Gaji bulan ini" : "Contoh: Isi rekening bersama"} maxLength={100} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" type="submit"><Check size={18} /> {editing ? "Simpan perubahan" : "Simpan transaksi"}</button></div>
      </form>
    </div>
  );
}
