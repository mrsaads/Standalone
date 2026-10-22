import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { isTrustedOrigin } from "@/lib/http";
import { CONNECTION_COOKIE, restoreEvidence, takeEvidence, type EvidenceClaim } from "@/lib/upwork-connected";
import { fetchPublicProfileSnapshot, type PublicProfileSnapshot, type PublicSnapshotResult } from "@/lib/upwork-fetch";
import { consume, refund, requestIdentity, type Bucket } from "@/lib/security/email-throttle";
import { privacyHash } from "@/lib/security/browser-id";
import {
  assembleResult, buildScoringPrompt, callScorer, leadSummary, measureOverview, measureTitle,
  nothingToScore, parseAiScores, validateScoreRequest, ScoringError, type AiScores,
} from "@/lib/profile-score";
import { scoreContentProfile } from "@/lib/profile-content-score";

// The free public profile score. A signed-out visitor sends their Upwork link and WhatsApp number,
// optionally their email and overview; we save them as a lead, read the public header of the
// profile, score it (lib/profile-score.ts) and return the score on the same page.
//
// When UPWORK_BROWSER_URL is configured, capture uses the dedicated signed-in browser worker.
// Failed or incomplete captures stop here without asking the visitor to copy profile text.
// The legacy public reader remains available when no worker is configured.
//
// Every request costs a model call, so it is rate limited per browser, per network address and per
// WhatsApp number, and the limiter FAILS CLOSED: if it can't be checked, nothing is scored. (The
// enquiry form's limiter fails open because losing a lead is worse than a spam row; here the risk
// is an unbounded AI bill.) A failed scoring attempt gives the allowance back.

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });

