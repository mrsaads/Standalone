import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/http";
import { authJson, guardAuthEmail } from "@/lib/security/auth-guard";
import { refund } from "@/lib/security/email-throttle";

// Server-side replacement for the browser calling supabase.auth.resetPasswordForEmail() directly,
// so password-reset emails count toward the same per-browser limit as signup emails.
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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${resolveAppOrigin(request)}/auth/callback?next=/reset-password/confirm`,
  });
  if (error) {
    await refund(guard.buckets).catch(() => {});
    if (error.status === 429) return authJson({ error: "Our email service is busy right now. Please try again in a few minutes." }, 429);
    // Otherwise answer generically: never reveal whether an account exists for this address.
  }
  const quota = await guard.quotaAfter().catch(() => null);
  return authJson({ ok: true, quota });
}
