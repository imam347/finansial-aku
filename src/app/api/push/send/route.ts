import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.PUSH_WEBHOOK_SECRET || authorization !== `Bearer ${process.env.PUSH_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { record } = await request.json() as { record?: { id: string; household_id: string; user_id: string; title: string; body: string } };
  if (!record) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!url || !serviceKey || !publicKey || !privateKey) return NextResponse.json({ error: "Push belum dikonfigurasi" }, { status: 503 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", record.user_id);
  const stale: string[] = [];
  await Promise.all((subscriptions ?? []).map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: record.title, body: record.body, url: "/?notification=" + record.id }));
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) stale.push(subscription.id);
    }
  }));
  if (stale.length) await supabase.from("push_subscriptions").delete().in("id", stale);
  await supabase.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", record.id);
  return NextResponse.json({ delivered: (subscriptions?.length ?? 0) - stale.length });
}
