import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallbackQuery, botHelpText, formatBotTransaction, sendTelegramMessage } from "@/lib/telegram/api";
import { classifyWithGlm } from "@/lib/telegram/classifier";
import { parseTemplate } from "@/lib/telegram/parser";
import type { ClassifierContext, ParsedTransaction, TelegramAccount, TelegramCategory } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface TelegramUser { id: number; username?: string }
interface TelegramMessage { message_id: number; text?: string; chat: { id: number; type: string }; from?: TelegramUser }
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; from: TelegramUser; data?: string; message?: TelegramMessage };
}

type AdminClient = ReturnType<typeof createAdminClient>;

function validSecret(received: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!received || !expected || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function jakartaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function markUpdate(admin: AdminClient, updateId: number, values: Record<string, unknown>) {
  await admin.from("telegram_updates").update({ ...values, processed_at: new Date().toISOString() }).eq("update_id", updateId);
}

async function getContext(admin: AdminClient, connection: { household_id: string; default_account_id: string }): Promise<ClassifierContext> {
  const [accountsResult, categoriesResult] = await Promise.all([
    admin.from("accounts").select("id,name").eq("household_id", connection.household_id).is("archived_at", null),
    admin.from("categories").select("id,name,type").eq("household_id", connection.household_id).is("archived_at", null),
  ]);
  return {
    accounts: (accountsResult.data ?? []) as TelegramAccount[],
    categories: (categoriesResult.data ?? []) as TelegramCategory[],
    defaultAccountId: connection.default_account_id,
    today: jakartaDate(),
  };
}

async function saveTransaction(admin: AdminClient, transaction: ParsedTransaction, connection: { user_id: string; household_id: string }, sourceReference: string) {
  return admin.from("transactions").insert({
    household_id: connection.household_id,
    type: transaction.type,
    amount: transaction.amount,
    account_id: transaction.accountId,
    destination_account_id: transaction.destinationAccountId ?? null,
    category_id: transaction.categoryId ?? null,
    note: transaction.note,
    transaction_date: transaction.date,
    created_by: connection.user_id,
    source: "telegram",
    source_reference: sourceReference,
  }).select("id").single();
}

async function undoTransaction(admin: AdminClient, chatId: number, userId: string, transactionId?: string) {
  let query = admin.from("transactions").select("id,created_at").eq("created_by", userId).eq("source", "telegram").is("deleted_at", null).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(1);
  if (transactionId) query = query.eq("id", transactionId);
  const { data } = await query.maybeSingle();
  if (!data) return sendTelegramMessage(chatId, "Tidak ada transaksi bot dalam 10 menit terakhir yang bisa dibatalkan.");
  await admin.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
  return sendTelegramMessage(chatId, "Transaksi terakhir berhasil dibatalkan. Saldo aplikasi sudah diperbarui.");
}

async function handlePairing(admin: AdminClient, updateId: number, message: TelegramMessage, code: string) {
  const codeHash = createHash("sha256").update(code.toUpperCase()).digest("hex");
  const { data: pairing } = await admin.from("telegram_pairing_codes").select("*").eq("code_hash", codeHash).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!pairing || !message.from) {
    await sendTelegramMessage(message.chat.id, "Kode pairing tidak valid atau sudah kedaluwarsa. Buat kode baru dari Pengaturan aplikasi.");
    return markUpdate(admin, updateId, { status: "failed", parser_mode: "command", error_message: "INVALID_PAIRING_CODE" });
  }
  const { error } = await admin.from("telegram_connections").upsert({
    user_id: pairing.user_id,
    household_id: pairing.household_id,
    telegram_user_id: message.from.id,
    telegram_chat_id: message.chat.id,
    telegram_username: message.from.username ?? null,
    default_account_id: pairing.default_account_id,
  }, { onConflict: "user_id" });
  if (error) {
    await sendTelegramMessage(message.chat.id, "Akun Telegram ini sudah terhubung ke pengguna lain.");
    return markUpdate(admin, updateId, { status: "failed", parser_mode: "command", error_message: error.message });
  }
  await admin.from("telegram_pairing_codes").update({ used_at: new Date().toISOString() }).eq("id", pairing.id);
  await sendTelegramMessage(message.chat.id, `Telegram berhasil terhubung.\n\n${botHelpText}`);
  return markUpdate(admin, updateId, { status: "completed", parser_mode: "command", user_id: pairing.user_id, household_id: pairing.household_id });
}

