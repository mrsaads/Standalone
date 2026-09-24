import { sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db";
import { BROWSER_ID_COOKIE, clientIp, privacyHash, verifyBrowserId } from "./browser-id";

// Abuse limits for anything that makes the app send an email (signup verification, resending
// verification, password reset) and for failed logins.
//
// THE RULE THE PRODUCT PROMISES (email): one browser can trigger at most 10 auth emails. When the
// 10th goes out, that browser is locked for 30 minutes and every auth-email form on it shows a
// live countdown. When the countdown ends, the browser's count resets to 0 and a new signup can be
// made from it.
//
// WHY THERE ARE THREE BUCKETS, NOT ONE: the browser bucket is keyed to a cookie, and a cookie can
// be cleared (incognito, "clear site data"). So every email also counts against:
//   - the network address (IP) — catches someone clearing cookies to reset the browser counter
//   - the recipient email address — stops anyone flooding one person's inbox
// An email only goes out if ALL three buckets allow it, and it counts against all three.
//
// Storage is Postgres (table auth_email_throttle), not memory, so limits survive restarts and
// redeploys and are shared if Render ever runs more than one instance. IPs and emails are stored
// only as keyed hashes — never in plain text.

type Rule = { limit: number; windowMinutes: number; lockMinutes: number };

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function emailRules() {
  const lock = num("AUTH_EMAIL_LOCK_MINUTES", 30);
  return {
    // The visible per-browser rule. Window = how long hits keep counting toward the limit.
    browser: { limit: num("AUTH_EMAIL_BROWSER_LIMIT", 10), windowMinutes: num("AUTH_EMAIL_BROWSER_WINDOW_MINUTES", 24 * 60), lockMinutes: lock },
    // Generous: many people in Pakistan share one mobile-carrier / campus IP (CGNAT).
    ip: { limit: num("AUTH_EMAIL_IP_LIMIT", 30), windowMinutes: 60, lockMinutes: lock },
    recipient: { limit: num("AUTH_EMAIL_RECIPIENT_LIMIT", 5), windowMinutes: 60, lockMinutes: lock },
  } satisfies Record<string, Rule>;
}

export function loginRules() {
  const lock = num("AUTH_LOGIN_LOCK_MINUTES", 15);
  return {
    browser: { limit: num("AUTH_LOGIN_BROWSER_FAILURES", 10), windowMinutes: 15, lockMinutes: lock },
    ip: { limit: 50, windowMinutes: 15, lockMinutes: lock },
    account: { limit: num("AUTH_LOGIN_ACCOUNT_FAILURES", 10), windowMinutes: 15, lockMinutes: lock },
  } satisfies Record<string, Rule>;
}

export type Bucket = { key: string; rule: Rule };

export type ThrottleResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; lockedUntil: string; reason: "browser" | "ip" | "recipient" | "account" };

export type BrowserQuota = { limit: number; used: number; remaining: number; lockedUntil: string | null; retryAfterSeconds: number };

type Row = { bucket: string; hits: number; window_started_at: Date | string; locked_until: Date | string | null };

// Dates go over the wire as ISO strings with an explicit cast (postgres-js with prepare:false —
// required by Supabase's pooler — can't bind a JS Date inside a raw sql`` template).
const ts = (d: Date | null) => (d ? sql`${d.toISOString()}::timestamptz` : sql`null`);
const inList = (keys: string[]) => sql`(${sql.join(keys.map(k => sql`${k}`), sql`, `)})`;
const reasonOf = (key: string) => key.split(":")[1] as "browser" | "ip" | "recipient" | "account";
const asDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));

/** Current, normalized view of one row (expired locks and windows count as fresh). */
function normalize(row: Row | undefined, rule: Rule, now: Date) {
  if (!row) return { hits: 0, windowStart: now, lockedUntil: null as Date | null, fresh: true };
  const lockedUntil = row.locked_until ? asDate(row.locked_until) : null;
  const windowStart = asDate(row.window_started_at);
  if (lockedUntil && lockedUntil <= now) return { hits: 0, windowStart: now, lockedUntil: null, fresh: true };
  if (!lockedUntil && windowStart.getTime() + rule.windowMinutes * 60_000 <= now.getTime()) return { hits: 0, windowStart: now, lockedUntil: null, fresh: true };
  return { hits: row.hits, windowStart, lockedUntil, fresh: false };
}

/**
 * Atomically: if no bucket is locked, count one hit against every bucket (locking any bucket that
 * reaches its limit — the hit that reaches the limit itself is allowed). Row locks are taken in
 * sorted key order so two concurrent requests can never deadlock, and two requests for the same
 * browser can never both squeeze past the limit.
 */
