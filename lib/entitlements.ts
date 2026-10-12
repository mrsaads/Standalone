import type { AppUser } from "./auth";
import { criterionIds, type AuditReport } from "./audit-report";

// Single source of truth for what a plan can do. Both API routes and the frontend import from
// here so the rule is defined once — the frontend uses it only to decide what UI to show, and every
// place that actually matters (report content sent over the wire, the export endpoint, the audit
// allowance itself) enforces it again server-side, never trusting the client's own idea of its plan.
// See app/api/audits/route.ts, app/api/audits/[id]/route.ts, app/api/audits/[id]/export/route.ts,
// and lib/audit-limit.ts.
export type EffectivePlan = "free" | "subscriber" | "admin";

// A manually-granted "subscriber" plan (see app/api/admin/users/[id]/plan/route.ts) is a 30-day
// grant from the moment it was set, not a permanent state — "after a month the paid tier shifts
// back to the free user" is the product requirement this encodes. There is no payment provider to
// renew it automatically, so an admin re-applies the plan to extend it. This is checked lazily
// (computed on every read) rather than relying on a cron job to flip the row, so it's correct even
// if nothing else ever runs — see getCurrentUser() in lib/auth.ts for the accompanying best-effort
// write-back that keeps the stored row consistent with this for the admin panel's own direct query.
export const SUBSCRIPTION_PERIOD_DAYS = 30;

export function isSubscriptionExpired(planUpdatedAt: Date): boolean {
  return Date.now() - planUpdatedAt.getTime() > SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}

export function effectivePlan(user: Pick<AppUser, "role" | "plan" | "planUpdatedAt">): EffectivePlan {
  if (user.role === "admin") return "admin";
  if (user.plan === "subscriber" && !isSubscriptionExpired(user.planUpdatedAt)) return "subscriber";
  return "free";
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

// How many audits a plan may generate in the rolling window lib/audit-limit.ts enforces (see
// ALLOWANCE_WINDOW_DAYS there — currently the same 30 days as the subscription period above, though
// the two are independent concepts that happen to share a number). null = unlimited.
export function monthlyAuditLimit(plan: EffectivePlan): number | null {
  if (plan === "admin") return null;
  return plan === "subscriber" ? 4 : 1;
}

export type Entitlement = { plan: EffectivePlan; canDownload: boolean; canOptimize: boolean };

export function entitlementFor(user: Pick<AppUser, "role" | "plan" | "planUpdatedAt">): Entitlement {
  const plan = effectivePlan(user);
  return { plan, canDownload: canDownload(plan), canOptimize: canViewOptimization(plan) };
}

// Free-tier users see this fraction of the 23-point rubric in full; the rest is shown only as a
// locked placeholder (title/section/status visible, the actual note/evidence/action withheld) —
// the "free sees 30%, the other 70% unlocks after paying" requirement. Picking the first N in the
// rubric's own canonical order (rather than, say, the worst N) is deliberate: it's deterministic and
// doesn't require a judgment call about which findings are "worth" showing for free.
const FREE_VISIBLE_FINDING_COUNT = 7; // ~30% of 23
export const FREE_VISIBLE_FINDING_IDS: ReadonlySet<string> = new Set(criterionIds.slice(0, FREE_VISIBLE_FINDING_COUNT));

export function redactFindingsForPlan<F extends { id: string; note: string; evidence: string; action?: string }>(
  findings: F[],
  plan: EffectivePlan,
): (F & { locked?: boolean })[] {
  if (plan !== "free") return findings;
  return findings.map(finding =>
    FREE_VISIBLE_FINDING_IDS.has(finding.id)
      ? finding
      : { ...finding, note: "", evidence: "", action: "", locked: true },
  );
}

// The one place that redacts a stored report for the wire, for both the fresh-generation response
// (app/api/audits/route.ts) and every later reopen of the same report (app/api/audits/[id]/route.ts,
// the "audit ready" email's ?openAudit= link, the saved-audits list) — they must apply identical
// gating, not two hand-maintained copies that can drift apart. The FULL report (including
// suggestedHeadline/suggestedOverview and every finding's detail) is always written to the database
// as-is, so an upgrade later never requires regenerating anything; only what leaves the server over
// the wire is cut down by plan.
export function applyReportEntitlement(report: AuditReport, entitlement: Entitlement): AuditReport {
  const withOptimization = entitlement.canOptimize ? report : { ...report, suggestedHeadline: "", suggestedOverview: "" };
  return { ...withOptimization, findings: redactFindingsForPlan(withOptimization.findings, entitlement.plan) };
}