async function handleCallback(admin: AdminClient, update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.data || !callback.message) return;
  const { data: connection } = await admin.from("telegram_connections").select("*").eq("telegram_user_id", callback.from.id).maybeSingle();
  if (!connection) return answerCallbackQuery(callback.id, "Telegram belum terhubung.");
  const [action, id] = callback.data.split(":");
  if (action === "undo") {
    await undoTransaction(admin, callback.message.chat.id, connection.user_id, id);
    await answerCallbackQuery(callback.id, "Transaksi dibatalkan");
  } else if (action === "cancel") {
    await admin.from("telegram_pending_transactions").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", id).eq("user_id", connection.user_id).eq("status", "pending");
    await answerCallbackQuery(callback.id, "Dibatalkan");
    await sendTelegramMessage(callback.message.chat.id, "Draft transaksi dibatalkan.");
  } else if (action === "save") {
    const { data: pending } = await admin.from("telegram_pending_transactions").select("*").eq("id", id).eq("user_id", connection.user_id).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!pending) return answerCallbackQuery(callback.id, "Draft sudah kedaluwarsa atau diproses.");
    const transaction = pending.payload as ParsedTransaction;
    const { data, error } = await saveTransaction(admin, transaction, connection, `telegram:${pending.update_id}`);
    if (error) return answerCallbackQuery(callback.id, "Gagal menyimpan transaksi.");
    await admin.from("telegram_pending_transactions").update({ status: "confirmed", resolved_at: new Date().toISOString() }).eq("id", id);
    await markUpdate(admin, pending.update_id, { status: "completed", transaction_id: data.id });
    const context = await getContext(admin, connection);
    await answerCallbackQuery(callback.id, "Transaksi disimpan");
    await sendTelegramMessage(callback.message.chat.id, `Tersimpan ✓\n${formatBotTransaction(transaction, context.accounts, context.categories)}`, [[{ text: "↩ Batalkan", callback_data: `undo:${data.id}` }]]);
  }
  await markUpdate(admin, update.update_id, { status: "completed", parser_mode: "callback", user_id: connection.user_id, household_id: connection.household_id });
}

