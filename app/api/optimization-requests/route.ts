import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { optimizationRequests, profileAudits } from "@/db/schema";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

const requestSchema = z.object({
  auditId: z.string().uuid().optional(),
  profileUrl: z.string().max(1000).default(""),
  notes: z.string().trim().min(1).max(1200),
}).strict();

const DAILY_CAP = 5;

// "Request optimization by a person" — a signed-in user, any plan, can ask Improvexus to do the
// headline/overview optimization by hand instead of (free tier) or in addition to (subscriber) the
// AI-generated version. This intentionally does not touch the weekly audit allowance or any AI
// provider — it only records a lead the admin panel's optimization-request queue can act on.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to request optimization." }, 401);
  if (!isTrustedOrigin(request)) return json({ error: "Start this request from the audit page." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Add a short note about what you'd like optimized." }, 400);

  const db = getDb();

  // If an auditId was supplied, it must actually belong to this user (or the account is admin) —
  // never take an arbitrary id from the client at face value and store it as if it were verified.
  if (parsed.data.auditId) {
    const [audit] = await db.select({ userId: profileAudits.userId }).from(profileAudits).where(eq(profileAudits.id, parsed.data.auditId)).limit(1);
    if (!audit || (audit.userId !== user.id && user.role !== "admin")) {
      return json({ error: "That audit could not be found on your account." }, 404);
    }
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(optimizationRequests)
    .where(and(eq(optimizationRequests.userId, user.id), gte(optimizationRequests.createdAt, sql`now() - interval '1 day'`)));
  if (count >= DAILY_CAP) return json({ error: "You've already sent several optimization requests today. Please try again tomorrow." }, 429);

  try {
    const [saved] = await db.insert(optimizationRequests).values({
      userId: user.id,
      userEmail: user.email,
      auditId: parsed.data.auditId,
      profileUrl: parsed.data.profileUrl,
      notes: parsed.data.notes,
    }).returning({ id: optimizationRequests.id });
    return json({ reference: saved.id }, 201);
  } catch (error) {
    console.error("Optimization request storage failure", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Your request could not be saved right now. Please try again." }, 503);
  }
}
