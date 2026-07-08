const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

if (!token || !secret || !appUrl) {
  throw new Error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, dan NEXT_PUBLIC_APP_URL terlebih dahulu.");
}

const call = async (method, body) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${method}: ${JSON.stringify(result)}`);
  return result;
};

await call("setWebhook", {
  url: `${appUrl}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});

await call("setMyCommands", {
  commands: [
    { command: "help", description: "Contoh cara mencatat transaksi" },
    { command: "akun", description: "Lihat akun dan akun default" },
    { command: "default", description: "Ubah akun default" },
    { command: "undo", description: "Batalkan transaksi 10 menit terakhir" },
    { command: "batal", description: "Batalkan draft yang belum dikonfirmasi" },
  ],
});

console.log(`Webhook Telegram aktif di ${appUrl}/api/telegram/webhook`);
