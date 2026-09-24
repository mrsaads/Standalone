// Local test for the auth-email / login throttle against a REAL Postgres (not Supabase).
//   DATABASE_URL=postgres://postgres:pg@localhost:5432/ixthrottle npx tsx scripts/local-tests/auth-throttle.local-test.mts
// The database must already have drizzle/0006_auth_email_throttle.sql applied.
import assert from "node:assert/strict";
import postgres from "postgres";
import { browserBucketKey, browserQuota, clear, consume, emailRules, peek, refund, type Bucket } from "../../lib/security/email-throttle";
import { mintBrowserId, verifyBrowserId, privacyHash } from "../../lib/security/browser-id";
import { safeNextPath, isTrustedOrigin } from "../../lib/http";

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const pg = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
await pg`delete from auth_email_throttle`;

const rules = emailRules();
const t0 = new Date("2026-09-24T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const browser = (id: string): Bucket => ({ key: browserBucketKey(id), rule: rules.browser });
const ip = (id: string): Bucket => ({ key: `email:ip:${id}`, rule: rules.ip });
const recipient = (id: string): Bucket => ({ key: `email:recipient:${id}`, rule: rules.recipient });

console.log("auth email throttle");

await test("defaults: 10 per browser, 30-minute lock", () => {
  assert.equal(rules.browser.limit, 10);
  assert.equal(rules.browser.lockMinutes, 30);
});

await test("a browser can send exactly 10 emails (10 different recipients), the 11th is refused", async () => {
  for (let i = 1; i <= 10; i++) {
    const r = await consume([browser("B1"), ip("IP1"), recipient(`R${i}`)], at(i * 0.1));
    assert.equal(r.ok, true, `email ${i} should be allowed`);
  }
  const r11 = await consume([browser("B1"), ip("IP1"), recipient("R11")], at(1.2));
  assert.equal(r11.ok, false);
  if (!r11.ok) {
    assert.equal(r11.reason, "browser");
    // locked at the 10th send (t=1.0 min) for 30 min -> 28.8 min left at t=1.2
    assert.equal(r11.retryAfterSeconds, Math.ceil((30 - 0.2) * 60));
  }
});

await test("quota endpoint data shows 0 remaining and a countdown while locked", async () => {
  const q = await browserQuota(browserBucketKey("B1"), at(5));
  assert.equal(q.remaining, 0);
  assert.equal(q.used, 10);
  assert.ok(q.lockedUntil);
  assert.equal(q.retryAfterSeconds, 26 * 60);
});

await test("the refused attempt did not add hits anywhere (IP bucket still at 10)", async () => {
  const [row] = await pg`select hits from auth_email_throttle where bucket = ${"email:ip:IP1"}`;
  assert.equal(row!.hits, 10);
});

await test("a DIFFERENT browser on the same network is not locked by B1", async () => {
  const r = await consume([browser("B2"), ip("IP1"), recipient("R-other")], at(6));
  assert.equal(r.ok, true);
});

await test("still locked at 29m59s after the lock started", async () => {
  const r = await consume([browser("B1"), ip("IP1"), recipient("R12")], at(1 + 29.99));
  assert.equal(r.ok, false);
});

await test("after 30 minutes the browser is fully reset: 10 fresh emails again", async () => {
  const q = await browserQuota(browserBucketKey("B1"), at(31.01));
  assert.equal(q.remaining, 10);
  assert.equal(q.lockedUntil, null);
  const r = await consume([browser("B1"), ip("IP9"), recipient("R-new")], at(31.01));
  assert.equal(r.ok, true);
  const q2 = await browserQuota(browserBucketKey("B1"), at(31.02));
  assert.equal(q2.remaining, 9);
});

await test("clearing cookies (new browser id) does NOT dodge the network limit", async () => {
  await pg`delete from auth_email_throttle`;
  for (let i = 0; i < rules.ip.limit; i++) {
    const r = await consume([browser(`fresh-${i}`), ip("IP-X"), recipient(`X${i}`)], at(i * 0.01));
    assert.equal(r.ok, true);
  }
  const r = await consume([browser("fresh-last"), ip("IP-X"), recipient("X-last")], at(1));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "ip");
});

await test("one inbox can't be flooded: 5 emails per recipient address, then locked", async () => {
  await pg`delete from auth_email_throttle`;
  for (let i = 0; i < 5; i++) assert.equal((await consume([browser(`b${i}`), ip(`ip${i}`), recipient("victim")], at(i))).ok, true);
  const r = await consume([browser("b9"), ip("ip9"), recipient("victim")], at(6));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "recipient");
});

