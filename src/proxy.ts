import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE, isSessionExpired, parseSessionActivity, SESSION_ACTIVITY_COOKIE, SESSION_IDLE_TIMEOUT_SECONDS } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
  const protectedPath = request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/onboarding");
  const demoMode = request.cookies.get(DEMO_SESSION_COOKIE)?.value === "1";
  const lastActivity = parseSessionActivity(request.cookies.get(SESSION_ACTIVITY_COOKIE)?.value);
  if (protectedPath && (demoMode || hasSupabaseConfig) && isSessionExpired(lastActivity)) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    redirectResponse.cookies.set(SESSION_ACTIVITY_COOKIE, "", { path: "/", maxAge: 0 });
    redirectResponse.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return redirectResponse;
  }
  if (!hasSupabaseConfig) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  if (protectedPath && lastActivity) {
    const now = String(Date.now());
    response.cookies.set(SESSION_ACTIVITY_COOKIE, now, { path: "/", maxAge: SESSION_IDLE_TIMEOUT_SECONDS, sameSite: "lax" });
    if (demoMode) response.cookies.set(DEMO_SESSION_COOKIE, "1", { path: "/", maxAge: SESSION_IDLE_TIMEOUT_SECONDS, sameSite: "lax" });
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
