"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { toLocalIsoDate } from "@/lib/date-ranges";
import type { Account, Category, Transaction } from "@/lib/types";

export interface ImportTransactionRow {
  rowNumber: number;
  type: Transaction["type"];
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  note: string;
  date: string;
  sourceReference: string;
}

interface PreviewRow extends ImportTransactionRow {
  description: string;
  error?: string;
  duplicate?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export function accountImportLabel(account: Account) {
  return `${account.name}${account.lastFour ? ` ••••${account.lastFour}` : ""} [${account.id.slice(0, 6)}]`;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

function parseType(value: unknown): Transaction["type"] | undefined {
  const normalized = normalizeHeader(value);
  if (["pengeluaran", "expense", "keluar"].includes(normalized)) return "expense";
  if (["pemasukan", "income", "masuk"].includes(normalized)) return "income";
  if (["transfer"].includes(normalized)) return "transfer";
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(`${text}T00:00:00`).getTime()) ? text : undefined;
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  const parsed = Number(String(value ?? "").replace(/[^\d-]/g, ""));
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function resolveAccount(value: unknown, accounts: Account[]) {
  const target = normalizeHeader(value);
  const labeled = accounts.find((account) => normalizeHeader(accountImportLabel(account)) === target);
  if (labeled) return labeled;
  const named = accounts.filter((account) => normalizeHeader(account.name) === target);
  return named.length === 1 ? named[0] : undefined;
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function writeWorkbook(sheets: { data: (string | number | Date | null | { value: string | number | Date; type?: StringConstructor | NumberConstructor | DateConstructor })[][]; sheet: string; columns?: { width: number }[]; stickyRowsCount?: number }[], fileName: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile(sheets).toFile(fileName);
}

async function readWorkbookSheet(file: File): Promise<unknown[][]> {
  if (typeof Worker === "undefined") {
    const { readSheet } = await import("read-excel-file/browser");
    return readSheet(file) as Promise<unknown[][]>;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/read-transactions-xlsx.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<{ ok: true; sheet: unknown[][] } | { ok: false; error: string }>) => {
      cleanup();
      if (event.data.ok) resolve(event.data.sheet);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Gagal membaca XLSX"));
    };
    worker.postMessage(file);
  });
}

export function TransactionSheetTools({ accounts, categories, getExportRows, findDuplicateReferences, onImport, onToast }: {
  accounts: Account[];
  categories: Category[];
  getExportRows: () => Promise<Transaction[]>;
  findDuplicateReferences: (references: string[]) => Promise<Set<string>>;
  onImport: (rows: ImportTransactionRow[]) => Promise<{ inserted: number; duplicates: number; errors: { row: number; message: string }[] }>;
  onToast: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[]>();
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const downloadTemplate = async () => {
    setBusy(true);
    try {
      const header = ["Tanggal", "Tipe", "Jumlah", "Akun", "Akun Tujuan", "Kategori", "Catatan"];
      const reference = [
        ["AKUN", "ID", "KATEGORI", "TIPE"],
        ...Array.from({ length: Math.max(accounts.length, categories.length) }, (_, index) => [
          accounts[index] ? accountImportLabel(accounts[index]) : "",
          accounts[index]?.id ?? "",
          categories[index]?.name ?? "",
          categories[index]?.type === "expense" ? "Pengeluaran" : categories[index] ? "Pemasukan" : "",
        ]),
      ];
      await writeWorkbook([
        { sheet: "Transaksi", stickyRowsCount: 1, columns: [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 30 }, { width: 30 }, { width: 24 }, { width: 38 }], data: [header, [toLocalIsoDate(new Date()), "Pengeluaran", 50000, accounts[0] ? accountImportLabel(accounts[0]) : "", "", categories.find((item) => item.type === "expense")?.name ?? "", "Contoh transaksi"]] },
        { sheet: "Referensi", stickyRowsCount: 1, columns: [{ width: 30 }, { width: 38 }, { width: 24 }, { width: 16 }], data: reference },
        { sheet: "Petunjuk", columns: [{ width: 100 }], data: [["PETUNJUK"], ["Isi sheet Transaksi. Tanggal menggunakan YYYY-MM-DD, jumlah berupa rupiah bulat tanpa simbol."], ["Transfer membutuhkan Akun dan Akun Tujuan yang berbeda serta tidak memakai Kategori."], ["Gunakan label akun dari sheet Referensi jika terdapat nama akun yang sama."]] },
      ], "template-transaksi-finansial-aku.xlsx");
    } finally { setBusy(false); }
  };

  const exportRows = async () => {
    setBusy(true);
    try {
      const rows = await getExportRows();
      if (!rows.length) return onToast("Tidak ada transaksi untuk diekspor");
      const header = ["Tanggal", "Tipe", "Jumlah", "Akun", "Akun Tujuan", "Kategori", "Catatan", "Dibuat Oleh"];
      const data = rows.map((item) => {
        const account = accounts.find((entry) => entry.id === item.accountId);
        const destination = accounts.find((entry) => entry.id === item.destinationAccountId);
        const category = categories.find((entry) => entry.id === item.categoryId);
        const type = item.type === "expense" ? "Pengeluaran" : item.type === "income" ? "Pemasukan" : "Transfer";
        return [item.date, type, item.amount, account ? accountImportLabel(account) : "", destination ? accountImportLabel(destination) : "", category?.name ?? "", item.note, item.createdBy];
      });
      await writeWorkbook([{ sheet: "Transaksi", stickyRowsCount: 1, columns: [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 30 }, { width: 30 }, { width: 24 }, { width: 38 }, { width: 24 }], data: [header, ...data] }], `transaksi-${new Date().toISOString().slice(0, 10)}.xlsx`);
      onToast(`${rows.length} transaksi diekspor`);
    } catch (error) { onToast(error instanceof Error ? error.message : "Gagal mengekspor transaksi"); }
    finally { setBusy(false); }
  };