await test("refund gives back a hit when the provider refused (no email went out)", async () => {
  await pg`delete from auth_email_throttle`;
  const buckets = [browser("RF"), ip("RFip"), recipient("RFr")];
  for (let i = 0; i < 10; i++) await consume([browser("RF"), ip("RFip"), recipient(`RF${i}`)], at(0));
  assert.equal((await browserQuota(browserBucketKey("RF"), at(0))).remaining, 0);
  await refund(buckets, at(0));
  const q = await browserQuota(browserBucketKey("RF"), at(0));
  assert.equal(q.remaining, 1);
  assert.equal(q.lockedUntil, null);
});

await test("concurrency: 25 simultaneous sends from one browser -> exactly 10 succeed", async () => {
  await pg`delete from auth_email_throttle`;
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => consume([browser("RACE"), ip(`rip${i}`), recipient(`rr${i}`)], at(0))));
  assert.equal(results.filter(r => r.ok).length, 10);
});

await test("login lockout: peek sees a lock; clear removes it", async () => {
  const bucket: Bucket = { key: "login:account:acc1", rule: { limit: 3, windowMinutes: 15, lockMinutes: 15 } };
  for (let i = 0; i < 3; i++) await consume([bucket], at(0));
  const p = await peek([bucket], at(1));
  assert.equal(p.ok, false);
  await clear([bucket]);
  assert.equal((await peek([bucket], at(1))).ok, true);
});

await test("hits older than the window stop counting (no lock)", async () => {
  const b: Bucket = { key: "email:browser:slow", rule: { limit: 10, windowMinutes: 60, lockMinutes: 30 } };
  for (let i = 0; i < 9; i++) await consume([b], at(0));
  const r = await consume([b], at(61)); // new window
  assert.equal(r.ok, true);
  const [row] = await pg`select hits, locked_until from auth_email_throttle where bucket = ${b.key}`;
  assert.equal(row!.hits, 1);
  assert.equal(row!.locked_until, null);
});

console.log("browser id + helpers");

await test("browser id cookie: valid signature verifies; tampered/forged ones don't", async () => {
  const v = await mintBrowserId();
  const id = await verifyBrowserId(v);
  assert.ok(id && id.length === 32);
  const [raw, sig] = v.split(".");
  assert.equal(await verifyBrowserId(`${raw}.${sig!.slice(0, -2)}AA`), null);
  assert.equal(await verifyBrowserId(`${"A".repeat(32)}.${sig}`), null);
  assert.equal(await verifyBrowserId("garbage"), null);
  assert.equal(await verifyBrowserId(undefined), null);
});

await test("IPs/emails are stored hashed, stable per value, different across values", async () => {
  const a = await privacyHash("ip", "1.2.3.4");
  assert.equal(a, await privacyHash("ip", "1.2.3.4"));
  assert.notEqual(a, await privacyHash("ip", "1.2.3.5"));
  assert.ok(!a.includes("1.2.3.4"));
});

await test("safeNextPath blocks open redirects and javascript: URLs", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "@evil.com", "/%0d%0aSet-Cookie:x", "\\\\evil.com", ""]) {
    const out = safeNextPath(bad);
    assert.ok(out.startsWith("/") && !out.startsWith("//"), `${bad} -> ${out}`);
    assert.ok(!out.includes("evil.com") || out.startsWith("/%"), `${bad} -> ${out}`);
  }
  assert.equal(safeNextPath("javascript:alert(1)"), "/");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("/reset-password/confirm"), "/reset-password/confirm");
  assert.equal(safeNextPath("/audit?openAudit=abc"), "/audit?openAudit=abc");
});

await test("origin check refuses cross-site requests even without an Origin header", () => {
  const mk = (h: Record<string, string>) => new Request("http://internal:10000/api/x", { method: "POST", headers: h });
  assert.equal(isTrustedOrigin(mk({ host: "app.test", origin: "https://app.test", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isTrustedOrigin(mk({ host: "app.test", origin: "https://evil.test" })), false);
  assert.equal(isTrustedOrigin(mk({ host: "app.test", "sec-fetch-site": "cross-site" })), false);
  assert.equal(isTrustedOrigin(mk({ host: "app.test", origin: "https://app.test", "sec-fetch-site": "same-site" })), false);
});

await pg.end();
console.log(`\n${passed} passed`);
process.exit(0);
