// Full local rehearsal of "Connect Upwork": a MOCK Upwork (sign-in page, token and GraphQL), a stub
// AI, the real app in dev mode and a real Postgres. It clicks through exactly what a visitor's browser
// does, one HTTP request at a time, including the failure paths. It proves the app's side of the flow;
// it says nothing about what the real Upwork returns (run scripts/upwork-api/probe.mjs for that).
// Needs: Postgres with drizzle/0011 applied (DATABASE_URL), `npm ci`. Run: npm run test:local:upwork-e2e
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { chromium } from 'playwright';

const DB = process.env.DATABASE_URL;
if (!DB) throw new Error('Set DATABASE_URL to a throwaway Postgres.');
const APP = 3199, UP = 4010, AI = 4799;
const KEY = '~01abcdef0123456789';
let mode = 'ok'; // ok | token_fail | scope | no_identity
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };

// ---- mock Upwork -----------------------------------------------------------------------------
const PROFILE = { personalData: { firstName: 'Sara', lastName: 'Khan', title: 'Shopify Developer | Store Speed and Fixes',
  description: 'Slow Shopify stores lose sales every day. I help store owners cut load time and fix checkout bugs without breaking their theme.\n\nSend me your store link and I will tell you what to fix first.',
  location: { country: 'Pakistan', city: 'Lahore' } }, profileAggregates: { totalJobs: 24, totalFeedback: 18, topRatedStatus: 'TOP_RATED' } };
const upwork = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const url = new URL(req.url, `http://127.0.0.1:${UP}`);
    if (url.pathname === '/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri'));
      if (mode === 'deny') back.searchParams.set('error', 'access_denied'); else back.searchParams.set('code', 'one-time-code');
      if (url.searchParams.get('state') && mode !== 'no_state') back.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: back.href }); return res.end();
    }
    if (url.pathname === '/token') {
      if (mode === 'token_fail') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"invalid_grant"}'); }
      const p = new URLSearchParams(body);
      if (p.get('client_secret') !== 'csecret' || p.get('code') !== 'one-time-code') { res.writeHead(401); return res.end('{}'); }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"access_token":"tok-abcdefgh","expires_in":86400}');
    }
    if (url.pathname === '/graphql') {
      const { query, variables } = JSON.parse(body || '{}');
      if (req.headers.authorization !== 'Bearer tok-abcdefgh') { res.writeHead(401); return res.end('{}'); }
      const send = obj => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (query.includes('user {')) return send({ data: { user: { id: '1', publicUrl: mode === 'no_identity' ? null : `https://www.upwork.com/freelancers/${KEY}` } } });
      if (mode === 'scope') return send({ data: null, errors: [{ message: 'Permission denied: Freelancer Profile scope required' }] });
      if (variables.profileKey !== KEY) return send({ data: { talentProfileByProfileKey: null } });
      if (/skills|employmentRecords|projectList/.test(query)) return send({ data: null, errors: [{ message: 'Unknown field in this mock' }] });
      return send({ data: { talentProfileByProfileKey: PROFILE } });
    }
    res.writeHead(404); res.end();
  });
}).listen(UP, '127.0.0.1');

// ---- stub AI ---------------------------------------------------------------------------------
let aiCalls = 0; let aiPrompt = ''; let aiFailure = false;
const ai = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    if (aiFailure) { res.writeHead(503); return res.end('{}'); }
    aiCalls++; aiPrompt = JSON.parse(body || '{}').messages?.[0]?.content || '';
    const answer = { title: { points: 6, note: 'Clear niche.' }, hook: { points: 6, note: 'Opens with the client problem.' }, flow: { points: 9, note: 'Readable.' },
      proof: { points: 4, note: 'One number.' }, keywords: { points: 7, note: 'Shopify repeated.' }, cta: { points: 3, note: 'Asks for the store link.' },
      topFlaws: ['Add two numbers', 'Shorten the intro', 'Add a second niche keyword'], strengths: ['Clear niche'] };
    res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_stub' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(answer) }] }));
  });
}).listen(AI, '127.0.0.1');

