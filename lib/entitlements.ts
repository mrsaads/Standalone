import type { AppUser } from "./auth";

// Single source of truth for what a plan can do. Both API routes and the frontend import from
// here so the rule is defined once — the frontend uses it only to decide what UI to show, and every
// place that actually matters (report content sent over the wire, the export endpoint) enforces it
// itself server-side, never trusting the client's own idea of its plan. See
// app/api/audits/route.ts, app/api/audits/[id]/route.ts, and app/api/audits/[id]/export/route.ts.
export type EffectivePlan = "free" | "subscriber" | "admin";

export function effectivePlan(user: Pick<AppUser, "role" | "plan">): EffectivePlan {
  if (user.role === "admin") return "admin";
  return user.plan === "subscriber" ? "subscriber" : "free";
}

// Free accounts can review a full audit on-screen (the "preview") but cannot export the PDF/Word
// file. Subscriber and admin accounts can download.
export function canDownload(plan: EffectivePlan): boolean {
  return plan !== "free";
}

// The AI-generated "Optimization" section (suggested headline/overview) is a subscriber perk.
// Free-tier users see a locked teaser instead, with the option to request a human ("by person")
// optimization regardless of plan.
export function canViewOptimization(plan: EffectivePlan): boolean {
  return plan !== "free";
}

export type Entitlement = { plan: EffectivePlan; canDownload: boolean; canOptimize: boolean };

export function entitlementFor(user: Pick<AppUser, "role" | "plan">): Entitlement {
  const plan = effectivePlan(user);
  return { plan, canDownload: canDownload(plan), canOptimize: canViewOptimization(plan) };
}