function num(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Up to three polite attempts, a few seconds apart. The visitor sees a progress list meanwhile. */
async function readPublicProfile(url: string): Promise<PublicSnapshotResult> {
  const pauses = process.env.UPWORK_BROWSER_URL ? [0] : [0, 3000, 6000];
  let last: PublicSnapshotResult = { ok: false, outcome: "unavailable", message: "" };
  for (const pause of pauses) {
    if (pause) await sleep(pause);
    last = await fetchPublicProfileSnapshot(url);
    if (last.ok || last.outcome === "invalid") return last;
  }
  return last;
}

async function buckets(whatsappE164: string): Promise<Bucket[]> {
  const identity = await requestIdentity();
  const lock = num("PROFILE_SCORE_LOCK_MINUTES", 60);
  const list: Bucket[] = [
    // Generous per network: many people in Pakistan share one carrier or campus address.
    { key: `score:ip:${identity.ipHash}`, rule: { limit: num("PROFILE_SCORE_IP_LIMIT", 20), windowMinutes: 60, lockMinutes: lock } },
    // Per WhatsApp number (the one contact detail that's required), so changing the email
    // address, which is optional, doesn't reset anything.
    { key: `score:recipient:${await privacyHash("whatsapp", whatsappE164)}`, rule: { limit: num("PROFILE_SCORE_CONTACT_LIMIT", 5), windowMinutes: 24 * 60, lockMinutes: lock } },
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
    bucketList = await buckets(req.whatsappE164);
    const gate = await consume(bucketList);
    if (!gate.ok) {
      const minutes = Math.max(1, Math.ceil(gate.retryAfterSeconds / 60));
      const who = gate.reason === "recipient" ? "this WhatsApp number" : gate.reason === "browser" ? "this browser" : "your network";
      return json({ error: `You've used the free scores available for ${who} for now. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or open a full audit for the complete picture.` }, 429, { "Retry-After": String(gate.retryAfterSeconds) });
    }
  } catch (error) {
    console.error("Profile score: rate limiter unavailable, refusing to score", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Scoring is busy right now. Please try again in a minute." }, 503);
  }
  let heldClaim: EvidenceClaim | null = null;
  const giveBack = async () => {
    await refund(bucketList).catch(() => {});
    if (heldClaim) await restoreEvidence(heldClaim).catch(() => {
      console.error("Profile score: connected profile could not be restored for retry");
    });
  };

  // 1b. After "Connect Upwork" the profile was already read through Upwork's API and is waiting in a
  //     short-lived row that only this browser's cookie can name. No link is read, nothing is scraped.
  const heldId = req.connected ? ((request.headers.get("cookie") || "").split(/;\s*/).find(p => p.startsWith(`${CONNECTION_COOKIE}=`))?.slice(CONNECTION_COOKIE.length + 1) ?? "") : "";
  let held: EvidenceClaim["evidence"] | null = null;
  if (req.connected) {
    try {
      heldClaim = heldId ? await takeEvidence(heldId) : null;
      held = heldClaim?.evidence ?? null;
    } catch {
      await giveBack();
      return json({ error: "Your connected profile could not be loaded. Please try again shortly." }, 503);
    }
    if (!held) {
      await giveBack();
      return json({ code: "CONNECTION_EXPIRED", error: "Your Upwork sign-in has expired. Please connect Upwork again." }, 409);
    }
    req.profileUrl = held.profileUrl;
  }

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

  // 3. Public header of the profile. A failure is not fatal when an overview was supplied.
  let snapshot: PublicProfileSnapshot | null = held ? held.snapshot : null;
  const fetched: PublicSnapshotResult = held
    ? { ok: true, snapshot: held.snapshot, overview: held.overview }
    : await readPublicProfile(req.profileUrl);
  if (!held && fetched.ok) snapshot = fetched.snapshot;
  else if (!fetched.ok) console.info("Profile score: public profile not readable", fetched.outcome);

  if (!fetched.ok && process.env.UPWORK_BROWSER_URL) {
    await giveBack();
    return json({ code: "PROFILE_READER_UNAVAILABLE", error: fetched.message }, 503);
  }
  const overview = fetched.ok && fetched.overview ? fetched.overview : req.overview;

  if (nothingToScore(snapshot, overview)) {
    await giveBack();
    if (held) return json({ code: "CONNECTED_EMPTY", error: "Upwork connected, but it returned no title or overview to score. Please try again, or paste your overview instead." }, 422);
    await db.update(leads).set({ goals: "Free profile score: Upwork profile could not be read and no overview was given." })
      .where(eq(leads.id, req.submissionId)).catch(() => {});
    return json({
      code: "NEEDS_OVERVIEW",
      error: "Upwork didn't let us read your profile automatically just now. Paste your overview below and we'll score it, or try again in a few minutes.",
      fields: { overview: "Paste the overview from your Upwork profile to get your score." },
    }, 422);
  }

  // MCP imports are deliberately assessed only on the five fields the product promises: title,
  // overview, skills, portfolio, and certifications. Missing platform metrics never affect this score.
  if (held?.contentProfile) {
    let result;
    try { result = await scoreContentProfile(held.contentProfile); }
    catch (error) {
      await giveBack();
      console.error("Profile content scoring failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "We couldn't score your profile right now. Please try again in a minute." }, 502);
    }
    await db.update(leads).set({ name: (result.profile.name || "Profile score visitor").slice(0, 100), goals: leadSummary(result) })
      .where(eq(leads.id, req.submissionId)).catch(() => {});
    return json({ result }, 200, { "Set-Cookie": `${CONNECTION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}` });
  }

  // 4. Claude judges the title and, when supplied, the overview. With neither (only stats were
  //    readable) the score is built from the stats alone and no model call is made.
  const om = overview ? measureOverview(overview) : null;
  const tm = snapshot?.title ? measureTitle(snapshot.title) : null;
  let ai: AiScores | null = null;
  if (tm || om) {
    const prompt = buildScoringPrompt(snapshot?.title ?? null, overview, tm, om, snapshot);
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
  }

  const result = assembleResult(snapshot, ai, Boolean(om && ai));

  // 5. Record the outcome on the lead so the admin inbox shows the score next to the contact.
  await db.update(leads)
    .set({ name: (result.profile.name || "Profile score visitor").slice(0, 100), goals: leadSummary(result) })
    .where(eq(leads.id, req.submissionId))
    .catch(error => console.error("Profile score: lead summary update failed", error instanceof Error ? error.name : "UnknownError"));

  // The held profile has done its job; it is removed and the browser's pointer to it expires.
  // A connected profile was atomically consumed before scoring; no second deletion is needed.
  const clearHold: Record<string, string> = held ? { "Set-Cookie": `${CONNECTION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}` } : {};
  return json({ result }, 200, clearHold);
}