async function handleCommand(admin: AdminClient, updateId: number, message: TelegramMessage, text: string, connection: { user_id: string; household_id: string; default_account_id: string }) {
  const command = text.split(/\s+/)[0].toLowerCase().split("@")[0];
  const context = await getContext(admin, connection);
  if (command === "/help" || command === "/start") await sendTelegramMessage(message.chat.id, botHelpText);
  else if (command === "/akun") await sendTelegramMessage(message.chat.id, `Akun tersedia:\n${context.accounts.map((account) => `${account.id === connection.default_account_id ? "★" : "•"} ${account.name}`).join("\n")}`);
  else if (command === "/default") {
    const requested = text.replace(/^\/default(?:@\w+)?/i, "").trim().toLowerCase();
    const account = context.accounts.find((item) => item.name.toLowerCase().includes(requested));
    if (!requested || !account) await sendTelegramMessage(message.chat.id, "Gunakan /default NAMA_AKUN. Lihat daftar dengan /akun.");
    else { await admin.from("telegram_connections").update({ default_account_id: account.id }).eq("user_id", connection.user_id); await sendTelegramMessage(message.chat.id, `${account.name} sekarang menjadi akun default.`); }
  } else if (command === "/undo") await undoTransaction(admin, message.chat.id, connection.user_id);
  else if (command === "/batal") {
    const { data } = await admin.from("telegram_pending_transactions").select("id").eq("user_id", connection.user_id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) await admin.from("telegram_pending_transactions").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", data.id);
    await sendTelegramMessage(message.chat.id, data ? "Draft terakhir dibatalkan." : "Tidak ada draft yang menunggu konfirmasi.");
  } else await sendTelegramMessage(message.chat.id, botHelpText);
  await markUpdate(admin, updateId, { status: "completed", parser_mode: "command", user_id: connection.user_id, household_id: connection.household_id });
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-telegram-bot-api-secret-token"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const update = await request.json() as TelegramUpdate;
  if (!Number.isSafeInteger(update.update_id)) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const admin = createAdminClient();
  const from = update.message?.from ?? update.callback_query?.from;
  const { error: insertError } = await admin.from("telegram_updates").insert({ update_id: update.update_id, telegram_user_id: from?.id, message_text: update.message?.text?.slice(0, 500) });
  if (insertError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    if (update.callback_query) { await handleCallback(admin, update); return NextResponse.json({ ok: true }); }
    const message = update.message;
    if (!message?.from || !message.text) { await markUpdate(admin, update.update_id, { status: "ignored" }); return NextResponse.json({ ok: true }); }
    if (message.chat.type !== "private") { await sendTelegramMessage(message.chat.id, "Bot ini hanya menerima transaksi lewat chat pribadi."); await markUpdate(admin, update.update_id, { status: "ignored" }); return NextResponse.json({ ok: true }); }
    const startCode = message.text.match(/^\/start(?:@\w+)?\s+([A-Z0-9]{4}-[A-Z0-9]{4})$/i)?.[1];
    if (startCode) { await handlePairing(admin, update.update_id, message, startCode); return NextResponse.json({ ok: true }); }
    const { data: connection } = await admin.from("telegram_connections").select("*").eq("telegram_user_id", message.from.id).maybeSingle();
    if (!connection) { await sendTelegramMessage(message.chat.id, "Telegram belum terhubung. Buka Pengaturan → Telegram di aplikasi untuk membuat kode pairing."); await markUpdate(admin, update.update_id, { status: "failed", error_message: "NOT_PAIRED" }); return NextResponse.json({ ok: true }); }
    if (message.text.startsWith("/")) { await handleCommand(admin, update.update_id, message, message.text, connection); return NextResponse.json({ ok: true }); }

    const context = await getContext(admin, connection);
    let transaction = parseTemplate(message.text, context);
    let inputTokens = 0; let outputTokens = 0;
    if (!transaction) {
      const startOfDay = `${jakartaDate()}T00:00:00+07:00`;
      const { count } = await admin.from("telegram_updates").select("update_id", { count: "exact", head: true }).eq("user_id", connection.user_id).eq("parser_mode", "ai").gte("created_at", startOfDay);
      const dailyLimit = Number(process.env.TELEGRAM_AI_DAILY_LIMIT ?? 50);
      if ((count ?? 0) >= dailyLimit) { await sendTelegramMessage(message.chat.id, `Batas AI harian tercapai. Gunakan template:\n${botHelpText}`); await markUpdate(admin, update.update_id, { status: "failed", user_id: connection.user_id, household_id: connection.household_id, error_message: "AI_DAILY_LIMIT" }); return NextResponse.json({ ok: true }); }
      try {
        const classified = await classifyWithGlm(message.text, context);
        transaction = classified.transaction; inputTokens = classified.inputTokens; outputTokens = classified.outputTokens;
      } catch (error) {
        await sendTelegramMessage(message.chat.id, `AI sedang tidak tersedia. Gunakan salah satu template berikut:\n${botHelpText}`);
        await markUpdate(admin, update.update_id, { status: "failed", user_id: connection.user_id, household_id: connection.household_id, parser_mode: "ai", error_message: error instanceof Error ? error.message.slice(0, 200) : "AI_ERROR" });
        return NextResponse.json({ ok: true });
      }
    }
    await admin.from("telegram_updates").update({ user_id: connection.user_id, household_id: connection.household_id, parser_mode: transaction.parserMode, input_tokens: inputTokens, output_tokens: outputTokens }).eq("update_id", update.update_id);
    const summary = formatBotTransaction(transaction, context.accounts, context.categories);
    if (transaction.confidence < 0.85) {
      const { data: pending, error } = await admin.from("telegram_pending_transactions").insert({ update_id: update.update_id, user_id: connection.user_id, household_id: connection.household_id, payload: transaction, confidence: transaction.confidence }).select("id").single();
      if (error) throw error;
      await sendTelegramMessage(message.chat.id, `Saya kurang yakin. Periksa dulu:\n${summary}`, [[{ text: "✓ Simpan", callback_data: `save:${pending.id}` }, { text: "✕ Batal", callback_data: `cancel:${pending.id}` }], ...(process.env.NEXT_PUBLIC_APP_URL ? [[{ text: "Buka aplikasi", url: process.env.NEXT_PUBLIC_APP_URL }]] : [])]);
      await markUpdate(admin, update.update_id, { status: "pending" });
    } else {
      const { data, error } = await saveTransaction(admin, transaction, connection, `telegram:${update.update_id}`);
      if (error) throw error;
      await sendTelegramMessage(message.chat.id, `Tersimpan ✓\n${summary}`, [[{ text: "↩ Batalkan", callback_data: `undo:${data.id}` }]]);
      await markUpdate(admin, update.update_id, { status: "completed", transaction_id: data.id });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    await markUpdate(admin, update.update_id, { status: "failed", error_message: error instanceof Error ? error.message.slice(0, 300) : "UNKNOWN_ERROR" });
    return NextResponse.json({ ok: true });
  }
}
