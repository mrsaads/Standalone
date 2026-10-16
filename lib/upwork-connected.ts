import { z } from "zod";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { upworkConnections } from "@/db/schema";
import { emptyDetails, extractBasicDetails } from "@/lib/audit-preview";
import { graphql, UpworkApiError, type UpworkApiConfig } from "@/lib/upwork-api";
import type { PublicProfileSnapshot } from "@/lib/upwork-fetch";

// Reads a customer's OWN Upwork profile through the official API, after they approved access, and
// turns it into the evidence the score and audit already understand. The shape of Upwork's answers is
// only partly documented (field names inside the profile fragments are not published), so:
//
//   * every query below that names a field Upwork has not documented is marked GUESS and sits in an
//     ordered list. The first one Upwork accepts is used and the richer ones fall away silently;
//   * the reader below accepts several spellings for each value and reports anything it could not
//     find as MISSING, never as a guess;
//   * scripts/upwork-api/probe.mjs prints the real field names the first time a key exists, and the
//     list here is then corrected in one place.
//
// Nothing here is verified against a live key. The tests use a mock that returns the shapes
// assumed in this file; they prove the plumbing, not Upwork's real answers.

// GUESS: how to learn who just signed in. Upwork's documentation shows `userDetails(id:)` but no
// way to obtain your own id. This is the form the public schema is commonly reported to accept.
export const IDENTITY_QUERIES: string[] = [
  `query { user { id nid rid name publicUrl } }`,
  `query { user { id publicUrl } }`,
];

// Documented field names first (personalData.firstName/lastName/title/description appear in the
// search example; profileAggregates.totalJobs/totalFeedback/topRatedStatus likewise). The richer
// entries add sections whose subfields are NOT documented: GUESS.
const BASE = `personalData { firstName lastName title description location { country state city } }
    profileAggregates { totalJobs totalFeedback topRatedStatus lastWorkedOn }`;
export const PROFILE_SELECTIONS: { label: string; selection: string }[] = [
  { label: "full (GUESS)", selection: `${BASE}
    skills { name }
    employmentRecords { companyName jobTitle startDate endDate description }
    projectList { title description }` },
  { label: "with skills (GUESS)", selection: `${BASE}
    skills { name }` },
  { label: "base", selection: BASE },
];
const profileQuery = (selection: string) => `query ($profileKey: String!) { talentProfileByProfileKey(profileKey: $profileKey) {
    ${selection}
  } }`;

const KEY = /^~[0-9a-f]{8,}$/i;
/** The profile key inside a freelancer link or id: `https://www.upwork.com/freelancers/~01abc…` → `~01abc…` */
export function profileKeyFrom(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  if (KEY.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.upwork.com", "upwork.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
    const match = /^\/(?:freelancers|fl)\/(~[0-9a-f]{8,})\/?$/i.exec(url.pathname);
    return match?.[1] ?? null;
  } catch { return null; }
}

export type ConnectedEvidence = {
  v: 1;
  profileUrl: string;
  snapshot: PublicProfileSnapshot;
  overview: string;
  sections: { skills: string[]; employment: string[]; projects: string[] };
  /** Which fields could not be read, in words the report can print. Empty means everything asked for arrived. */
  missing: string[];
  readAt: string;
};

const evidenceSchema = z.object({
  v: z.literal(1),
  profileUrl: z.string().url().max(500),
  snapshot: z.object({
    name: z.string().nullable(), title: z.string().nullable(), location: z.string().nullable(),
    jss: z.number().nullable(), badge: z.enum(["Top Rated Plus", "Top Rated", "Rising Talent", "Expert-Vetted"]).nullable(),
    rating: z.number().nullable(), reviews: z.number().nullable(), totalJobs: z.number().nullable(), totalHours: z.number().nullable(),
    unavailableSections: z.array(z.enum(["track", "offer"])).optional(),
    hourlyRate: z.number().nullable(), consultation: z.object({ price: z.number(), minutes: z.number() }).nullable(),
  }),
  overview: z.string().max(5000),
  sections: z.object({ skills: z.array(z.string().max(120)).max(60), employment: z.array(z.string().max(1500)).max(40), projects: z.array(z.string().max(1500)).max(40) }),
  missing: z.array(z.string().max(120)).max(20),
  readAt: z.string().max(40),
});

// ---- tolerant reading --------------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const pick = (o: unknown, ...names: string[]) => { if (!isObj(o)) return undefined; for (const n of names) if (o[n] != null) return o[n]; return undefined; };

function listText(value: unknown, preferred: string[], max: number, maxItems = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value.slice(0, maxItems)) {
    if (typeof item === "string") { if (str(item, max)) out.push(str(item, max)); continue; }
    if (!isObj(item)) continue;
    const parts: string[] = [];
    for (const name of preferred) { const s = str(item[name], max); if (s && !parts.includes(s)) parts.push(s); }
    // Anything else the entry carries that is plain text and short (company, dates) rides along,
    // so a field name we did not anticipate is still shown to the scorer instead of dropped.
    for (const [k, v] of Object.entries(item)) { if (!preferred.includes(k) && typeof v === "string" && v.length <= 200 && !/id$|ciphertext|url$/i.test(k) && !parts.includes(v.trim())) parts.push(v.trim()); }
    const line = parts.join(" — ").slice(0, max);
    if (line) out.push(line);
  }
  return out;
}

