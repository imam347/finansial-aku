import "server-only";
import type { ParsedTransaction, TelegramAccount, TelegramCategory } from "./types";

interface InlineButton { text: string; callback_data?: string; url?: string }

async function telegramRequest(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`TELEGRAM_${method.toUpperCase()}_${response.status}`);
  return response.json();
}

export function sendTelegramMessage(chatId: number, text: string, buttons?: InlineButton[][]) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function answerCallbackQuery(callbackQueryId: string, text: string) {
  return telegramRequest("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function formatBotTransaction(transaction: ParsedTransaction, accounts: TelegramAccount[], categories: TelegramCategory[]) {
  const type = transaction.type === "expense" ? "Pengeluaran" : transaction.type === "income" ? "Pemasukan" : "Transfer";
  const account = accounts.find((item) => item.id === transaction.accountId)?.name ?? "Akun";
  const destination = accounts.find((item) => item.id === transaction.destinationAccountId)?.name;
  const category = categories.find((item) => item.id === transaction.categoryId)?.name;
  const amount = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(transaction.amount);
  return [
    `${type} · ${amount}`,
    transaction.type === "transfer" ? `${account} → ${destination}` : `${category} · ${account}`,
    `${transaction.date} · ${transaction.note}`,
  ].join("\n");
}

export const botHelpText = [
  "Kirim transaksi dengan bahasa biasa atau template:",
  "• keluar 50rb makan dari BCA kopi",
  "• masuk 10jt gaji ke BCA",
  "• transfer 500rb dari BCA ke Jago",
  "",
  "Perintah: /akun, /default NAMA_AKUN, /undo, /batal, /help",
].join("\n");
