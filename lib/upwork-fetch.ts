import { referenceValid } from "./audit-preview";
import { captureHtml, fetchBrowserProfile } from "./upwork-browser";

// Strips tags/scripts/styles and decodes the handful of entities Upwork's markup actually uses,
// producing the same plain-text shape the paste/upload flows already work with. Shared by the
// preview-extraction endpoint and the final generation endpoint so both classify the same page the
// same way — a page one of them calls "blocked" can never be silently treated as real profile
// evidence by the other.
export function decodeHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// A discriminated outcome instead of throw/no-throw: "success" and "partial" both carry real,
// readable text (the caller decides whether "partial" is good enough to proceed with, and shows the
// user it was only a partial read); every other case means there is no trustworthy profile text at
// all and must never reach the AI as if it were one.
export type ProfileFetchOutcome =
  | { outcome: "success"; text: string }
  | { outcome: "partial"; text: string; message: string }
  | { outcome: "blocked"; message: string }
  | { outcome: "unavailable"; message: string }
  | { outcome: "timeout"; message: string }
  | { outcome: "parse_failed"; message: string }
  | { outcome: "invalid"; message: string };

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // a real Upwork profile page is a small fraction of this
const MAX_TEXT_CHARS = 40000; // matches the app-wide profile-text cap (requestSchema.profileText)
const FETCH_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 5;

// Signals that the page is a login wall, a bot/security challenge, or an access-denied page rather
// than the freelancer's profile. Checked before any length-based classification — a long page can
// still be entirely login/challenge chrome.
const BLOCKED_PATTERNS = [
  /\bcaptcha\b/i,
  /verify you are (?:a )?human/i,
  /access (?:to this page has been )?denied/i,
  /attention required/i,
  /checking your browser/i,
  /enable javascript and cookies to continue/i,
  /\b(?:log ?in|sign ?in) to (?:upwork|continue)\b/i,
  /please log in to view this profile/i,
  /this profile (?:is|isn't|is not) (?:currently )?available/i,
  /\bforbidden\b/i,
  /rate limit exceeded/i,
];

// A loose signal that the decoded text actually contains Upwork-profile-shaped content (a rate, a
// Job Success line, hours, a review/portfolio section) rather than generic site chrome — nav, footer,
// marketing copy — that happens to clear the length threshold. Only distinguishes "success" from
// "partial"; both still return usable text for the user to review and correct.
const PROFILE_SIGNAL = /\$[\d,.]+\s*\/\s*hr|job success|total jobs|hours per week|verifications|portfolio|work history|completed jobs/i;

function isUpworkHost(hostname: string) {
  return hostname === "upwork.com" || hostname === "www.upwork.com";
}

// Reads a response body up to `capBytes`, aborting the stream rather than buffering an unbounded
// download into memory first. Returns null if the cap was exceeded.
async function readCapped(response: Response, capBytes: number): Promise<string | null> {
  const body = response.body;
  if (!body) return await response.text();
  const reader = body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > capBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

// Uses the configured signed-in worker first. Without a worker, fetches a public profile URL
// with the constraints an untrusted-target fetch needs:
// bounded timeout, bounded response size, redirects followed manually (not via `redirect: "follow"`)
// so a redirect can never carry the request off upwork.com — the SSRF shape that a naive follow-any
// redirect would otherwise allow. Never throws. Returns the raw HTML so callers that need the page's
// meta tags (the public profile score reads og:description and the rate from them) can have it;
// fetchUpworkProfile below turns it into plain text for the audit flow.
export type PageFetchResult =
  | { ok: true; html: string; overview?: string; text?: string }
  | { ok: false; outcome: "blocked" | "unavailable" | "timeout" | "parse_failed" | "invalid"; message: string };

export async function fetchUpworkPage(rawUrl: string): Promise<PageFetchResult> {
  if (process.env.UPWORK_BROWSER_URL) {
    const result = await fetchBrowserProfile(rawUrl);
    if (!result.ok) return result;
    return { ok: true, html: captureHtml(result.capture), overview: result.capture.overview, text: result.capture.text };
  }
  if (!rawUrl.trim() || !referenceValid(rawUrl)) {
    return { ok: false, outcome: "invalid", message: "Use a valid HTTPS Upwork freelancer profile link." };
  }

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let host: string;
    try { host = new URL(current).hostname; } catch { return { ok: false, outcome: "invalid", message: "Use a valid HTTPS Upwork freelancer profile link." }; }
    if (!isUpworkHost(host)) return { ok: false, outcome: "blocked", message: "This link redirected away from upwork.com, so it was not followed." };

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ImprovexusProfileAudit/1.0)" },
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      return isTimeout
        ? { ok: false, outcome: "timeout", message: "Upwork did not respond in time. Paste the profile text or upload a document instead." }
        : { ok: false, outcome: "unavailable", message: "Upwork could not be reached automatically. Paste the profile text or upload a document instead." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, outcome: "unavailable", message: "Upwork did not allow automatic access to this profile. Paste the profile text or upload a document instead." };
      try { current = new URL(location, current).toString(); }
      catch { return { ok: false, outcome: "unavailable", message: "Upwork did not allow automatic access to this profile. Paste the profile text or upload a document instead." }; }
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { ok: false, outcome: "blocked", message: "Upwork blocked automatic access to this profile. Paste the profile text or upload a document instead." };
    }
    if (!response.ok) {
      return { ok: false, outcome: "unavailable", message: `Upwork returned an error (status ${response.status}). Paste the profile text or upload a document instead.` };
    }

    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return { ok: false, outcome: "parse_failed", message: "The profile link did not return readable profile information." };

    const html = await readCapped(response, MAX_RESPONSE_BYTES);
    if (html === null) return { ok: false, outcome: "parse_failed", message: "The profile page was too large to read automatically. Paste the profile text or upload a document instead." };
    return { ok: true, html };
  }
  return { ok: false, outcome: "unavailable", message: "This profile link redirected too many times. Paste the profile text or upload a document instead." };
}

