import { referenceValid } from "./audit-preview";

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

// Fetches a validated Upwork profile URL with the constraints an untrusted-target fetch needs:
// bounded timeout, bounded response size, redirects followed manually (not via `redirect: "follow"`)
// so a redirect can never carry the request off upwork.com — the SSRF shape that a naive follow-any
// redirect would otherwise allow. Never throws; returns a ProfileFetchOutcome so callers can tell a
// genuinely failed/blocked/timed-out fetch apart from a real, readable profile page.
export async function fetchUpworkProfile(rawUrl: string): Promise<ProfileFetchOutcome> {
  if (!rawUrl.trim() || !referenceValid(rawUrl)) {
    return { outcome: "invalid", message: "Use a valid HTTPS Upwork freelancer profile link." };
  }

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let host: string;
    try { host = new URL(current).hostname; } catch { return { outcome: "invalid", message: "Use a valid HTTPS Upwork freelancer profile link." }; }
    if (!isUpworkHost(host)) return { outcome: "blocked", message: "This link redirected away from upwork.com, so it was not followed." };

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
        ? { outcome: "timeout", message: "Upwork did not respond in time. Paste the profile text or upload a document instead." }
        : { outcome: "unavailable", message: "Upwork could not be reached automatically. Paste the profile text or upload a document instead." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { outcome: "unavailable", message: "Upwork did not allow automatic access to this profile. Paste the profile text or upload a document instead." };
      try { current = new URL(location, current).toString(); }
      catch { return { outcome: "unavailable", message: "Upwork did not allow automatic access to this profile. Paste the profile text or upload a document instead." }; }
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { outcome: "blocked", message: "Upwork blocked automatic access to this profile. Paste the profile text or upload a document instead." };
    }
    if (!response.ok) {
      return { outcome: "unavailable", message: `Upwork returned an error (status ${response.status}). Paste the profile text or upload a document instead.` };
    }

    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return { outcome: "parse_failed", message: "The profile link did not return readable profile information." };

    const html = await readCapped(response, MAX_RESPONSE_BYTES);
    if (html === null) return { outcome: "parse_failed", message: "The profile page was too large to read automatically. Paste the profile text or upload a document instead." };

    const text = decodeHtml(html).slice(0, MAX_TEXT_CHARS);
    if (BLOCKED_PATTERNS.some(pattern => pattern.test(text))) {
      return { outcome: "blocked", message: "Upwork showed a sign-in or verification page instead of the profile. Paste the profile text or upload a document instead." };
    }
    if (text.length < 200) {
      return { outcome: "unavailable", message: "Upwork returned a page with no readable profile content. Paste the profile text or upload a document instead." };
    }
    if (text.length < 500 || !PROFILE_SIGNAL.test(text)) {
      return { outcome: "partial", text, message: "Only part of this profile could be read automatically. Check every field below, and paste the full profile text if anything is missing." };
    }
    return { outcome: "success", text };
  }
  return { outcome: "unavailable", message: "This profile link redirected too many times. Paste the profile text or upload a document instead." };
}
