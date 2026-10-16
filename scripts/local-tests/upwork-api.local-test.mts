// "Connect Upwork": the official-API route. Everything here runs against a MOCK of Upwork that
// returns the shapes lib/upwork-connected.ts ASSUMES. It proves our plumbing (sign-in URL, token
// exchange, tolerant reading, ownership, the single-use holding row, fail-closed behaviour). It does
// NOT prove what Upwork really returns; only scripts/upwork-api/probe.mjs with a real key can.
// Needs a Postgres with drizzle/0011_upwork_connections.sql applied (DATABASE_URL).
// Run: npm run test:local:upwork-api
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { upworkConnections } from "../../db/schema";
import { upworkReturnPath } from "../../lib/upwork-connect-flow";
import { buildAuthorizeUrl, exchangeCode, graphql, sameSecret, upworkApiConfig, UpworkApiError } from "../../lib/upwork-api";
import {
  connectedAuditPreview, claimEvidence, discardEvidence, evidenceFromProfile, evidenceText, holdEvidence, peekEvidence, profileKeyFrom, readOwnProfile, takeEvidence, restoreEvidence,
} from "../../lib/upwork-connected";
import { assembleResult, parseAiScores, validateScoreRequest } from "../../lib/profile-score";

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log(`ok - ${name}`); };

const ENV = { UPWORK_API_CLIENT_ID: "cid", UPWORK_API_CLIENT_SECRET: "csecret", NEXT_PUBLIC_SITE_URL: "https://www.improvexus.com" } as unknown as NodeJS.ProcessEnv;
const cfg = upworkApiConfig(ENV)!;
const KEY = "~01abcdef0123456789";

// ---- configuration -------------------------------------------------------------------------------
await test("off without a key; on with one; callback derived from the site address", () => {
  assert.equal(upworkApiConfig({} as unknown as NodeJS.ProcessEnv, "https://x.example"), null);
  assert.equal(upworkApiConfig({ UPWORK_API_CLIENT_ID: "a" } as unknown as NodeJS.ProcessEnv, "https://x.example"), null);
  assert.equal(cfg.redirectUri, "https://www.improvexus.com/api/upwork/callback");
});
await test("addresses can only be overridden to https upwork.com hosts; a plain-http callback is refused", () => {
  const bad = (extra: Record<string, string>) => upworkApiConfig({ ...ENV, ...extra } as unknown as NodeJS.ProcessEnv);
  assert.equal(bad({ UPWORK_API_TOKEN_URL: "https://evil.example/token" }), null);
  assert.equal(bad({ UPWORK_API_GRAPHQL_URL: "http://api.upwork.com/graphql" }), null);
  assert.equal(bad({ UPWORK_API_AUTHORIZE_URL: "https://upwork.com.evil.example/x" }), null);
  assert.equal(bad({ UPWORK_API_REDIRECT_URI: "http://www.improvexus.com/api/upwork/callback" }), null);
  assert.ok(bad({ UPWORK_API_TOKEN_URL: "https://www.upwork.com/api/v3/oauth2/token" }));
});
await test("the sign-in address carries client id, callback, code flow and state", () => {
  const u = new URL(buildAuthorizeUrl(cfg, "st4te"));
  assert.equal(u.origin + u.pathname, "https://www.upwork.com/ab/account-security/oauth2/authorize");
  assert.equal(u.searchParams.get("response_type"), "code"); assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("redirect_uri"), cfg.redirectUri); assert.equal(u.searchParams.get("state"), "st4te");
});
await test("secret comparison is exact", () => { assert.ok(sameSecret("abc", "abc")); assert.ok(!sameSecret("abc", "abd")); assert.ok(!sameSecret("abc", "")); });

await test("callback URLs must be valid and feature detection needs a real app origin", () => {
  for (const address of ["https://", "https://user:password@app.example/api/upwork/callback", "https://app.example/other", "https://app.example/api/upwork/callback?x=1", "https://app.example/api/upwork/callback#fragment"]) {
    assert.equal(upworkApiConfig({ ...ENV, UPWORK_API_REDIRECT_URI: address }), null);
  }
  assert.equal(upworkApiConfig({ ...ENV, NEXT_PUBLIC_SITE_URL: undefined, UPWORK_API_REDIRECT_URI: undefined }), null);
  assert.equal(upworkApiConfig({ ...ENV, NEXT_PUBLIC_SITE_URL: undefined, RENDER_EXTERNAL_URL: "https://app.onrender.com" })?.redirectUri, "https://app.onrender.com/api/upwork/callback");
});