// The audit flow's view of the same fetch: plain text, classified as a real profile, a partial
// read, or a login/challenge page. Behaviour is unchanged from before fetchUpworkPage was split out.
export async function fetchUpworkProfile(rawUrl: string): Promise<ProfileFetchOutcome> {
  const page = await fetchUpworkPage(rawUrl);
  if (!page.ok) return { outcome: page.outcome, message: page.message };
  const text = (page.text ?? decodeHtml(page.html)).slice(0, MAX_TEXT_CHARS);
  if (isBlockedText(text)) {
    return { outcome: "blocked", message: "Upwork showed a sign-in or verification page instead of the profile. Paste the profile text or upload a document instead." };
  }
  if (page.overview && page.text) return { outcome: "success", text };
  if (text.length < 200) {
    return { outcome: "unavailable", message: "Upwork returned a page with no readable profile content. Paste the profile text or upload a document instead." };
  }
  if (text.length < 500 || !PROFILE_SIGNAL.test(text)) {
    return { outcome: "partial", text, message: "Only part of this profile could be read automatically. Check every field below, and paste the full profile text if anything is missing." };
  }
  return { outcome: "success", text };
}

export function isBlockedText(text: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(text));
}

// ---- Public header snapshot ------------------------------------------------------------------
// What Upwork shows a signed-out visitor (and therefore our server): name, title, location, Job
// Success, badge, rating, total jobs, total hours, a consultation offer and the hourly rate in the
// page's product meta tags. The overview, skills, portfolio and employment history are NOT in the
// signed-out page (checked against real profiles on 2026-10-14), which is why the public score asks
// for the overview to be pasted. Every field is optional: a missing one is reported as missing,
// never guessed.
export type PublicProfileSnapshot = {
  /** API scopes may omit whole groups; do not treat those omissions as low scores. */
  unavailableSections?: Array<"track" | "offer">;
  name: string | null;
  title: string | null;
  location: string | null;
  jss: number | null;            // 0-100
  badge: "Top Rated Plus" | "Top Rated" | "Rising Talent" | "Expert-Vetted" | null;
  rating: number | null;         // 0-5
  reviews: number | null;
  totalJobs: number | null;
  totalHours: number | null;
  hourlyRate: number | null;     // USD
  consultation: { price: number; minutes: number } | null;
};