// ---- the app ---------------------------------------------------------------------------------
const env = { ...process.env, NODE_ENV: 'development', PORT: String(APP), SUPABASE_DB_URL: DB, ANTHROPIC_API_KEY: 'stub', ANTHROPIC_BASE_URL: `http://127.0.0.1:${AI}`,
  UPWORK_API_CLIENT_ID: 'cid', UPWORK_API_CLIENT_SECRET: 'csecret', UPWORK_API_ALLOW_LOCAL_TEST: '1',
  UPWORK_API_AUTHORIZE_URL: `http://127.0.0.1:${UP}/authorize`, UPWORK_API_TOKEN_URL: `http://127.0.0.1:${UP}/token`, UPWORK_API_GRAPHQL_URL: `http://127.0.0.1:${UP}/graphql`,
  UPWORK_API_REDIRECT_URI: `http://127.0.0.1:${APP}/api/upwork/callback`, APP_ORIGIN: `http://127.0.0.1:${APP}`, PROFILE_SCORE_IP_LIMIT: '200', PROFILE_SCORE_CONTACT_LIMIT: '200', PROFILE_SCORE_BROWSER_LIMIT: '200', UPWORK_CONNECT_IP_LIMIT: '500' };
delete env.UPWORK_BROWSER_URL; delete env.SUPABASE_URL; delete env.SUPABASE_ANON_KEY;
const generated = new Map(['next-env.d.ts', 'AGENTS.md', 'CLAUDE.md'].map(file => { try { return [file, readFileSync(file)]; } catch { return [file, null]; } }));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '-p', String(APP)], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} upwork.close(); ai.close(); };
process.on('exit', stop);

const sql = postgres(DB, { max: 2 });
const base = `http://127.0.0.1:${APP}`;
try {
for (let i = 0; i < 120; i++) { try { const r = await fetch(`${base}/robots.txt`); if (r.ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 1000)); if (i === 119) throw new Error('app did not start\n' + log.slice(-2000)); }

// A tiny browser: keeps cookies, follows redirects by hand so each hop can be inspected.
const jar = new Map();
const store = res => { for (const c of res.headers.getSetCookie?.() ?? []) { const [pair, ...attrs] = c.split(/;\s*/); const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]; if (/max-age=0/i.test(attrs.join(';')) || v === '') jar.delete(k); else jar.set(k, v); } };
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const hop = async (url, init = {}) => { const r = await fetch(url, { redirect: 'manual', ...init, headers: { ...(init.headers || {}), cookie: cookieHeader() } }); store(r); return r; };
const signIn = async () => {
  const start = await hop(`${base}/api/upwork/connect`);
  assert.equal(start.status, 302);
  const toUpwork = await hop(start.headers.get('location'));
  assert.equal(toUpwork.status, 302);
  return hop(toUpwork.headers.get('location')); // the callback, with the state cookie
};
const score = (extra = {}) => hop(`${base}/api/profile-score`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
  submissionId: crypto.randomUUID(), profileUrl: '', overview: '', email: '', whatsappCountry: 'PK', whatsappNumber: `300${Math.floor(1000000 + Math.random() * 8999999)}`, consent: true, website: '', connected: true, ...extra }) });
const heldRows = async () => Number((await sql`select count(*)::int as n from upwork_connections`)[0].n);

await test('the score page offers "Connect Upwork" when a key is configured', async () => {
  const html = await (await fetch(`${base}/profile-score`)).text();
  assert.match(html, /Connect Upwork to score from your real profile/);
});