// ---- token exchange ------------------------------------------------------------------------------
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
await test("code is traded for a token with the secret in the body, never the URL", async () => {
  let seen: { url: string; body: string } | null = null;
  const token = await exchangeCode(cfg, "the-code", (async (url: string, init: RequestInit) => { seen = { url, body: String(init.body) }; return json({ access_token: "tok-123456789" }); }) as unknown as typeof fetch);
  assert.equal(token, "tok-123456789");
  assert.equal(seen!.url, cfg.tokenUrl); assert.ok(!seen!.url.includes("csecret"));
  const p = new URLSearchParams(seen!.body);
  assert.equal(p.get("grant_type"), "authorization_code"); assert.equal(p.get("code"), "the-code"); assert.equal(p.get("client_secret"), "csecret"); assert.equal(p.get("redirect_uri"), cfg.redirectUri);
});
await test("a refused or malformed token answer fails closed", async () => {
  await assert.rejects(exchangeCode(cfg, "c", (async () => json({ error: "invalid_grant" }, 400)) as unknown as typeof fetch), (e: unknown) => e instanceof UpworkApiError && e.code === "token_exchange");
  await assert.rejects(exchangeCode(cfg, "c", (async () => json({ nope: 1 })) as unknown as typeof fetch), (e: unknown) => e instanceof UpworkApiError && e.code === "shape");
  await assert.rejects(exchangeCode(cfg, "c", (async () => { throw new Error("down"); }) as unknown as typeof fetch), (e: unknown) => e instanceof UpworkApiError && e.code === "network");
});
await test("graphql: bearer token, errors returned as data, 401 is its own failure", async () => {
  let auth = "";
  const r = await graphql(cfg, "tok", "query{a}", {}, (async (_u: string, init: RequestInit) => { auth = String((init.headers as Record<string, string>).Authorization); return json({ data: null, errors: [{ message: "Cannot query field x" }] }); }) as unknown as typeof fetch);
  assert.equal(auth, "Bearer tok"); assert.equal(r.errors[0].message, "Cannot query field x");
  await assert.rejects(graphql(cfg, "t", "q", {}, (async () => json({}, 401)) as unknown as typeof fetch), (e: unknown) => e instanceof UpworkApiError && e.code === "unauthorized");
});

// ---- reading the customer's own profile ----------------------------------------------------------
const PROFILE = {
  personalData: { firstName: "Sara", lastName: "Khan", title: "Shopify Developer | Store Speed and Fixes", description: "Slow Shopify stores lose sales every day. I help store owners cut load time and fix checkout bugs without breaking their theme.\r\nSend me your store link.", location: { country: "Pakistan", state: null, city: "Lahore" } },
  profileAggregates: { totalJobs: 24, totalFeedback: 18, topRatedStatus: "TOP_RATED", lastWorkedOn: "2026-09-01" },
  skills: [{ name: "Shopify" }, { name: "Liquid" }],
  employmentRecords: [{ companyName: "Acme", jobTitle: "Theme developer", startDate: "2022-01", endDate: null, description: "Built themes." }],
  projectList: [{ title: "Speed overhaul", description: "Cut load time by half." }],
};
type Handler = (query: string, variables: Record<string, unknown>) => Response;
const mock = (handler: Handler, log: { query: string; variables: Record<string, unknown> }[] = []) => (async (_u: string, init: RequestInit) => {
  const { query, variables } = JSON.parse(String(init.body)); log.push({ query, variables }); return handler(query, variables);
}) as unknown as typeof fetch;
const identityOk = (query: string) => query.includes("user {") ? json({ data: { user: { id: "1", publicUrl: `https://www.upwork.com/freelancers/${KEY}` } } }) : null;

