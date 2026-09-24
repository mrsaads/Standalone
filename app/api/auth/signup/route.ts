import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { isTrustedOrigin, resolveAppOrigin } from "@/lib/http";
import { authJson, guardAuthEmail } from "@/lib/security/auth-guard";
import { refund } from "@/lib/security/email-throttle";

const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(6).max(30),
  upworkLink: z.string().trim().max(300).optional().default(""),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200)
    .regex(/[A-Za-z]/, "Your password needs at least one letter.")
    .regex(/[0-9]/, "Your password needs at least one number."),
  // Honeypot: a field real visitors never see or fill. Bots that auto-fill every input do.
  website: z.string().max(300).optional().default(""),
  // Which workspace card the visitor picked before signing up, if any (see lib/destination.ts).
  // Purely a routing hint stored on the new profile row — never a grant of client-portal access.
  destination: z.enum(["audit", "client_portal"]).optional(),
});

const json = authJson;

function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export async function POST(request: Request) {
  // Matches the same-origin check on every other state-changing route in this app.
  if (!isTrustedOrigin(request)) return json({ error: "Start signup from this website." }, 403);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The signup request could not be read." }, 400); }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Check your signup details." }, 400);
  const { fullName, mobile, upworkLink, email, password, destination, website } = parsed.data;

  // Honeypot tripped: answer exactly like a real signup so the bot learns nothing, send nothing.
  if (website) return json({ needsVerification: true });

  // Per-browser (10 emails, then a 30-minute lock), per-network and per-recipient limits. Every
  // signup sends a verification email, so every signup counts. See lib/security/email-throttle.ts.
  const guard = await guardAuthEmail(request, email);
  if (!guard.ok) return guard.response;

  const origin = resolveAppOrigin(request);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });
  if (error) {
    // Supabase refused before sending anything (bad input, its own rate limit) — don't charge
    // this browser for an email that never went out.
    await refund(guard.buckets).catch(() => {});
    if (error.status === 429) return json({ error: "Our email service is busy right now. Please try again in a few minutes." }, 429);
    return json({ error: error.message }, 400);
  }
  if (!data.user) {
    await refund(guard.buckets).catch(() => {});
    return json({ error: "Signup could not be completed. Please try again." }, 500);
  }

  // Store the extended profile fields (mobile, Upwork link) immediately, keyed to the new
  // auth.users id. getDb() connects directly to Postgres (not through PostgREST), so this insert
  // runs before the customer has any session — exactly what's needed since email confirmation
  // means there's no signed-in user yet to satisfy an RLS "auth.uid() = id" policy.
  try {
    const db = getDb();
    await db.insert(profiles).values({
      id: data.user.id,
      email,
      fullName,
      mobile,
      upworkLink,
      role: isAdminEmail(email) ? "admin" : "base",
      preferredDestination: destination ?? "",
    }).onConflictDoUpdate({
      target: profiles.id,
      set: { fullName, mobile, upworkLink },
    });
  } catch (dbError) {
    console.error("Profile row creation failed after signup", dbError instanceof Error ? dbError.name : "UnknownError");
    // Don't fail the whole signup over this — the account exists in Supabase Auth either way;
    // a missing profile row is repaired the next time getCurrentUser() runs against it, since
    // the signup form is the only place these fields are collected today. Surfacing this in logs
    // is enough to catch it without blocking the customer's account creation.
  }

  const needsVerification = !data.session;
  const quota = await guard.quotaAfter().catch(() => null);
  return json({ needsVerification, quota });
}
