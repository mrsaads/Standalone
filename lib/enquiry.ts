import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { assess, profileSchema } from "./audit";
import { getDb } from "@/db";
import { enquiries } from "@/db/schema";

export const enquirySchema = z.object({
  submissionId: z.string().uuid(), name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  budget: z.string().trim().max(100), challenge: z.string().trim().max(1200), intent: z.enum(["exploring", "one_time", "ongoing"]), consent: z.literal(true), website: z.string().max(200), profile: profileSchema,
}).strict();

// Ported from the D1 version: the client generates `submissionId` as an idempotency key, so a
// retried submit (network retry, double-click) never creates a duplicate enquiry row. The daily
// per-email cap (3/day) is enforced with a row count rather than a D1 conditional INSERT, since
// pg has no equivalent to SQLite's "INSERT ... WHERE (subquery)" — the count-then-insert has a
// small race window, closed by the ON CONFLICT DO NOTHING + re-check below exactly as before.
export async function saveEnquiry(input: unknown) {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "Check your contact details, consent, and all six audit answers." } };
  const data = parsed.data;
  if (data.website) return { status: 400, body: { error: "This enquiry could not be accepted." } };

  const db = getDb();
  const [existing] = await db.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, data.submissionId)).limit(1);
  if (existing) return { status: 200, body: { reference: existing.id } };

  const result = assess(data.profile);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(enquiries)
    .where(and(eq(enquiries.email, data.email), gte(enquiries.createdAt, sql`now() - interval '1 day'`)));
  if (count >= 3) return { status: 429, body: { error: "An enquiry has already been submitted several times with this email today. Please try again tomorrow." } };

  try {
    await db.insert(enquiries).values({
      id: data.submissionId,
      name: data.name,
      email: data.email,
      platform: data.profile.platform,
      service: data.profile.service,
      buyer: data.profile.buyer,
      budget: data.budget,
      intent: data.intent,
      challenge: data.challenge,
      profileJson: JSON.stringify(data.profile),
      score: result.earned,
      unknownPoints: result.unknownPoints,
      recommendation: result.route,
      consent: true,
    }).onConflictDoNothing({ target: enquiries.id });
  } catch (error) {
    throw error;
  }

  const [saved] = await db.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, data.submissionId)).limit(1);
  if (saved) return { status: 201, body: { reference: saved.id } };
  return { status: 429, body: { error: "An enquiry has already been submitted several times with this email today. Please try again tomorrow." } };
}