function badgeFrom(status: unknown): PublicProfileSnapshot["badge"] {
  const s = str(status, 60).toLowerCase().replace(/[^a-z]+/g, " ");
  if (/top rated plus/.test(s)) return "Top Rated Plus";
  if (/expert vetted/.test(s)) return "Expert-Vetted";
  if (/top rated/.test(s)) return "Top Rated";
  if (/rising/.test(s)) return "Rising Talent";
  return null;
}

/** Turns the API's `talentProfileByProfileKey` answer into evidence. Pure; used by the tests and the probe. */
export function evidenceFromProfile(profile: unknown, profileUrl: string, now = new Date()): ConnectedEvidence {
  const personal = pick(profile, "personalData");
  const aggregates = pick(profile, "profileAggregates");
  const first = str(pick(personal, "firstName"), 60); const last = str(pick(personal, "lastName"), 60);
  const title = str(pick(personal, "title"), 300) || null;
  const overview = str(pick(personal, "description", "overview"), 5000);
  const loc = pick(personal, "location");
  const location = [str(pick(loc, "city"), 60), str(pick(loc, "country"), 60)].filter(Boolean).join(", ") || null;
  const skills = listText(pick(profile, "skills"), ["name", "skillName", "prettyName", "label"], 120, 60);
  const employment = listText(pick(profile, "employmentRecords"), ["jobTitle", "title", "companyName", "description"], 1500);
  const projects = listText(pick(profile, "projectList"), ["title", "description"], 1500);
  const totalJobs = num(pick(aggregates, "totalJobs"));
  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!overview) missing.push("overview");
  if (!skills.length) missing.push("skills");
  if (!employment.length) missing.push("work history");
  if (!projects.length) missing.push("portfolio");
  // Not exposed by the documented selection; reported rather than guessed.
  missing.push("Job Success Score", "hourly rate", "hours worked");
  return {
    v: 1, profileUrl, overview,
    snapshot: {
      name: [first, last].filter(Boolean).join(" ") || null, title, location,
      jss: null, badge: badgeFrom(pick(aggregates, "topRatedStatus")), rating: null, reviews: null,
      totalJobs: totalJobs !== null && Number.isInteger(totalJobs) && totalJobs >= 0 ? totalJobs : null,
      totalHours: null, hourlyRate: null, consultation: null,
      unavailableSections: ["track", "offer"],
    },
    sections: { skills, employment, projects }, missing, readAt: now.toISOString(),
  };
}

export type ReadOutcome =
  | { ok: true; evidence: ConnectedEvidence; selection: string }
  | { ok: false; reason: "identity" | "no_profile" | "scope" | "api" | "empty"; message: string };

/** The whole read for one signed-in customer. Never throws; the token is only used inside this call. */
export async function readOwnProfile(cfg: UpworkApiConfig, token: string, doFetch: typeof fetch = fetch): Promise<ReadOutcome> {
  try {
    // 1. Who signed in? Their own public profile address gives the key, so they can only ever read their own profile.
    let key: string | null = null;
    let publicUrl: string | null = null;
    for (const query of IDENTITY_QUERIES) {
      const r = await graphql(cfg, token, query, {}, doFetch);
      const user = pick(r.data, "user");
      publicUrl = str(pick(user, "publicUrl"), 500) || null;
      key = profileKeyFrom(publicUrl) ?? profileKeyFrom(pick(user, "ciphertext"));
      if (key) break;
    }
    if (!key) return { ok: false, reason: "identity", message: "We couldn't tell which Upwork profile you signed in with." };

    // 2. The richest selection Upwork accepts.
    let lastErrors = "";
    for (const { label, selection } of PROFILE_SELECTIONS) {
      const r = await graphql(cfg, token, profileQuery(selection), { profileKey: key }, doFetch);
      const profile = pick(r.data, "talentProfileByProfileKey");
      if (isObj(profile) && !r.errors.some(e => /permission|scope|not authori[sz]ed|forbidden/i.test(e.message))) {
        const link = `https://www.upwork.com/freelancers/${key}`;
        const evidence = evidenceFromProfile(profile, link);
        if (!evidence.overview && !evidence.snapshot.title) return { ok: false, reason: "empty", message: "Upwork returned the profile without a title or overview." };
        return { ok: true, evidence, selection: label };
      }
      lastErrors = r.errors.map(e => e.message).join(" | ").slice(0, 300);
      if (/permission|scope|not authori[sz]ed|forbidden/i.test(lastErrors)) return { ok: false, reason: "scope", message: "This sign-in does not allow reading the freelancer profile." };
    }
    console.error("Upwork API: no profile selection was accepted");
    return { ok: false, reason: "no_profile", message: "Upwork did not return your profile." };
  } catch (error) {
    if (error instanceof UpworkApiError) {
      console.error("Upwork API:", error.code);
      return { ok: false, reason: error.code === "unauthorized" ? "scope" : "api", message: error.message };
    }
    console.error("Upwork API: unexpected failure", error instanceof Error ? error.name : "UnknownError");
    return { ok: false, reason: "api", message: "Upwork's API could not be read." };
  }
}

