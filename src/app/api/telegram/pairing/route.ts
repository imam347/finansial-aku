import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const pairingSchema = z.object({ defaultAccountId: z.string().uuid() });

async function authorizedContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle();
  return member ? { userId: user.id, householdId: member.household_id as string } : null;
}

export async function GET() {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from("telegram_connections").select("telegram_username,default_account_id,connected_at").eq("user_id", context.userId).maybeSingle();
  return NextResponse.json({ connected: Boolean(data), connection: data, botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null });
}

export async function POST(request: Request) {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = pairingSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Akun default tidak valid." }, { status: 400 });
  const admin = createAdminClient();
  const { data: account } = await admin.from("accounts").select("id").eq("id", body.data.defaultAccountId).eq("household_id", context.householdId).is("archived_at", null).maybeSingle();
  if (!account) return NextResponse.json({ error: "Akun bukan bagian household." }, { status: 400 });

  const raw = randomBytes(4).toString("hex").toUpperCase();
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const codeHash = createHash("sha256").update(code).digest("hex");
  await admin.from("telegram_pairing_codes").delete().eq("user_id", context.userId).is("used_at", null);
  const { error } = await admin.from("telegram_pairing_codes").insert({
    user_id: context.userId,
    household_id: context.householdId,
    default_account_id: body.data.defaultAccountId,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return NextResponse.json({ code, expiresInSeconds: 600, deepLink: username ? `https://t.me/${username}?start=${code}` : null });
}

export async function DELETE() {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { error } = await createAdminClient().from("telegram_connections").delete().eq("user_id", context.userId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const context = await authorizedContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = pairingSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Akun default tidak valid." }, { status: 400 });
  const admin = createAdminClient();
  const { data: account } = await admin.from("accounts").select("id").eq("id", body.data.defaultAccountId).eq("household_id", context.householdId).is("archived_at", null).maybeSingle();
  if (!account) return NextResponse.json({ error: "Akun bukan bagian household." }, { status: 400 });
  const { error } = await admin.from("telegram_connections").update({ default_account_id: account.id }).eq("user_id", context.userId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