function metaContent(html: string, key: string): string | null {
  // <meta property="og:title" content="..."> in either attribute order, name= or property=, and
  // either quote style (a double-quoted value may contain an apostrophe: "Ali's profile").
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = `(?:"([^"]*)"|'([^']*)')`;
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=${value}`, "i"),
    new RegExp(`<meta[^>]+content=${value}[^>]*(?:property|name)=["']${k}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m) return decodeHtml(m[1] ?? m[2] ?? "");
  }
  return null;
}

function parseCount(raw: string): number | null {
  const m = /^([\d,]+(?:\.\d+)?)\s*([kKmM])?$/.exec(raw.trim());
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return Math.round(base * mult);
}

export function parsePublicProfile(html: string): PublicProfileSnapshot {
  const text = decodeHtml(html);
  const pageTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const titleParts = pageTitle ? decodeHtml(pageTitle).split(" - ") : [];

  const name = metaContent(html, "og:title") || (titleParts.length >= 2 ? titleParts[0] : null);
  const title = metaContent(html, "og:description") || (titleParts.length >= 3 ? titleParts.slice(1, -1).join(" - ") : null);
  const fromLine = titleParts.at(-1)?.match(/Upwork Freelancer from (.+)$/i)?.[1] ?? null;

  const jss = /(\d{1,3})\s*%\s*Job Success/i.exec(text);
  const badge = /Top Rated Plus/i.test(text) ? "Top Rated Plus"
    : /Expert[- ]Vetted/i.test(text) ? "Expert-Vetted"
    : /\bTop Rated\b/i.test(text) ? "Top Rated"
    : /Rising Talent/i.test(text) ? "Rising Talent" : null;
  const jobs = /([\d,.]+\s*[kKmM]?)\s*Total jobs/i.exec(text);
  const hours = /([\d,.]+\s*[kKmM]?)\s*Total hours/i.exec(text);
  const rating = /\b([1-5](?:\.\d)?)\s*\((\d{1,5})\)/.exec(text);
  const rateText = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*\/\s*hr\b/i.exec(text);
  const rateMeta = metaContent(html, "product:price:amount");
  const consult = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*per\s*(\d{1,3})\s*min/i.exec(text);

  const num = (v: string | null | undefined) => {
    if (!v) return null;
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const jssValue = jss ? Number(jss[1]) : null;
  const ratingValue = rating ? Number(rating[1]) : null;

  return {
    name: name?.trim() || null,
    title: title?.trim() || null,
    location: fromLine?.trim() || null,
    jss: jssValue !== null && jssValue <= 100 ? jssValue : null,
    badge,
    rating: ratingValue !== null && ratingValue <= 5 ? ratingValue : null,
    reviews: rating ? Number(rating[2]) : null,
    totalJobs: jobs ? parseCount(jobs[1]) : null,
    totalHours: hours ? parseCount(hours[1]) : null,
    hourlyRate: num(rateText?.[1]) ?? num(rateMeta),
    consultation: consult ? { price: Number(consult[1].replace(/,/g, "")), minutes: Number(consult[2]) } : null,
  };
}

export type PublicSnapshotResult =
  | { ok: true; snapshot: PublicProfileSnapshot; overview?: string }
  | { ok: false; outcome: PageFetchResult extends infer R ? R extends { ok: false; outcome: infer O } ? O : never : never; message: string };

export async function fetchPublicProfileSnapshot(rawUrl: string): Promise<PublicSnapshotResult> {
  const page = await fetchUpworkPage(rawUrl);
  if (!page.ok) return { ok: false, outcome: page.outcome, message: page.message };
  if (isBlockedText(decodeHtml(page.html).slice(0, MAX_TEXT_CHARS))) {
    return { ok: false, outcome: "blocked", message: "Upwork showed a sign-in or verification page instead of the profile." };
  }
  const snapshot = parsePublicProfile(page.html);
  if (!snapshot.title && snapshot.jss === null && snapshot.totalJobs === null) {
    return { ok: false, outcome: "parse_failed", message: "The profile page did not contain readable profile details." };
  }
  return { ok: true, snapshot, overview: page.overview };
}