export async function consume(buckets: Bucket[], now = new Date()): Promise<ThrottleResult> {
  const sorted = [...buckets].sort((a, b) => a.key.localeCompare(b.key));
  const keys = sorted.map(b => b.key);
  const db = getDb();
  const result = await db.transaction(async tx => {
    for (const key of keys) {
      await tx.execute(sql`insert into auth_email_throttle (bucket, hits, window_started_at) values (${key}, 0, ${ts(now)}) on conflict (bucket) do nothing`);
    }
    const rows = (await tx.execute(sql`select bucket, hits, window_started_at, locked_until from auth_email_throttle where bucket in ${inList(keys)} order by bucket for update`)) as unknown as Row[];
    const byKey = new Map(rows.map(r => [r.bucket, r]));

    let blocked: ThrottleResult | null = null;
    for (const b of sorted) {
      const state = normalize(byKey.get(b.key), b.rule, now);
      if (state.lockedUntil) {
        const retry = Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000);
        if (!blocked || (blocked.ok === false && retry > blocked.retryAfterSeconds)) {
          blocked = { ok: false, retryAfterSeconds: retry, lockedUntil: state.lockedUntil.toISOString(), reason: reasonOf(b.key) };
        }
      }
    }
    if (blocked) return blocked;

    for (const b of sorted) {
      const state = normalize(byKey.get(b.key), b.rule, now);
      const hits = state.hits + 1;
      const lockedUntil = hits >= b.rule.limit ? new Date(now.getTime() + b.rule.lockMinutes * 60_000) : null;
      await tx.execute(sql`update auth_email_throttle set hits = ${hits}, window_started_at = ${ts(state.windowStart)}, locked_until = ${ts(lockedUntil)}, updated_at = ${ts(now)} where bucket = ${b.key}`);
    }
    return { ok: true } as const;
  });

  // Opportunistic cleanup of long-idle rows (~1% of calls) so the table never grows unbounded.
  if (Math.random() < 0.01) {
    void db.execute(sql`delete from auth_email_throttle where updated_at < now() - interval '2 days' and (locked_until is null or locked_until < now())`).catch(() => {});
  }
  return result;
}

/** Read-only check: is any of these buckets locked right now? (Used before a login attempt.) */
export async function peek(buckets: Bucket[], now = new Date()): Promise<ThrottleResult> {
  const keys = buckets.map(b => b.key);
  const rows = (await getDb().execute(sql`select bucket, hits, window_started_at, locked_until from auth_email_throttle where bucket in ${inList(keys)}`)) as unknown as Row[];
  let worst: ThrottleResult = { ok: true };
  for (const b of buckets) {
    const state = normalize(rows.find(r => r.bucket === b.key), b.rule, now);
    if (state.lockedUntil) {
      const retry = Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000);
      if (worst.ok || retry > worst.retryAfterSeconds) worst = { ok: false, retryAfterSeconds: retry, lockedUntil: state.lockedUntil.toISOString(), reason: reasonOf(b.key) };
    }
  }
  return worst;
}

/** Give a hit back (the provider rejected the request, so no email actually went out). */
export async function refund(buckets: Bucket[], now = new Date()): Promise<void> {
  const db = getDb();
  for (const b of buckets) {
    await db.execute(sql`update auth_email_throttle set hits = greatest(hits - 1, 0), locked_until = case when hits - 1 < ${b.rule.limit} then null else locked_until end, updated_at = ${ts(now)} where bucket = ${b.key}`);
  }
}

/** Forget buckets entirely (a successful login clears that browser's/account's failure count). */
export async function clear(buckets: Bucket[]): Promise<void> {
  const keys = buckets.map(b => b.key);
  if (!keys.length) return;
  await getDb().execute(sql`delete from auth_email_throttle where bucket in ${inList(keys)}`);
}

export async function browserQuota(browserKey: string, now = new Date()): Promise<BrowserQuota> {
  const rule = emailRules().browser;
  const rows = (await getDb().execute(sql`select bucket, hits, window_started_at, locked_until from auth_email_throttle where bucket = ${browserKey}`)) as unknown as Row[];
  const state = normalize(rows[0], rule, now);
  const retryAfterSeconds = state.lockedUntil ? Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000) : 0;
  const used = Math.min(state.hits, rule.limit);
  return {
    limit: rule.limit,
    used,
    remaining: state.lockedUntil ? 0 : Math.max(rule.limit - used, 0),
    lockedUntil: state.lockedUntil ? state.lockedUntil.toISOString() : null,
    retryAfterSeconds,
  };
}

// ---- request helpers ------------------------------------------------------------------------

export type RequestIdentity = { browserId: string | null; ipHash: string };

export async function requestIdentity(): Promise<RequestIdentity> {
  const cookieStore = await cookies();
  const h = await headers();
  return {
    browserId: await verifyBrowserId(cookieStore.get(BROWSER_ID_COOKIE)?.value),
    ipHash: await privacyHash("ip", clientIp(h)),
  };
}

export const browserBucketKey = (browserId: string) => `email:browser:${browserId}`;

export async function emailBuckets(identity: RequestIdentity & { browserId: string }, recipientEmail: string): Promise<Bucket[]> {
  const r = emailRules();
  return [
    { key: browserBucketKey(identity.browserId), rule: r.browser },
    { key: `email:ip:${identity.ipHash}`, rule: r.ip },
    { key: `email:recipient:${await privacyHash("email", recipientEmail.trim().toLowerCase())}`, rule: r.recipient },
  ];
}

export async function loginBuckets(identity: RequestIdentity & { browserId: string }, email: string): Promise<Bucket[]> {
  const r = loginRules();
  return [
    { key: `login:browser:${identity.browserId}`, rule: r.browser },
    { key: `login:ip:${identity.ipHash}`, rule: r.ip },
    { key: `login:account:${await privacyHash("email", email.trim().toLowerCase())}`, rule: r.account },
  ];
}

export function lockedMessage(result: Extract<ThrottleResult, { ok: false }>, what: "email" | "login"): string {
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  if (what === "login") return `Too many unsuccessful sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  if (result.reason === "browser") return `This browser has reached its limit of ${emailRules().browser.limit} emails. You can try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  if (result.reason === "recipient") return `Too many emails have been sent to this address. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  return `Too many email requests from your network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
