import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads } from "@/db/schema";

export const leadSchema = z.object({
  submissionId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  profileLink: z.string().trim().max(500).optional().default(""),
  goals: z.string().trim().max(1200).optional().default(""),
  source: z.enum(["landing_audit", "landing_client_portal", "landing_general", "client_portal_access_request"]),
  consent: z.literal(true),
  website: z.string().max(200), // honeypot — must stay empty
}).strict();

// A lead is a marketing/enquiry record only. It is never, by itself, a login account or a
// workspace_members grant — an admin reviewing it decides that separately. See db/schema.ts.
export async function saveLead(input: unknown, userId: string | null) {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "Check your name, email, and consent." } };
  const data = parsed.data;
  if (data.website) return { status: 400, body: { error: "This request could not be accepted." } };

  const db = getDb();
  const [existing] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, data.submissionId)).limit(1);
  if (existing) return { status: 200, body: { reference: existing.id } };

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(leads)
    .where(and(eq(leads.email, data.email), gte(leads.createdAt, sql`now() - interval '1 day'`)));
  if (count >= 5) return { status: 429, body: { error: "A request has already been submitted several times with this email today. Please try again tomorrow." } };

  await db.insert(leads).values({
    id: data.submissionId,
    name: data.name,
    email: data.email,
    profileLink: data.profileLink,
    goals: data.goals,
    source: data.source,
    userId: userId ?? undefined,
  }).onConflictDoNothing({ target: leads.id });

  const [saved] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, data.submissionId)).limit(1);
  if (saved) return { status: 201, body: { reference: saved.id } };
  return { status: 429, body: { error: "A request has already been submitted several times with this email today. Please try again tomorrow." } };
}
