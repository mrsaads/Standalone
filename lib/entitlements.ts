import type { AppUser } from "./auth";

// Single source of truth for what an AUDIT ENTITLEMENT can do. Both API routes and the frontend
// import from here so the rule is defined once — the frontend uses it only to decide what UI to
// show, and every place that actually matters (report content sent over the wire, the export
// endpoint) enforces it itself server-side, never trusting the client's own idea of its
// entitlement. See app/api/audits/route.ts, app/api/audits/[id]/route.ts, and
// app/api/audits/[id]/export/route.ts.
//
// SCOPE NOTE — this file is about AXIS 2 ONLY (see db/schema.ts). It decides nothing about the
// managed-client portal: a subscriber has no portal access, and a managed client needs no audit
// entitlement to read their weekly reports. Portal access lives entirely in lib/workspace-access.ts
// and the two are deliberately never consulted together.

// The stored entitlement values, as they appear in profiles.audit_entitlement.
export type AuditEntitlement = "free" | "subscribed" | "admin_granted";

// The resolved level, after the account role is taken into account. "admin" is not a stored
// entitlement — it is what an admin account resolves to regardless of what is stored.
export type EffectivePlan = "free" | "subscribed" | "admin_granted" | "admin";

export function effectivePlan(user: Pick<AppUser, "role" | "auditEntitlement">): EffectivePlan {
  if (user.role === "admin") return "admin";
  if (user.auditEntitlement === "subscribed") return "subscribed";
  if (user.auditEntitlement === "admin_granted") return "admin_granted";
  return "free";
}

// Free accounts can review a full audit on-screen (the "preview") but cannot export the PDF/Word
// file. Everything above free can download.
export function canDownload(plan: EffectivePlan): boolean {
  return plan !== "free";
}

// The AI-generated "Optimization" section (suggested headline/overview) is not available on the
// free tier. Free-tier users see a locked teaser instead, with the option to request a human
// ("by person") optimization regardless of entitlement.
export function canViewOptimization(plan: EffectivePlan): boolean {
  return plan !== "free";
}

// How many audit credits this account has left. Credits are an admin-configured allowance, spent
// only once the rolling weekly allowance is already used up (see lib/audit-limit.ts) — they are not
// a purchased product and nothing in the app sells them.
export function creditsRemaining(user: Pick<AppUser, "auditCredits" | "auditCreditsUsed">): number {
  return Math.max(0, user.auditCredits - user.auditCreditsUsed);
}

export type Entitlement = {
  plan: EffectivePlan;
  canDownload: boolean;
  canOptimize: boolean;
  creditsRemaining: number;
  // True when this account is never subject to the rolling weekly allowance at all.
  unlimited: boolean;
};

export function entitlementFor(
  user: Pick<AppUser, "role" | "auditEntitlement" | "auditCredits" | "auditCreditsUsed">,
): Entitlement {
  const plan = effectivePlan(user);
  return {
    plan,
    canDownload: canDownload(plan),
    canOptimize: canViewOptimization(plan),
    creditsRemaining: creditsRemaining(user),
    unlimited: plan === "admin",
  };
}

// Human-readable label for the entitlement, used on the dashboard and in the admin panel. Kept
// here so the wording cannot drift between the two screens.
export function entitlementLabel(plan: EffectivePlan): string {
  switch (plan) {
    case "admin": return "Administrator — unlimited";
    case "subscribed": return "Subscribed";
    case "admin_granted": return "Granted by Improvexus";
    default: return "Free";
  }
}
