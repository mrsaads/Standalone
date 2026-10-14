import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { dialCountry } from "@/lib/marketing/dial-codes";

// The public enquiry form (landing page, service pages, location pages).
//
// EVERY field is mandatory, and that is enforced HERE, on the server. `required` on an <input> is a
// hint to a browser; a script posting straight to /api/leads never sees it. The form shows the same
// messages this file returns, per field, so the two cannot drift apart.

export const LEAD_SOURCES = [
  "landing_audit",
  "landing_client_portal",
  "landing_general",
  "landing_service",
  "landing_location",
  "client_portal_access_request",
  // The free profile score (app/api/profile-score). Saved by that route directly, never through
  // /api/leads, so the enquiry form cannot be submitted with this source.
  "profile_score",
] as const;

export const GOALS_MIN = 20;
export const GOALS_MAX = 1200;

// ---- phone numbers -----------------------------------------------------------------------------
// The person picks their country (which fixes the calling code) and types the rest. We keep digits
// only, drop the national trunk "0" people habitually type (0300… in Pakistan, 07… in the UK) because
// it is never dialled after a country code, and store "+<code> <number>". The only country where a
// leading 0 is part of the number is Italy, and there only for landlines — left untouched for IT.
export type PhoneResult = { ok: true; value: string; e164: string } | { ok: false; message: string };

export function normalizePhone(countryIso: unknown, rawNumber: unknown, label: string): PhoneResult {
  const country = typeof countryIso === "string" ? dialCountry(countryIso) : undefined;
  if (!country) return { ok: false, message: `Choose the country code for your ${label}.` };
  if (typeof rawNumber !== "string" || !rawNumber.trim()) return { ok: false, message: `Enter your ${label}.` };
  if (!/^[\d\s().\-]+$/.test(rawNumber.trim())) return { ok: false, message: `Your ${label} can only contain digits, spaces and hyphens. Pick the country code from the list.` };
  let digits = rawNumber.replace(/\D/g, "");
  if (country.iso !== "IT") digits = digits.replace(/^0+/, "");
  if (digits.length < 4) return { ok: false, message: `That ${label} is too short.` };
  // E.164: at most 15 digits including the country code.
  if (digits.length + country.dial.length > 15) return { ok: false, message: `That ${label} is too long for ${country.name}.` };
  return { ok: true, value: `+${country.dial} ${digits}`, e164: `${country.dial}${digits}` };
}

// ---- Upwork profile link -----------------------------------------------------------------------
// A real Upwork profile or agency page, over https. A link pasted without the scheme
// ("www.upwork.com/freelancers/~01abc" — the commonest real paste) gets https:// prepended and is
// STORED with it, so clicking it in the admin inbox opens Upwork rather than a broken relative URL.
export function normalizeUpworkLink(raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, message: "Paste the link to your Upwork profile." };
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    const hostOk = url.hostname === "upwork.com" || url.hostname === "www.upwork.com";
    const pathOk = /^\/(freelancers|fl|agencies|ag)\/[^/]+/.test(url.pathname);
    if (url.protocol !== "https:" || url.username || url.password || !hostOk || !pathOk) {
      return { ok: false, message: "That doesn't look like an Upwork profile link. It should look like https://www.upwork.com/freelancers/~01…" };
    }
    return { ok: true, value: url.toString().slice(0, 500) };
  } catch {
    return { ok: false, message: "That doesn't look like an Upwork profile link. It should look like https://www.upwork.com/freelancers/~01…" };
  }
}

const shape = z.object({
  submissionId: z.string().uuid(),
  name: z.string().max(100),
  email: z.string().max(254),
  mobileCountry: z.string().max(2),
  mobileNumber: z.string().max(40),
  whatsappCountry: z.string().max(2),
  whatsappNumber: z.string().max(40),
  profileLink: z.string().max(500),
  goals: z.string().max(GOALS_MAX + 200),
  source: z.enum(LEAD_SOURCES).refine(source => source !== "profile_score"),
  // Which page the form was on (a path on this site), so an admin can see what the person was
  // reading. Optional and never trusted for anything but display.
  sourcePage: z.string().max(200).optional().default(""),
  consent: z.boolean(),
  website: z.string().max(200), // honeypot — must stay empty
}).strict();

export type LeadFieldErrors = Partial<Record<"name" | "email" | "mobile" | "whatsapp" | "profileLink" | "goals" | "consent", string>>;
type LeadResult = { status: number; body: { reference?: string; error?: string; fields?: LeadFieldErrors; retryAfterSeconds?: number } };