await test("reads identity, then ONLY that key's profile; richest accepted selection wins", async () => {
  const log: { query: string; variables: Record<string, unknown> }[] = [];
  const r = await readOwnProfile(cfg, "tok", mock((q, v) => identityOk(q) ?? json({ data: { talentProfileByProfileKey: PROFILE } }), log));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.selection, "full (GUESS)");
  assert.deepEqual(log.filter(l => l.query.includes("talentProfileByProfileKey")).map(l => l.variables.profileKey), [KEY]);
  assert.equal(r.evidence.snapshot.name, "Sara Khan"); assert.equal(r.evidence.snapshot.badge, "Top Rated"); assert.equal(r.evidence.snapshot.totalJobs, 24);
  assert.equal(r.evidence.snapshot.location, "Lahore, Pakistan");
  assert.ok(!r.evidence.overview.includes("\r")); assert.deepEqual(r.evidence.sections.skills, ["Shopify", "Liquid"]);
  assert.equal(r.evidence.profileUrl, `https://www.upwork.com/freelancers/${KEY}`);
});
await test("when Upwork rejects the undocumented fields the base selection still works, and the gaps are listed", async () => {
  const r = await readOwnProfile(cfg, "tok", mock((q) => identityOk(q) ?? (q.includes("skills") || q.includes("employmentRecords")
    ? json({ data: null, errors: [{ message: "Field 'name' not found on type TalentSkill" }] })
    : json({ data: { talentProfileByProfileKey: { personalData: PROFILE.personalData, profileAggregates: PROFILE.profileAggregates } } }))));
  assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.selection, "base");
  for (const gap of ["skills", "work history", "portfolio", "Job Success Score", "hourly rate"]) assert.ok(r.evidence.missing.includes(gap), `missing includes ${gap}`);
  assert.equal(r.evidence.snapshot.jss, null); assert.equal(r.evidence.snapshot.hourlyRate, null);
});
await test("no profile key from the sign-in means nothing is read (ownership cannot be shown)", async () => {
  const log: { query: string; variables: Record<string, unknown> }[] = [];
  const r = await readOwnProfile(cfg, "tok", mock(() => json({ data: { user: { id: "1", publicUrl: null } } }), log));
  assert.ok(!r.ok && r.reason === "identity");
  assert.ok(!log.some(l => l.query.includes("talentProfileByProfileKey")), "no profile query was made");
});
await test("a permissions error is reported as such, not as an empty profile", async () => {
  const r = await readOwnProfile(cfg, "tok", mock((q) => identityOk(q) ?? json({ data: null, errors: [{ message: "Permission denied: scope Freelancer Profile required" }] })));
  assert.ok(!r.ok && r.reason === "scope");
});
await test("a profile with neither title nor overview is not scored", async () => {
  const r = await readOwnProfile(cfg, "tok", mock((q) => identityOk(q) ?? json({ data: { talentProfileByProfileKey: { personalData: { firstName: "A" } } } })));
  assert.ok(!r.ok && r.reason === "empty");
});
await test("Upwork down: no exception, no evidence", async () => {
  const r = await readOwnProfile(cfg, "tok", (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
  assert.ok(!r.ok && r.reason === "api");
});
await test("unknown field spellings are tolerated; ids and urls are never copied into the text", () => {
  const e = evidenceFromProfile({ personalData: { title: "Dev", description: "x".repeat(100) }, employmentRecords: [{ position: "Lead", employerName: "Acme", employerId: "999", logoUrl: "https://x" }] }, "https://www.upwork.com/freelancers/~01aa00aa00aa");
  assert.deepEqual(e.sections.employment, ["Lead — Acme"]);
});
await test("profile key is extracted only from a real key", () => {
  assert.equal(profileKeyFrom(`https://www.upwork.com/freelancers/${KEY}`), KEY);
  assert.equal(profileKeyFrom("https://www.upwork.com/freelancers/sara-khan"), null);
  assert.equal(profileKeyFrom(null), null);
  assert.equal(profileKeyFrom(`https://evil.example/freelancers/${KEY}`), null);
  assert.equal(profileKeyFrom(`https://www.upwork.com/freelancers/${KEY}/other`), null);
  assert.equal(profileKeyFrom(`junk ${KEY}`), null);
});
await test("text for the full audit labels what is missing so the audit can leave it unverified", () => {
  const e = evidenceFromProfile(PROFILE, `https://www.upwork.com/freelancers/${KEY}`);
  const t = evidenceText(e);
  assert.match(t, /Title: Shopify Developer/); assert.match(t, /Skills: Shopify, Liquid/); assert.match(t, /Not read from Upwork .*Job Success Score/);
});

await test("metrics absent from API scopes are unassessed, not scored as zero", () => {
  const e = evidenceFromProfile(PROFILE, `https://www.upwork.com/freelancers/${KEY}`);
  const ai = parseAiScores(JSON.stringify(Object.fromEntries(["title", "hook", "flow", "proof", "keywords", "cta"].map(id => [id, { points: 1, note: "Evidence" }]))));
  assert.ok(ai);
  const result = assembleResult(e.snapshot, ai, true);
  assert.equal(result.assessedPoints, 65);
  assert.equal(result.track, null);
  assert.equal(result.offer, null);
  assert.equal(result.sections.find(section => section.id === "track")?.checked, false);
  assert.equal(result.sections.find(section => section.id === "offer")?.checked, false);
  assert.ok(result.notChecked.includes("Rate and offer"));
});

await test("audit import uses actual identity and labels unavailable facts without a model call", () => {
  const evidence = evidenceFromProfile(PROFILE, `https://www.upwork.com/freelancers/${KEY}`);
  const preview = connectedAuditPreview(evidence);
  assert.equal(preview.details.name, "Sara Khan");
  assert.equal(preview.details.title, PROFILE.personalData.title);
  assert.equal(preview.details.jobs, "24");
  assert.equal(preview.details.jss, "");
  assert.equal(preview.details.rate, "");
  assert.equal(preview.details.completed, "");
  assert.equal(preview.details.active, "");
  assert.equal(preview.outcome, "partial");
  assert.match(preview.profileText, /Shopify, Liquid/);
  assert.match(preview.profileText, /Not read from Upwork/);
  assert.equal(upworkReturnPath("audits"), "/audits");
  for (const path of ["https://evil.example", "//evil.example", "/admin", null]) assert.equal(upworkReturnPath(path), "/profile-score");
});
await test("large connected profiles keep gap and truncation warnings within the audit size cap", () => {
  const evidence = evidenceFromProfile({ ...PROFILE, projectList: Array.from({ length: 60 }, (_, n) => ({ title: `Project ${n}`, description: "x".repeat(1500) })) }, `https://www.upwork.com/freelancers/${KEY}`);
  assert.equal(evidence.sections.projects.length, 40);
  const text = evidenceText(evidence);
  assert.ok(text.length <= 40000);
  assert.match(text, /^Profile evidence was truncated/);
  assert.match(text, /Not read from Upwork/);
});

// ---- the holding row -----------------------------------------------------------------------------
const evidence = evidenceFromProfile(PROFILE, `https://www.upwork.com/freelancers/${KEY}`);
await test("hold → peek leaves it → claim returns it once → second claim gets nothing", async () => {
  const id = await holdEvidence(evidence);
  assert.equal((await peekEvidence(id))?.snapshot.name, "Sara Khan");
  assert.equal((await peekEvidence(id))?.snapshot.name, "Sara Khan");
  assert.equal((await claimEvidence(id))?.snapshot.name, "Sara Khan");
  assert.equal(await claimEvidence(id), null); assert.equal(await peekEvidence(id), null);
});
await test("four simultaneous claims: exactly one wins", async () => {
  const id = await holdEvidence(evidence);
  const results = await Promise.all([1, 2, 3, 4].map(() => claimEvidence(id)));
  assert.equal(results.filter(Boolean).length, 1);
});
await test("expired rows cannot be read, and are swept by the next hold", async () => {
  const id = await holdEvidence(evidence);
  await getDb().update(upworkConnections).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(upworkConnections.id, id));
  assert.equal(await peekEvidence(id), null); assert.equal(await claimEvidence(id), null);
  await holdEvidence(evidence).then(discardEvidence);
  const rows = await getDb().select({ id: upworkConnections.id }).from(upworkConnections).where(eq(upworkConnections.id, id));
  assert.equal(rows.length, 0, "swept");
});
await test("garbage ids and tampered payloads are refused", async () => {
  assert.equal(await peekEvidence("not-a-uuid"), null); assert.equal(await claimEvidence("' OR 1=1 --"), null); assert.equal(await peekEvidence(randomUUID()), null);
  const id = await holdEvidence(evidence);
  await getDb().update(upworkConnections).set({ payload: { v: 1, junk: true } }).where(eq(upworkConnections.id, id));
  assert.equal(await peekEvidence(id), null);
  await discardEvidence(id);
});

await test("failed scoring restores the same claim once without extending expiry", async () => {
  const id = await holdEvidence(evidence);
  const claim = await takeEvidence(id);
  assert.ok(claim);
  assert.equal(await peekEvidence(id), null);
  await restoreEvidence(claim);
  await restoreEvidence(claim);
  const [row] = await getDb().select().from(upworkConnections).where(eq(upworkConnections.id, id));
  assert.equal(row.expiresAt.getTime(), claim.expiresAt.getTime());
  assert.equal((await takeEvidence(id))?.evidence.snapshot.name, "Sara Khan");
  await restoreEvidence({ ...claim, expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await peekEvidence(id), null);
});

// ---- request validation --------------------------------------------------------------------------
await test("a connected request needs no link; an ordinary request still does", () => {
  const base = { submissionId: randomUUID(), overview: "", email: "", whatsappCountry: "PK", whatsappNumber: "300 1234567", consent: true, website: "" };
  const a = validateScoreRequest({ ...base, profileUrl: "", connected: true });
  assert.ok(a.ok && a.value.connected === true);
  const b = validateScoreRequest({ ...base, profileUrl: "" });
  assert.ok(!b.ok && !!b.fields.profileUrl);
  const c = validateScoreRequest({ ...base, profileUrl: "https://www.upwork.com/freelancers/~01abc0123456789" });
  assert.ok(c.ok && c.value.connected === false);
  assert.ok(!validateScoreRequest({ ...base, profileUrl: "", connected: true, extra: 1 }).ok, "unknown fields are still refused");
});

console.log(`\n${passed} passed, 0 failed`);
await getDb().$client.end();