  const selectFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) return onToast("File harus berformat XLSX");
    if (file.size > MAX_FILE_SIZE) return onToast("Ukuran file maksimal 5 MB");
    setBusy(true);
    try {
      const [sheet, hash] = await Promise.all([readWorkbookSheet(file), fileSha256(file)]);
      if (sheet.length < 2) throw new Error("Sheet Transaksi tidak berisi data.");
      if (sheet.length - 1 > MAX_ROWS) throw new Error("Maksimal 5.000 baris per file.");
      const headers = sheet[0].map(normalizeHeader);
      const column = (name: string) => headers.indexOf(name);
      for (const required of ["tanggal", "tipe", "jumlah", "akun", "kategori", "catatan"]) if (column(required) < 0) throw new Error(`Kolom ${required} tidak ditemukan.`);
      const rows: PreviewRow[] = sheet.slice(1).map((cells, index) => {
        const rowNumber = index + 2;
        const type = parseType(cells[column("tipe")]);
        const date = parseDate(cells[column("tanggal")]);
        const amount = parseAmount(cells[column("jumlah")]);
        const account = resolveAccount(cells[column("akun")], accounts);
        const destination = column("akun tujuan") >= 0 ? resolveAccount(cells[column("akun tujuan")], accounts) : undefined;
        const categoryName = normalizeHeader(cells[column("kategori")]);
        const category = categories.find((entry) => normalizeHeader(entry.name) === categoryName && entry.type === type);
        const note = String(cells[column("catatan")] ?? "").trim().slice(0, 100);
        let error = !date ? "Tanggal tidak valid" : !type ? "Tipe tidak valid" : !amount || amount <= 0 || amount > 100_000_000_000 ? "Jumlah tidak valid" : !account ? "Akun tidak ditemukan atau ambigu" : undefined;
        if (!error && type === "transfer" && (!destination || destination.id === account?.id)) error = "Akun tujuan transfer tidak valid";
        if (!error && type !== "transfer" && !category) error = "Kategori tidak sesuai tipe";
        return { rowNumber, type: type ?? "expense", amount: amount ?? 0, accountId: account?.id ?? "", destinationAccountId: type === "transfer" ? destination?.id : undefined, categoryId: type !== "transfer" ? category?.id : undefined, note, date: date ?? "", sourceReference: `${hash}:${rowNumber}`, description: `${date ?? "?"} · ${note || category?.name || type || "?"}`, error };
      });
      const validReferences = rows.filter((row) => !row.error).map((row) => row.sourceReference);
      const duplicates = await findDuplicateReferences(validReferences);
      setPreview(rows.map((row) => ({ ...row, duplicate: duplicates.has(row.sourceReference) })));
      setFileName(file.name);
    } catch (error) { onToast(error instanceof Error ? error.message : "Gagal membaca XLSX"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const confirmImport = async () => {
    const valid = preview?.filter((row) => !row.error && !row.duplicate) ?? [];
    if (!valid.length) return onToast("Tidak ada baris valid untuk diimpor");
    setBusy(true);
    try {
      const result = await onImport(valid);
      onToast(`${result.inserted} transaksi diimpor${result.duplicates ? `, ${result.duplicates} duplikat dilewati` : ""}${result.errors.length ? `, ${result.errors.length} gagal` : ""}`);
      setPreview(undefined);
    } catch (error) { onToast(error instanceof Error ? error.message : "Gagal mengimpor transaksi"); }
    finally { setBusy(false); }
  };

  const validCount = preview?.filter((row) => !row.error && !row.duplicate).length ?? 0;
  const errorCount = preview?.filter((row) => row.error).length ?? 0;
  const duplicateCount = preview?.filter((row) => row.duplicate).length ?? 0;

  return <>
    <div className="sheet-tools"><button type="button" disabled={busy} onClick={() => void exportRows()}><Download size={16} /> Ekspor</button><button type="button" disabled={busy} onClick={() => void downloadTemplate()}><FileSpreadsheet size={16} /> Template</button><button type="button" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={16} /> Impor</button><input ref={inputRef} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void selectFile(event.target.files?.[0])} /></div>
    {preview && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPreview(undefined)}><section className="modal-card import-preview" role="dialog" aria-modal="true"><div className="modal-heading"><div><p>IMPOR XLSX</p><h2>Pratinjau {fileName}</h2></div><button type="button" onClick={() => setPreview(undefined)} aria-label="Tutup"><X size={20} /></button></div><div className="import-stats"><span className="valid">{validCount} valid</span><span className="invalid">{errorCount} error</span><span>{duplicateCount} duplikat</span></div><div className="preview-list">{preview.map((row) => <div key={row.rowNumber} className={row.error ? "invalid" : row.duplicate ? "duplicate" : "valid"}><strong>Baris {row.rowNumber}</strong><span>{row.description}</span><small>{row.error ?? (row.duplicate ? "Sudah pernah diimpor" : "Siap diimpor")}</small></div>)}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPreview(undefined)}>Batal</button><button type="button" className="primary-button" disabled={!validCount || busy} onClick={() => void confirmImport()}><Upload size={17} /> Impor {validCount} baris</button></div></section></div>}
  </>;
}