export type ValidLead = {
  submissionId: string; name: string; email: string; mobile: string; whatsapp: string; country: string;
  profileLink: string; goals: string; source: (typeof LEAD_SOURCES)[number]; sourcePage: string;
};

/** Pure validation — no database. Exported so it can be tested (and reused) on its own. */
export function validateLead(input: unknown): { ok: true; lead: ValidLead; honeypot: boolean } | { ok: false; fields: LeadFieldErrors; error: string } {
  const parsed = shape.safeParse(input);
  if (!parsed.success) return { ok: false, fields: {}, error: "Your request could not be read. Reload the page and try again." };
  const d = parsed.data;
  const fields: LeadFieldErrors = {};

  const name = d.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) fields.name = "Enter your name.";

  const email = d.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) fields.email = "Enter a valid email address.";

  const mobile = normalizePhone(d.mobileCountry, d.mobileNumber, "mobile number");
  if (!mobile.ok) fields.mobile = mobile.message;

  const whatsapp = normalizePhone(d.whatsappCountry, d.whatsappNumber, "WhatsApp number");
  if (!whatsapp.ok) fields.whatsapp = whatsapp.message;

  const link = normalizeUpworkLink(d.profileLink);
  if (!link.ok) fields.profileLink = link.message;

  const goals = d.goals.trim();
  if (goals.length < GOALS_MIN) fields.goals = `Tell us a bit more about what you want help with. We need at least ${GOALS_MIN} characters to give you a useful answer.`;
  else if (goals.length > GOALS_MAX) fields.goals = `Please keep this under ${GOALS_MAX} characters.`;

  if (d.consent !== true) fields.consent = "Please agree to share your details so Improvexus can contact you.";

  const count = Object.keys(fields).length;
  if (count > 0 || !mobile.ok || !whatsapp.ok || !link.ok) {
    return { ok: false, fields, error: count === 1 ? "1 field above needs fixing." : `${count} fields above need fixing.` };
  }
  const sourcePage = d.sourcePage.startsWith("/") && !d.sourcePage.startsWith("//") ? d.sourcePage.slice(0, 200) : "";
  return {
    ok: true,
    honeypot: d.website.length > 0,
    lead: { submissionId: d.submissionId, name, email, mobile: mobile.value, whatsapp: whatsapp.value, country: d.mobileCountry.toUpperCase(), profileLink: link.value, goals, source: d.source, sourcePage },
  };
}

// A lead is a marketing/enquiry record only. It is never, by itself, a login account or a
// workspace_members grant — an admin reviewing it decides that separately. See db/schema.ts.
/**
 * `allow` is the abuse gate (see lib/security/lead-throttle.ts). It runs only for a submission that
 * is valid, is not a repeat of one already saved, and is about to be written — so fixing a field
 * error and resubmitting, or a retried request, never uses up someone's allowance.
 */
export async function saveLead(input: unknown, userId: string | null, allow?: () => Promise<{ ok: true } | { ok: false; retryAfterSeconds: number; message: string }>): Promise<LeadResult> {
  const checked = validateLead(input);
  if (!checked.ok) return { status: 400, body: { error: checked.error, fields: checked.fields } };
  if (checked.honeypot) return { status: 400, body: { error: "This request could not be accepted." } };
  const data = checked.lead;

  const db = getDb();
  const [existing] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, data.submissionId)).limit(1);
  if (existing) return { status: 200, body: { reference: existing.id } };

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(leads)
    .where(and(eq(leads.email, data.email), gte(leads.createdAt, sql`now() - interval '1 day'`)));
  if (count >= 5) return { status: 429, body: { error: "A request has already been submitted several times with this email today. Please try again tomorrow." } };

  if (allow) {
    const gate = await allow();
    if (!gate.ok) return { status: 429, body: { error: gate.message, retryAfterSeconds: gate.retryAfterSeconds } };
  }

  await db.insert(leads).values({
    id: data.submissionId,
    name: data.name,
    email: data.email,
    mobile: data.mobile,
    whatsapp: data.whatsapp,
    country: data.country,
    profileLink: data.profileLink,
    goals: data.goals,
    source: data.source,
    sourcePage: data.sourcePage,
    userId: userId ?? undefined,
  }).onConflictDoNothing({ target: leads.id });

  const [saved] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, data.submissionId)).limit(1);
  if (saved) return { status: 201, body: { reference: saved.id } };
  return { status: 429, body: { error: "A request has already been submitted several times with this email today. Please try again tomorrow." } };
}
