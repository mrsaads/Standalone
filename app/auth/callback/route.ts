import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestOrigin, safeNextPath } from "@/lib/http";

// Single PKCE code-exchange handler for every Supabase auth email link: signup verification,
// password-reset, and (if added later) magic links all redirect here with a `code` param plus a
// `next` param telling us where to send the user afterward. Both app/api/auth/signup/route.ts
// (emailRedirectTo: `${origin}/auth/callback?next=/`) and app/api/auth/reset-password/route.ts
// (redirectTo: `${origin}/auth/callback?next=/reset-password/confirm`) point here.
//
// A password-reset link must land on the new-password page even when `next` was lost. That
// happens whenever Supabase refuses the redirectTo URL (it is not in Authentication -> URL
// Configuration -> Redirect URLs, e.g. after moving to a new domain): Supabase silently falls back
// to the bare Site URL, middleware.ts forwards the stray `?code=` here, and without this check the
// person would just be signed in and dropped on the home page with no way to set a password.
// supabase-js stores the recovery flag next to the PKCE verifier and hands it back as
// `redirectType: "recovery"` from exchangeCodeForSession, so the flow type is known for certain.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");
  // Only ever a path on this site: an emailed link with `next=https://evil.example` (or
  // `//evil.example`, `@evil.example`) must never bounce a freshly signed-in user off-site.
  const next = safeNextPath(url.searchParams.get("next"));
  const isRecoveryLink = next.startsWith("/reset-password");
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    // An expired or already-used reset link should send the person back to request a new one,
    // not to a login form they cannot use because they have forgotten the password.
    const target = isRecoveryLink ? "/reset-password" : "/login";
    return NextResponse.redirect(`${origin}${target}?error=${encodeURIComponent(errorDescription)}`);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const target = isRecoveryLink ? "/reset-password" : "/login";
      return NextResponse.redirect(`${origin}${target}?error=${encodeURIComponent(friendlyExchangeError(error.message, isRecoveryLink))}`);
    }
    // Present at runtime (auth-js 2.116 adds it to the returned data) but missing from the
    // published type for this method, hence the narrow cast instead of an `any`.
    if ((data as { redirectType?: string | null }).redirectType === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password/confirm`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

// The most common failure is opening the email on a different device or browser from the one
// that asked for it: the PKCE verifier cookie only exists in the browser that made the request.
function friendlyExchangeError(message: string, recovery: boolean): string {
  if (/code verifier|both auth code and code verifier/i.test(message)) {
    return recovery
      ? "Open the reset link in the same browser you used to request it, or request a new link here."
      : "Open the confirmation link in the same browser you signed up with, or sign in to request a new one.";
  }
  if (/expired|invalid|not found/i.test(message)) {
    return recovery ? "This reset link has expired or was already used. Request a new one below." : message;
  }
  return message;
}
