import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { profileAudits } from "@/db/schema";
import type { AuditReport } from "@/lib/audit-report";
import { entitlementFor } from "@/lib/entitlements";
import { applyAuditAccess } from "@/lib/audit-access";

const headers = { "Cache-Control": "no-store" };

// Backs the "audit-ready" email's link and the saved-audits list: given an audit id, returns the
// full stored report JSON so app/page.tsx can reopen it exactly as generated (see the
// `?openAudit=` handling there), without re-running AI or touching the weekly allowance. Scoped to
// the audit's own owner or an admin — never any signed-in user.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(profileAudits).where(eq(profileAudits.id, id)).limit(1);
  if (!row) return Response.json({ error: "Audit not found." }, { status: 404, headers });
  if (row.userId !== user.id && user.role !== "admin") return Response.json({ error: "Audit not found." }, { status: 404, headers });
  // A "reserved" row (AI call still running) or "failed" row (released allowance) has no real
  // report behind it — reportJson is "" by default (see db/schema.ts) and JSON.parse("") throws,
  // so this must be checked explicitly rather than left to fail as an unhandled 500.
  if (row.status !== "completed") return Response.json({ error: "This audit has not finished generating." }, { status: 409, headers });
  const report = JSON.parse(row.reportJson) as AuditReport;
  const entitlement = entitlementFor(user);
  // The SAME redaction as the generation endpoint, from the same function — this route is how the
  // "audit ready" email's ?openAudit= link and the saved-audits list reopen a report, so a free
  // account that generated an audit while paying, or that simply keeps the old link, must get the
  // same limited payload here. A paywall applied on generation but not on reopen is a paywall with
  // a permanent URL past it sitting in somebody's inbox.
  const { audit, access } = applyAuditAccess(report, entitlement);
  return Response.json({ audit, access, entitlement }, { headers });
}
