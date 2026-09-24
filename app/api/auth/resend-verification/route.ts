import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/http";
import { authJson, guardAuthEmail } from "@/lib/security/auth-guard";
import { refund } from "@/lib/security/email-throttle";

// Server-side replacement for the browser calling supabase.auth.resend() directly. Going through
// the server is what lets the per-browser email limit apply — a browser-side call would reach
// Supabase without ever passing our counter.
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return authJson({ error: "The request could not be read." }, 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return authJson({ error: "Enter a valid email address." }, 400);
  const { email } = parsed.data;

  const guard = await guardAuthEmail(request, email);
  if (!guard.ok) return guard.response;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${resolveAppOrigin(request)}/auth/callback?next=/` },
  });
  if (error) {
    await refund(guard.buckets).catch(() => {});
    if (error.status === 429) return authJson({ error: "Our email service is busy right now. Please try again in a few minutes." }, 429);
    // Anything else: answer generically so this form can't be used to probe which emails exist.
  }
  const quota = await guard.quotaAfter().catch(() => null);
  return authJson({ ok: true, quota });
}
