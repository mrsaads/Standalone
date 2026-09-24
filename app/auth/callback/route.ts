import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestOrigin, safeNextPath } from "@/lib/http";

// Single PKCE code-exchange handler for every Supabase auth email link: signup verification,
// password-reset, and (if added later) magic links all redirect here with a `code` param plus a
// `next` param telling us where to send the user afterward. Both app/api/auth/signup/route.ts
// (emailRedirectTo: `${origin}/auth/callback?next=/`) and app/reset-password/page.tsx
// (redirectTo: `${origin}/auth/callback?next=/reset-password/confirm`) already point here.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");
  // Only ever a path on this site: an emailed link with `next=https://evil.example` (or
  // `//evil.example`, `@evil.example`) must never bounce a freshly signed-in user off-site.
  const next = safeNextPath(url.searchParams.get("next"));
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription)}`);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