/** The text the full audit takes as `profileText`: everything read, labelled, with gaps stated. */
export function evidenceText(e: ConnectedEvidence): string {
  const lines = [
    e.missing.length ? `Not read from Upwork (treat as unverified, do not guess): ${e.missing.join(", ")}.` : "",
    `Name: ${e.snapshot.name ?? "not provided"}`, `Title: ${e.snapshot.title ?? "not provided"}`,
    e.snapshot.location ? `Location: ${e.snapshot.location}` : "",
    e.snapshot.badge ? `Badge: ${e.snapshot.badge}` : "", e.snapshot.totalJobs !== null ? `Total jobs: ${e.snapshot.totalJobs}` : "",
    "", "Overview:", e.overview || "not provided",
    e.sections.skills.length ? `\nSkills: ${e.sections.skills.join(", ")}` : "",
    e.sections.employment.length ? `\nWork history:\n- ${e.sections.employment.join("\n- ")}` : "",
    e.sections.projects.length ? `\nPortfolio:\n- ${e.sections.projects.join("\n- ")}` : "",
  ];
  const text = lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();
  if (text.length <= 40000) return text;
  const notice = "Profile evidence was truncated to fit the audit. Content beyond the limit was not read and must remain unverified.\n";
  return notice + text.slice(0, 40000 - notice.length);
}

/** Import into the existing editable audit draft. Missing facts stay explicitly unverified. */
export function connectedAuditPreview(evidence: ConnectedEvidence) {
  const profileText = evidenceText(evidence);
  const snapshot = evidence.snapshot;
  return {
    outcome: evidence.missing.length ? "partial" as const : "success" as const,
    profileText,
    profileUrl: evidence.profileUrl,
    details: {
      ...emptyDetails, ...extractBasicDetails(profileText),
      name: snapshot.name ?? "", title: snapshot.title ?? "",
      rate: snapshot.hourlyRate === null ? "" : `$${snapshot.hourlyRate}/hr`,
      jss: snapshot.jss === null ? "" : `${snapshot.jss}%`,
      jobs: snapshot.totalJobs === null ? "" : String(snapshot.totalJobs),
      completed: "", active: "",
      reportName: `${snapshot.name || "Upwork"} Profile Audit`,
    },
    message: evidence.missing.length ? `Imported your connected profile. Not available: ${evidence.missing.join(", ")}. These details remain unverified.` : undefined,
  };
}

/** Browser cookie that carries the holding row's id from the OAuth callback to the score request. */
export const CONNECTION_COOKIE = "ix_uw_conn";

// ---- short-lived holding row -------------------------------------------------------------------
const HOLD_MINUTES = 15;

export async function holdEvidence(evidence: ConnectedEvidence): Promise<string> {
  const db = getDb();
  await db.delete(upworkConnections).where(lt(upworkConnections.expiresAt, new Date())).catch(() => {});
  const [row] = await db.insert(upworkConnections).values({
    payload: evidence, expiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
  }).returning({ id: upworkConnections.id });
  return row.id;
}

const parseHeld = (payload: unknown) => { const parsed = evidenceSchema.safeParse(payload); return parsed.success ? parsed.data : null; };

/** Reads a held profile without removing it, so a failed score can be retried without signing in again. */
export async function peekEvidence(id: string): Promise<ConnectedEvidence | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb().select({ payload: upworkConnections.payload }).from(upworkConnections)
    .where(and(eq(upworkConnections.id, id), gt(upworkConnections.expiresAt, new Date()))).limit(1);
  return parseHeld(row?.payload);
}

/** Removes a held profile once it has been used. */
export async function discardEvidence(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await getDb().delete(upworkConnections).where(eq(upworkConnections.id, id));
}

export type EvidenceClaim = { id: string; evidence: ConnectedEvidence; expiresAt: Date; createdAt: Date };

/** Atomically remove the holding row before starting a billed model call. */
export async function takeEvidence(id: string): Promise<EvidenceClaim | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb().delete(upworkConnections)
    .where(and(eq(upworkConnections.id, id), gt(upworkConnections.expiresAt, new Date())))
    .returning();
  const evidence = parseHeld(row?.payload);
  return row && evidence ? { id: row.id, evidence, expiresAt: row.expiresAt, createdAt: row.createdAt } : null;
}

/** Restore a failed attempt without extending its original privacy/expiry window. */
export async function restoreEvidence(claim: EvidenceClaim): Promise<void> {
  if (claim.expiresAt.getTime() <= Date.now()) return;
  await getDb().insert(upworkConnections).values({
    id: claim.id, payload: claim.evidence, expiresAt: claim.expiresAt, createdAt: claim.createdAt,
  }).onConflictDoNothing();
}

/** Single-use read for other callers. Failed scoring attempts use take/restore above. */
export async function claimEvidence(id: string): Promise<ConnectedEvidence | null> {
  return (await takeEvidence(id))?.evidence ?? null;
}