await test('cancelled sign-in restores contact details and connected retries hide pasted-overview controls', async () => {
  const browser = await chromium.launch({ executablePath: process.env.UPWORK_BROWSER_EXECUTABLE_PATH || undefined, args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => window.sessionStorage.setItem('ix_ps_pending', JSON.stringify({
      waCountry: 'PK', waNumber: '3001234567', email: 'retry@example.com', consent: true, savedAt: Date.now(),
    })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/profile-score?upwork=denied`);
    await page.waitForFunction(() => document.querySelector('#ps-whatsapp')?.value === '3001234567', {}, { timeout: 15000 }).catch(async () => {
      console.error(log.slice(-2000));
      throw new Error(`Contact restore failed: ${JSON.stringify({ errors, state: await page.evaluate(() => ({ search: location.search, value: document.querySelector('#ps-whatsapp')?.value, pending: sessionStorage.getItem('ix_ps_pending') })) })}`);
    });
    assert.equal(await page.locator('#ps-email').inputValue(), 'retry@example.com');
    assert.equal(await page.locator('#ps-consent').getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Connect Upwork to score from your real profile' }).isEnabled(), true);
    await page.route('**/api/profile-score', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Retry the connected profile' }) }));
    await page.goto(`${base}/profile-score?connected=1`);
    await page.getByRole('alert').filter({ hasText: 'Retry the connected profile' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Add your overview for a fuller score/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Score my connected profile' }).isEnabled(), true);
    await context.close();
  } finally { await browser.close(); }
});

await test('connect sends the browser to Upwork with a state cookie, and the callback holds the profile', async () => {
  await sql`delete from upwork_connections`;
  const start = await hop(`${base}/api/upwork/connect`);
  const loc = new URL(start.headers.get('location'));
  assert.equal(loc.origin, `http://127.0.0.1:${UP}`); assert.equal(loc.searchParams.get('client_id'), 'cid'); assert.equal(loc.searchParams.get('response_type'), 'code');
  assert.ok(jar.get('ix_uw_state'), 'state cookie set');
  const toUpwork = await hop(loc.href);
  const callback = await hop(toUpwork.headers.get('location'));
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location'), /\/profile-score\?connected=1$/);
  assert.ok(jar.get('ix_uw_conn'), 'pointer cookie set'); assert.ok(!jar.get('ix_uw_state'), 'state cookie cleared');
  assert.equal(await heldRows(), 1);
  const [row] = await sql`select payload from upwork_connections`;
  assert.ok(!JSON.stringify(row.payload).includes('tok-abcdefgh'), 'no access token is stored');
  assert.equal(row.payload.snapshot.name, 'Sara Khan');
});

await test('scoring with only the sign-in: no link, no pasted overview; the real profile text reaches the scorer', async () => {
  const before = aiCalls;
  const r = await score();
  assert.equal(r.status, 200, await r.clone().text());
  const body = await r.json();
  assert.equal(body.result.profile.name, 'Sara Khan');
  assert.equal(body.result.assessedPoints, 65);
  assert.equal(body.result.offer, null);
  assert.equal(body.result.track, null);
  assert.equal(aiCalls, before + 1, 'one model call');
  assert.match(aiPrompt, /Slow Shopify stores lose sales every day/, 'the overview from Upwork was scored');
  assert.match(aiPrompt, /Shopify Developer \| Store Speed and Fixes/, 'the title from Upwork was scored');
  assert.equal(await heldRows(), 0, 'held profile deleted after use'); assert.ok(!jar.get('ix_uw_conn'), 'pointer cookie cleared');
  const [lead] = await sql`select profile_link, source, goals from leads where source='profile_score' order by created_at desc limit 1`;
  assert.equal(lead.profile_link, `https://www.upwork.com/freelancers/${KEY}`); assert.match(lead.goals, /score|Score|\d/);
});

await test('the same sign-in cannot be used twice', async () => {
  const r = await score();
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'CONNECTION_EXPIRED');
});

await test('a connected request with no pointer cookie is refused, not scored', async () => {
  jar.clear(); const before = aiCalls;
  const r = await score();
  assert.equal(r.status, 409); assert.equal(aiCalls, before);
});

await test('a pointer cookie naming someone else’s or a made-up row gets nothing', async () => {
  jar.clear(); jar.set('ix_uw_conn', crypto.randomUUID()); const before = aiCalls;
  assert.equal((await score()).status, 409);
  jar.set('ix_uw_conn', "x'; drop table leads;--"); assert.equal((await score()).status, 409); assert.equal(aiCalls, before);
});

await test('callback with a wrong or missing state is refused and nothing is held', async () => {
  jar.clear(); await sql`delete from upwork_connections`;
  const start = await hop(`${base}/api/upwork/connect`);
  const forged = new URL(`${base}/api/upwork/callback`); forged.searchParams.set('code', 'one-time-code'); forged.searchParams.set('state', 'forged');
  const r = await hop(forged.href);
  assert.match(r.headers.get('location'), /upwork=invalid/); assert.equal(await heldRows(), 0);
  jar.clear(); // no cookie at all
  const r2 = await hop(forged.href);
  assert.match(r2.headers.get('location'), /upwork=invalid/); assert.equal(start.status, 302);
});

await test('Upwork not echoing `state` fails closed', async () => {
  jar.clear(); mode = 'no_state';
  const r = await signIn();
  assert.match(r.headers.get('location'), /upwork=invalid/); assert.equal(await heldRows(), 0); mode = 'ok';
});

await test('the customer pressing Cancel on Upwork gets a clear message and nothing is held', async () => {
  jar.clear(); mode = 'deny'; const r = await signIn();
  assert.match(r.headers.get('location'), /upwork=denied/); assert.equal(await heldRows(), 0); mode = 'ok';
});

await test('a refused token exchange: no profile, no score', async () => {
  jar.clear(); mode = 'token_fail'; const r = await signIn();
  assert.match(r.headers.get('location'), /upwork=failed/); assert.equal(await heldRows(), 0); mode = 'ok';
});

await test('Upwork withholding the profile permission is reported as such', async () => {
  jar.clear(); mode = 'scope'; const r = await signIn();
  assert.match(r.headers.get('location'), /upwork=scope/); assert.equal(await heldRows(), 0); mode = 'ok';
});

await test('a sign-in that cannot show which profile is yours reads nothing', async () => {
  jar.clear(); mode = 'no_identity'; const r = await signIn();
  assert.match(r.headers.get('location'), /upwork=failed/); assert.equal(await heldRows(), 0); mode = 'ok';
});

await test('simultaneous score requests consume one connection and make one AI call', async () => {
  jar.clear(); await signIn();
  const before = aiCalls;
  const responses = await Promise.all([score(), score()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(aiCalls, before + 1);
  assert.equal(await heldRows(), 0);
});

await test('audit connections return to the audit workspace and remain available for import', async () => {
  jar.clear();
  const start = await hop(`${base}/api/upwork/connect?destination=audits`);
  assert.equal(jar.get('ix_uw_destination'), 'audits');
  const provider = await hop(start.headers.get('location'));
  const callback = await hop(provider.headers.get('location'));
  assert.equal(callback.headers.get('location'), `${base}/audits?connected=1`);
  assert.equal(jar.has('ix_uw_destination'), false);
  assert.equal(await heldRows(), 1);
  jar.clear();
  const badStart = await hop(`${base}/api/upwork/connect?destination=https://evil.example`);
  const badProvider = await hop(badStart.headers.get('location'));
  const safeCallback = await hop(badProvider.headers.get('location'));
  assert.equal(safeCallback.headers.get('location'), `${base}/profile-score?connected=1`);
  await sql`delete from upwork_connections`;
});

await test('the AI failing after a good sign-in keeps the profile for a retry instead of making the customer sign in again', async () => {
  jar.clear(); await signIn();
  assert.equal(await heldRows(), 1);
  aiFailure = true;
  const failed = await score();
  assert.ok(failed.status >= 500, `status ${failed.status}`);
  assert.equal(await heldRows(), 1, 'still held'); assert.ok(jar.get('ix_uw_conn'), 'pointer still there');
  aiFailure = false;
  assert.equal((await score()).status, 200);
  assert.equal(await heldRows(), 0, 'restored evidence can be scored on retry');
});

console.log(`\n${passed} passed, 0 failed`);
} finally {
  stop();
  if (server.exitCode === null) {
    await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  await sql.end();
  for (const [file, contents] of generated) {
    if (contents === null) rmSync(file, { force: true }); else writeFileSync(file, contents);
  }
}
