import { FinanceApp } from "@/components/finance-app";
import { DEMO_SESSION_COOKIE, isSessionExpired, parseSessionActivity, SESSION_ACTIVITY_COOKIE } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const cookieStore = await cookies();
  const demoMode = cookieStore.get(DEMO_SESSION_COOKIE)?.value === "1";
  const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if ((demoMode || hasSupabaseConfig) && isSessionExpired(parseSessionActivity(cookieStore.get(SESSION_ACTIVITY_COOKIE)?.value))) redirect("/login");
  if (!demoMode && hasSupabaseConfig) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }
  return <FinanceApp />;
}
