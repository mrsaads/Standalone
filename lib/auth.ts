import { createSupabaseServerClient } from "./supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSubscriptionExpired } from "./entitlements";

export type AppUser = {
  id: string; // Supabase auth.users.id
  email: string;
  fullName: string;
  mobile: string;
  upworkLink: string;
  role: "base" | "admin";
  // Manually set by an admin from the admin panel (see lib/entitlements.ts) — irrelevant for an
  // admin account, which always gets full access regardless of this value. This is the RAW stored
  // value; a "subscriber" row whose planUpdatedAt is more than 30 days old is already normalized to
  // "free" by the time this object is built (see the write-back below) — effectivePlan() in
  // lib/entitlements.ts re-derives the same thing from planUpdatedAt as a defense-in-depth check,
  // but callers reading `plan` directly off AppUser can trust it's already current.
  plan: "free" | "subscriber";
  // When `plan` was last set — the start of the current 30-day subscription grant. See
  // SUBSCRIPTION_PERIOD_DAYS in lib/entitlements.ts.
  planUpdatedAt: Date;
  // Routing hint only — see lib/destination.ts. "" means no stored preference yet.
  preferredDestination: "" | "audit" | "client_portal";
};

// The ONLY account that can ever be admin purely by configuration — matching this env var is what
// makes an account the "super admin" who can grant or revoke admin access for anyone else (see
// app/api/admin/users/[id]/role/route.ts). Everyone else's admin status lives in profiles.role,
// which only that super-admin endpoint can change. Exported so the signup route and the role-grant
// endpoint share this exact check rather than keeping their own copies that can drift apart.
export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

// Replaces app/chatgpt-auth.ts's getChatGPTUser(): resolves the signed-in customer from the
// Supabase session (not a platform-injected header) plus their extended profile row. Returns null
// when signed out, exactly like the function it replaces, so call sites don't need to change their
// null-check shape.
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email) return null;

  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

  let plan: "free" | "subscriber" = profile?.plan === "subscriber" ? "subscriber" : "free";
  let planUpdatedAt = profile?.planUpdatedAt ?? new Date(0);
  if (plan === "subscriber" && isSubscriptionExpired(planUpdatedAt)) {
    // The 30-day grant ran out. Degrade this session to free immediately (never wait on a cron that
    // doesn't exist), and best-effort write it back so profiles.plan stops lying to the admin
    // panel's own direct query (app/admin/page.tsx) the next time this account is active. Never
    // blocks sign-in if the write fails.
    plan = "free";
    try {
      planUpdatedAt = new Date();
      await db.update(profiles).set({ plan: "free", planUpdatedAt }).where(eq(profiles.id, user.id));
    } catch (writeError) {
      console.error("Subscription expiry write-back failed", writeError instanceof Error ? writeError.name : "UnknownError");
    }
  }

  const admin = isAdminEmail(user.email) || profile?.role === "admin";
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.fullName || (user.user_metadata?.full_name as string | undefined) || "",
    mobile: profile?.mobile || "",
    upworkLink: profile?.upworkLink || "",
    role: admin ? "admin" : "base",
    plan,
    planUpdatedAt,
    preferredDestination: profile?.preferredDestination === "audit" || profile?.preferredDestination === "client_portal" ? profile.preferredDestination : "",
  };
}

export async function requireCurrentUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError();
  return user;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "AuthRequiredError";
  }
}
