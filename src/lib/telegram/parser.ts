import type { ClassifierContext, ParsedTransaction, TelegramAccount, TelegramCategory } from "./types";

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function parseIndonesianAmount(text: string): number | null {
  const normalized = normalize(text).replace(/\s+/g, " ");
  const unitMatch = normalized.match(/(?:rp\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|m|ribu|rb|k)\b/);
  if (unitMatch) {
    const numeric = Number(unitMatch[1].replace(",", "."));
    const multiplier = ["juta", "jt", "m"].includes(unitMatch[2]) ? 1_000_000 : 1_000;
    return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : null;
  }
  const rupiahMatch = normalized.match(/rp\s*([\d.]+(?:,\d{1,2})?)/);
  if (rupiahMatch) {
    const digits = rupiahMatch[1].split(",")[0].replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }
  const commandAmount = normalized.match(/\b(?:keluar|pengeluaran|belanja|masuk|pemasukan|terima|transfer|tf)\s+(\d[\d.]*)\b/);
  if (commandAmount) return Number(commandAmount[1].replace(/\D/g, ""));
  return null;
}

function findType(text: string): ParsedTransaction["type"] | null {
  if (/\b(transfer|tf|pindah(?:kan)?)\b/.test(text)) return "transfer";
  if (/\b(masuk|pemasukan|terima|gaji|income)\b/.test(text)) return "income";
  if (/\b(keluar|pengeluaran|belanja|bayar|expense)\b/.test(text)) return "expense";
  return null;
}

function findMentionedAccounts(text: string, accounts: TelegramAccount[]) {
  return accounts
    .map((account) => {
      const name = normalize(account.name);
      const candidates = [name, ...name.split(/\s+/).filter((part) => part.length >= 3 && !["utama", "bersama", "rekening", "uang", "tunai"].includes(part))];
      const indexes = candidates.map((candidate) => text.search(new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`))).filter((index) => index >= 0);
      return { account, index: indexes.length ? Math.min(...indexes) : -1 };
    })
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
}

function findCategory(text: string, categories: TelegramCategory[], type: "expense" | "income") {
  const candidates = categories.filter((category) => category.type === type);
  const direct = candidates.find((category) => text.includes(normalize(category.name)));
  if (direct) return direct;
  const aliases: Record<string, string[]> = {
    "makan & minum": ["makan", "minum", "kopi", "resto", "warung", "dinner", "lunch"],
    transportasi: ["bensin", "grab", "gojek", "tol", "parkir", "transport"],
    belanja: ["belanja", "shopping", "minimarket", "supermarket"],
    "rumah tangga": ["listrik", "token", "air", "internet", "rumah"],
    kesehatan: ["obat", "dokter", "vitamin", "klinik", "kesehatan"],
    hiburan: ["nonton", "bioskop", "game", "netflix", "hiburan"],
    gaji: ["gaji", "salary"],
    "bonus & lainnya": ["bonus", "freelance", "hadiah", "cashback"],
  };
  return candidates.find((category) => (aliases[normalize(category.name)] ?? []).some((alias) => new RegExp(`\\b${alias}\\b`).test(text)));
}

function resolveDate(text: string, today: string) {
  if (!/\b(kemarin|yesterday)\b/.test(text)) return today;
  const date = new Date(`${today}T12:00:00+07:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function parseTemplate(message: string, context: ClassifierContext): ParsedTransaction | null {
  const text = normalize(message);
  const type = findType(text);
  const amount = parseIndonesianAmount(text);
  if (!type || !amount || amount <= 0) return null;

  const mentioned = findMentionedAccounts(text, context.accounts);
  let accountId = context.defaultAccountId;
  let destinationAccountId: string | undefined;
  if (type === "transfer") {
    const fromIndex = text.indexOf("dari ");
    const toIndex = text.indexOf(" ke ");
    const source = mentioned.find((item) => fromIndex >= 0 && item.index > fromIndex && (toIndex < 0 || item.index < toIndex));
    const destination = mentioned.find((item) => toIndex >= 0 && item.index > toIndex);
    accountId = source?.account.id ?? context.defaultAccountId;
    destinationAccountId = destination?.account.id;
    if (!destinationAccountId || destinationAccountId === accountId) return null;
  } else if (mentioned.length) {
    accountId = mentioned.at(-1)?.account.id ?? context.defaultAccountId;
  }

  const category = type === "transfer" ? undefined : findCategory(text, context.categories, type);
  if (type !== "transfer" && !category) return null;
  return {
    type,
    amount,
    accountId,
    destinationAccountId,
    categoryId: category?.id,
    date: resolveDate(text, context.today),
    note: message.trim().slice(0, 100),
    confidence: 0.99,
    parserMode: "template",
  };
}
