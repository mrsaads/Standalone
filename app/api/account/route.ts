import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { profileAudits } from "@/db/schema";
import { entitlementFor } from "@/lib/entitlements";
import { isAssignedClient } from "@/lib/destination";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const db = getDb();
    const [usage] = await db.select({ audits: sql<number>`count(*)::int` }).from(profileAudits)
      .where(and(eq(profileAudits.userId, user.id), eq(profileAudits.billable, true), gte(profileAudits.createdAt, sql`now() - interval '7 days'`)));
    const rows = await db.select({
      id: profileAudits.id,
      profileName: profileAudits.profileName,
      score: profileAudits.score,
      passCount: profileAudits.passCount,
      weakCount: profileAudits.weakCount,
      failCount: profileAudits.failCount,
      provider: profileAudits.provider,
      createdAt: profileAudits.createdAt,
      // Only rows that actually finished generating — a "reserved" row (AI call still in flight,
      // profileName/score not populated yet) or "failed" row (released allowance, no real report
      // behind it) should never appear in the customer's own history list.
    }).from(profileAudits).where(and(eq(profileAudits.userId, user.id), eq(profileAudits.status, "completed"))).orderBy(desc(profileAudits.createdAt)).limit(8);
    const entitlement = entitlementFor(user);
    // Backs the small workspace switcher shown inside /audit and /client-portal (spec: "keep a
    // workspace switcher ... for users who have access to both areas") — never used to decide
    // access itself, only whether to show the nav link.
    const hasClientPortalAccess = user.role === "admin" ? false : await isAssignedClient(user.id);
    return Response.json({
      account: { email: user.email, role: user.role, plan: entitlement.plan, auditsLast7Days: Number(usage?.audits || 0), weeklyLimit: user.role === "admin" ? null : 1, hasClientPortalAccess },
      entitlement,
      audits: rows,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Account summary failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Account information is temporarily unavailable." }, { status: 503 });
  }
}
