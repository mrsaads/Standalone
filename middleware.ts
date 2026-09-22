import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public routes: the auth pages themselves, plus the callback and API routes those pages call.
// Everything else (the audit workspace, its API routes) requires a signed-in Supabase session —
// this replaces the old platform-header gate (chatgpt-auth.ts's requireChatGPTUser) at the edge,
// so an unauthenticated visitor is redirected to /login before the workspace ever renders, rather
// than relying solely on the API routes to reject them after the page has loaded.
// "/" is the public marketing landing page (app/page.tsx redirects a signed-in visitor to their
// resolved destination itself — see lib/destination.ts — so it stays public here for anonymous
// visitors without also exposing anything private to them).
const publicPaths = ["/", "/login", "/signup", "/reset-password", "/verify", "/auth/callback", "/auth/confirm", "/api/auth/signup", "/api/leads"];
function isPublicPath(pathname: string) {
  return publicPaths.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

// Refreshes the Supabase auth session cookie on every request (the standard @supabase/ssr pattern
// for Next.js App Router — without it, a session can silently expire mid-visit because nothing
// else touches the auth cookie on a plain page load), and redirects signed-out visitors away from
// everything but the public auth pages.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response; // Auth not configured yet — let requests through unauthenticated.

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

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const redirectUrl = new URL("/login", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|brand/|fonts/).*)",
  ],
};
