import { createSupabaseServerClient } from "./supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

import type { AuditEntitlement } from "./entitlements";

export type AppUser = {
  id: string; // Supabase auth.users.id
  email: string;
  fullName: string;
  mobile: string;
  upworkLink: string;
  // AXIS 1 — account role.
  role: "base" | "admin";
  // AXIS 2 — audit entitlement. Manually set by an admin from the admin panel (see
  // lib/entitlements.ts) — irrelevant for an admin account, which always gets full audit access
  // regardless of this value. Deliberately says nothing about managed-client access (AXIS 3),
  // which is not carried on AppUser at all: it is per-workspace, so it is resolved per request by
  // lib/workspace-access.ts rather than being a property of the user.
  auditEntitlement: AuditEntitlement;
  auditCredits: number;
  auditCreditsUsed: number;
  marketingOptIn: boolean;
};

// The ONLY account that can ever be admin purely by configuration — matching this env var is what
// makes an account the "super admin" who can grant or revoke admin access for anyone else (see
// app/api/admin/users/[id]/role/route.ts). Everyone else's admin status lives in profiles.role,
// which only that super-admin endpoint can change. Exported so the signup route and the role-grant
// endpoint can share this exact check rather than keeping their own copies that can drift apart.
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

  const admin = isAdminEmail(user.email) || profile?.role === "admin";
  const stored = profile?.auditEntitlement;
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.fullName || (user.user_metadata?.full_name as string | undefined) || "",
    mobile: profile?.mobile || "",
    upworkLink: profile?.upworkLink || "",
    role: admin ? "admin" : "base",
    // Anything unrecognized falls back to the least-privileged value rather than being trusted —
    // a typo or a future value this build doesn't know about must never read as more access.
    auditEntitlement: stored === "subscribed" || stored === "admin_granted" ? stored : "free",
    auditCredits: profile?.auditCredits ?? 0,
    auditCreditsUsed: profile?.auditCreditsUsed ?? 0,
    marketingOptIn: profile?.marketingOptIn ?? true,
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
