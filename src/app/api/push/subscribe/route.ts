import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushSubscriptionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const payload = pushSubscriptionSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ error: "Subscription tidak valid." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: payload.data.endpoint,
    p256dh: payload.data.keys.p256dh,
    auth: payload.data.keys.auth,
    user_agent: request.headers.get("user-agent"),
  }, { onConflict: "endpoint" });

  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
