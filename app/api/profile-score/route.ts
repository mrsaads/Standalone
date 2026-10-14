import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { isTrustedOrigin } from "@/lib/http";
import { fetchPublicProfileSnapshot, type PublicProfileSnapshot } from "@/lib/upwork-fetch";
import { consume, refund, requestIdentity, type Bucket } from "@/lib/security/email-throttle";
import { privacyHash } from "@/lib/security/browser-id";
import {
  assembleResult, buildScoringPrompt, callScorer, leadSummary, measureOverview, measureTitle,
  parseAiScores, validateScoreRequest, ScoringError,
} from "@/lib/profile-score";

// The free public profile score. A signed-out visitor sends their Upwork link, their overview,
// email and WhatsApp number; we save them as a lead, read the public header of the profile, score
// it (lib/profile-score.ts) and return the score on the same page.
//
// Every request costs a model call, so it is rate limited per browser, per network address and per
// email address, and the limiter FAILS CLOSED: if it can't be checked, nothing is scored. (The
// enquiry form's limiter fails open because losing a lead is worse than a spam row; here the risk
// is an unbounded AI bill.) A failed scoring attempt gives the allowance back.

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });

function num(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function buckets(email: string): Promise<Bucket[]> {
  const identity = await requestIdentity();
  const lock = num("PROFILE_SCORE_LOCK_MINUTES", 60);
  const list: Bucket[] = [
    // Generous per network: many people in Pakistan share one carrier or campus address.
    { key: `score:ip:${identity.ipHash}`, rule: { limit: num("PROFILE_SCORE_IP_LIMIT", 20), windowMinutes: 60, lockMinutes: lock } },
    { key: `score:recipient:${await privacyHash("email", email)}`, rule: { limit: num("PROFILE_SCORE_EMAIL_LIMIT", 5), windowMinutes: 24 * 60, lockMinutes: lock } },
  ];
  if (identity.browserId) list.push({ key: `score:browser:${identity.browserId}`, rule: { limit: num("PROFILE_SCORE_BROWSER_LIMIT", 5), windowMinutes: 60, lockMinutes: lock } });
  return list;
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return json({ error: "Please use the score form on the Improvexus site." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request format." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 20000) return json({ error: "That's more text than an Upwork overview can hold. Paste only the overview section." }, 413);

  let input: unknown;
  try { input = await request.json(); } catch { return json({ error: "Your request could not be read. Please try again." }, 400); }
  const checked = validateScoreRequest(input);
  if (!checked.ok) return json({ error: checked.error, fields: checked.fields }, 400);
  const req = checked.value;
  if (req.honeypot) return json({ error: "This request could not be accepted." }, 400);

  // 1. Allowance.
  let bucketList: Bucket[];
  try {
    bucketList = await buckets(req.email);
    const gate = await consume(bucketList);
    if (!gate.ok) {
      const minutes = Math.max(1, Math.ceil(gate.retryAfterSeconds / 60));
      const who = gate.reason === "recipient" ? "this email address" : gate.reason === "browser" ? "this browser" : "your network";
      return json({ error: `You've used the free scores available for ${who} for now. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or open a full audit for the complete picture.` }, 429, { "Retry-After": String(gate.retryAfterSeconds) });
    }
  } catch (error) {
    console.error("Profile score: rate limiter unavailable, refusing to score", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Scoring is busy right now. Please try again in a minute." }, 503);
  }
  const giveBack = () => refund(bucketList).catch(() => {});

  // 2. The lead is saved before any scoring, so a contact is never lost to an Upwork or AI hiccup.
  //    The submission id makes a retried request reuse the same row.
  const db = getDb();
  try {
    await db.insert(leads).values({
      id: req.submissionId,
      name: "Profile score visitor",
      email: req.email,
      mobile: req.whatsapp,
      whatsapp: req.whatsapp,
      country: req.country,
      profileLink: req.profileUrl,
      goals: "Free profile score requested.",
      source: "profile_score",
      sourcePage: "/profile-score",
    }).onConflictDoNothing({ target: leads.id });
  } catch (error) {
    await giveBack();
    console.error("Profile score: lead could not be saved", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Your details could not be saved right now. Please try again." }, 503);
  }

  // 3. Public header of the profile. A failure is not fatal: the overview is still scored, and the
  //    parts we couldn't read are shown as "not checked".
  let snapshot: PublicProfileSnapshot | null = null;
  const fetched = await fetchPublicProfileSnapshot(req.profileUrl);
  if (fetched.ok) snapshot = fetched.snapshot;
  else console.info("Profile score: public profile not readable", fetched.outcome);

  // 4. Score. One retry if the model's answer isn't the JSON object we asked for.
  const om = measureOverview(req.overview);
  const tm = snapshot?.title ? measureTitle(snapshot.title) : null;
  const prompt = buildScoringPrompt(snapshot?.title ?? null, req.overview, tm, om, snapshot);
  let ai = null;
  try {
    for (let attempt = 0; attempt < 2 && !ai; attempt++) {
      const text = await callScorer(attempt === 0 ? prompt : `${prompt}\n\nYour previous answer was not the JSON object described. Return only that JSON object.`);
      ai = parseAiScores(text);
      if (!ai) console.error(`Profile score: model answer was not valid JSON (attempt ${attempt + 1})`);
    }
  } catch (error) {
    await giveBack();
    const diag = error instanceof ScoringError ? { message: error.message, ...error.diagnostics } : { message: error instanceof Error ? error.name : "UnknownError" };
    console.error("Profile score: AI scoring failed", diag);
    return json({ error: "We couldn't score your profile right now. Please try again in a minute." }, 502);
  }
  if (!ai) {
    await giveBack();
    return json({ error: "We couldn't score your profile right now. Please try again in a minute." }, 502);
  }

  const result = assembleResult(snapshot, ai, om);

  // 5. Record the outcome on the lead so the admin inbox shows the score next to the contact.
  await db.update(leads)
    .set({ name: (result.profile.name || "Profile score visitor").slice(0, 100), goals: leadSummary(result) })
    .where(eq(leads.id, req.submissionId))
    .catch(error => console.error("Profile score: lead summary update failed", error instanceof Error ? error.name : "UnknownError"));

  return json({ result });
}
