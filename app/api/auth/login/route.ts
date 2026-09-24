import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTrustedOrigin } from "@/lib/http";
import { authJson } from "@/lib/security/auth-guard";
import { clear, consume, lockedMessage, loginBuckets, peek, requestIdentity } from "@/lib/security/email-throttle";

// Password sign-in, moved server-side so repeated wrong passwords can be locked out:
// 10 failures from one browser, or 10 against one account, locks for 15 minutes.
// A successful sign-in clears that browser's and that account's failure count.
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return authJson({ error: "Please sign in from the Improvexus website." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return authJson({ error: "The request could not be read." }, 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return authJson({ error: "Enter your email and password." }, 400);
  const { email, password } = parsed.data;

  const identity = await requestIdentity();
  if (!identity.browserId) return authJson({ error: "Your browser session could not be verified. Enable cookies and reload the page, then try again." }, 400);
  const buckets = await loginBuckets({ ...identity, browserId: identity.browserId }, email);

  try {
    const status = await peek(buckets);
    if (!status.ok) {
      return authJson({ error: lockedMessage(status, "login"), code: "LOGIN_LOCKED", retryAfterSeconds: status.retryAfterSeconds, lockedUntil: status.lockedUntil }, 429, { "Retry-After": String(status.retryAfterSeconds) });
    }
  } catch (error) {
    console.error("Login throttle unavailable", error instanceof Error ? error.message : "UnknownError");
    return authJson({ error: "Sign-in is temporarily unavailable. Please try again in a few minutes." }, 503);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const unconfirmed = /not confirmed/i.test(error.message);
    if (!unconfirmed) {
      const result = await consume(buckets).catch(() => ({ ok: true as const }));
      if (!result.ok) {
        return authJson({ error: lockedMessage(result, "login"), code: "LOGIN_LOCKED", retryAfterSeconds: result.retryAfterSeconds, lockedUntil: result.lockedUntil }, 429, { "Retry-After": String(result.retryAfterSeconds) });
      }
    }
    return authJson({ error: unconfirmed ? "Your email isn't verified yet. Check your inbox, or resend the verification email." : "Incorrect email or password.", code: unconfirmed ? "EMAIL_NOT_CONFIRMED" : "INVALID_CREDENTIALS" }, 401);
  }

  await clear(buckets.filter(b => !b.key.startsWith("login:ip:"))).catch(() => {});
  return authJson({ ok: true });
}
