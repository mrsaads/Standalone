// Browser identity for abuse limits.
//
// Every visitor's browser gets one random, signed, HttpOnly cookie (`ix_bid`) the first time it
// loads any page (set in middleware.ts). Rate limits that are meant to be "per browser" — the
// 10-emails-then-30-minute-lock rule in lib/security/email-throttle.ts — key off this id.
//
// Honest limitation, by design: a browser identity is only as durable as the browser's cookie jar.
// Incognito windows, clearing site data, or a different browser all start a fresh id. That is why
// the email throttle ALSO limits by network address and by recipient email address — the browser
// limit is the friendly, visible rule; the other two are what actually stop a determined abuser.
//
// Web Crypto only (no node:crypto) so this runs in both the middleware (edge) runtime and route
// handlers (Node runtime).

export const BROWSER_ID_COOKIE = "ix_bid";
export const BROWSER_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // browsers cap cookie lifetime at ~400 days

const encoder = new TextEncoder();

function secret(): string {
  // A dedicated secret is preferred; the service-role key is a server-only fallback so a missing
  // env var never silently disables signing. Neither value ever reaches the browser.
  return process.env.BROWSER_ID_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "ix-dev-only-browser-id-secret";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(`ix-browser-id-v1:${secret()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function mintBrowserId(): Promise<string> {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  return `${id}.${await hmac(id)}`;
}

/** Returns the bare id when the cookie value is well-formed and correctly signed, else null. */
export async function verifyBrowserId(cookieValue: string | undefined | null): Promise<string | null> {
  if (!cookieValue) return null;
  const [id, sig, extra] = cookieValue.split(".");
  if (!id || !sig || extra !== undefined || !/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
  return timingSafeEqual(sig, await hmac(id)) ? id : null;
}

/** SHA-256 (keyed) of a value we must rate-limit on but should not store in plain text (IP, email). */
export async function privacyHash(kind: string, value: string): Promise<string> {
  return (await hmac(`${kind}:${value}`)).slice(0, 32);
}

export function browserIdCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: BROWSER_ID_MAX_AGE_SECONDS,
  };
}

/**
 * Best-effort client network address. Render sits behind Cloudflare, which sets
 * `cf-connecting-ip` / `true-client-ip` itself (a client cannot spoof those through Cloudflare);
 * `x-forwarded-for`'s left-most entry is the last resort.
 */
export function clientIp(headers: Headers): string {
  const direct = headers.get("cf-connecting-ip") || headers.get("true-client-ip") || headers.get("x-real-ip");
  if (direct) return direct.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}
