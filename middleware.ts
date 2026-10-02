import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { BROWSER_ID_COOKIE, browserIdCookieOptions, mintBrowserId, verifyBrowserId } from "@/lib/security/browser-id";

// Public routes: the auth pages themselves, plus the callback and API routes those pages call.
// Everything else (the audit workspace, its API routes) requires a signed-in Supabase session —
// this replaces the old platform-header gate (chatgpt-auth.ts's requireChatGPTUser) at the edge,
// so an unauthenticated visitor is redirected to /login before the workspace ever renders, rather
// than relying solely on the API routes to reject them after the page has loaded.
// "/" is the public marketing landing page (app/page.tsx redirects a signed-in visitor to their
// resolved destination itself — see lib/destination.ts — so it stays public here for anonymous
// visitors without also exposing anything private to them).
// Every /api/auth/* route (signup, login, resend-verification, reset-password, email-quota) is
// public by nature — each does its own origin check and abuse limiting.
// The marketing pages (/services, /upwork-bidding-agency) and the files search engines fetch
// (/robots.txt, /sitemap.xml, the social card) are public too — a crawler bounced to /login from
// robots.txt or the sitemap never finds any of the pages those files exist to advertise.
const publicPaths = [
  "/", "/login", "/signup", "/reset-password", "/verify", "/auth/callback", "/auth/confirm", "/api/auth", "/api/leads",
  "/services", "/upwork-bidding-agency", "/robots.txt", "/sitemap.xml", "/opengraph-image", "/twitter-image",
];
function isPublicPath(pathname: string) {
  return publicPaths.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

// Refreshes the Supabase auth session cookie on every request (the standard @supabase/ssr pattern
// for Next.js App Router — without it, a session can silently expire mid-visit because nothing
// else touches the auth cookie on a plain page load), and redirects signed-out visitors away from
// everything but the public auth pages.
// ---- Session lifetime -------------------------------------------------------------------------
// Supabase refresh tokens never expire on their own, so a session on a shared/lab computer would
// otherwise stay signed in forever. Two app-level limits, both enforced here on every request:
//   - idle:     no activity for SESSION_IDLE_MINUTES (default 12 hours) -> signed out
//   - absolute: SESSION_MAX_HOURS (default 7 days) after sign-in -> signed out, sign in again
// Timestamps live in HttpOnly cookies the page's JavaScript can't read or alter.
const LAST_SEEN_COOKIE = "ix_seen";
const SESSION_START_COOKIE = "ix_ss";
const envNum = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const sessionCookie = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

export async function middleware(request: NextRequest) {
  // Browser identity for the per-browser email limit (lib/security/email-throttle.ts). Issued on
  // the response only — deliberately NOT injected into this request — so a script that never
  // keeps cookies can't get a fresh "browser" on every call; the email routes refuse requests that
  // arrive without one. A real visitor always loads the page (and gets the cookie) before posting.
  let newBrowserId: string | null = null;
  if (!(await verifyBrowserId(request.cookies.get(BROWSER_ID_COOKIE)?.value))) {
    newBrowserId = await mintBrowserId();
  }
  const withBrowserId = <T extends NextResponse>(res: T): T => {
    if (newBrowserId) res.cookies.set(BROWSER_ID_COOKIE, newBrowserId, browserIdCookieOptions());
    return res;
  };

  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return withBrowserId(response); // Auth not configured yet — let requests through unauthenticated.

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (user) {
    const now = Date.now();
    const idleMs = envNum("SESSION_IDLE_MINUTES", 12 * 60) * 60_000;
    const maxMs = envNum("SESSION_MAX_HOURS", 7 * 24) * 3_600_000;
    const lastSeen = Number(request.cookies.get(LAST_SEEN_COOKIE)?.value) || 0;
    const startedAt = Number(request.cookies.get(SESSION_START_COOKIE)?.value) || 0;
    const reason = lastSeen && now - lastSeen > idleMs ? "idle" : startedAt && now - startedAt > maxMs ? "expired" : null;

    if (reason) {
      // Revoke this browser's refresh token at Supabase and clear the auth cookies (signOut
      // writes the cleared cookies onto `response` through setAll above).
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      const out = pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 })
        : NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url));
      response.cookies.getAll().forEach(c => out.cookies.set(c));
      out.cookies.delete(LAST_SEEN_COOKIE);
      out.cookies.delete(SESSION_START_COOKIE);
      return withBrowserId(out);
    }

    // Only rewrite the activity cookie once a minute, not on every asset request.
    if (!lastSeen || now - lastSeen > 60_000) response.cookies.set(LAST_SEEN_COOKIE, String(now), sessionCookie(Math.ceil(maxMs / 1000)));
    if (!startedAt) response.cookies.set(SESSION_START_COOKIE, String(now), sessionCookie(Math.ceil(maxMs / 1000)));
  } else if (request.cookies.has(LAST_SEEN_COOKIE) || request.cookies.has(SESSION_START_COOKIE)) {
    // Signed out: forget the old session's clock so the next sign-in starts fresh.
    response.cookies.delete(LAST_SEEN_COOKIE);
    response.cookies.delete(SESSION_START_COOKIE);
  }

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return withBrowserId(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
    }
    const redirectUrl = new URL("/login", request.url);
    return withBrowserId(NextResponse.redirect(redirectUrl));
  }

  return withBrowserId(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|brand/|fonts/).*)",
  ],
};
