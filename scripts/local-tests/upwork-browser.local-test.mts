import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { captureProfile, classifyCapture, profileUrl, allowedResource } from '../upwork-browser/core.mjs';
import { captureHtml, fetchBrowserProfile } from '../../lib/upwork-browser';
import { fetchPublicProfileSnapshot, fetchUpworkProfile } from '../../lib/upwork-fetch';
import { measureOverview, assembleResult, parseAiScores } from '../../lib/profile-score';

const url = 'https://www.upwork.com/freelancers/~test';
const overview = 'I build Shopify stores that turn visitors into customers. My work includes clear product pages, fast storefronts, and checkout improvements. Send me your store link to discuss your next project.';
let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log(`ok - ${name}`); }
check('profile targets reject credentials, lookalike domains, ports and other paths', () => {
  for (const value of ['http://www.upwork.com/freelancers/x', 'https://www.upwork.com.evil.com/freelancers/x', 'https://u:p@www.upwork.com/freelancers/x', 'https://www.upwork.com:444/freelancers/x', 'https://www.upwork.com/ab/messages', 'http://127.0.0.1']) assert.equal(profileUrl(value), null);
  assert.equal(profileUrl(`${url}?tracking=1#x`), url);
  assert.equal(allowedResource('https://evil-upwork.com/x'), false);
  assert.equal(allowedResource('http://127.0.0.1/x'), false);
});
check('challenge, signed-out and incomplete content never become profile evidence', () => {
  const base = { url, title: 'Profile', text: `${overview} Total jobs 28`, overview, heading: 'Test Freelancer' };
  assert.deepEqual(classifyCapture({ ...base, text: 'Verify you are human' }), { ok: false, outcome: 'blocked' });
  assert.deepEqual(classifyCapture({ ...base, url: 'https://www.upwork.com/login' }), { ok: false, outcome: 'login_required' });
  assert.deepEqual(classifyCapture({ ...base, overview: '' }), { ok: false, outcome: 'incomplete' });
});

// Actual Chromium + DOM extraction, with intercepted fixture responses. No Upwork account or
// external network is involved; this proves the implementation, not live Upwork compatibility.
const browser = await chromium.launch({ executablePath: process.env.UPWORK_BROWSER_EXECUTABLE_PATH || undefined });
let capture: Awaited<ReturnType<typeof captureProfile>>;
try {
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `
    <title>Test Freelancer - Shopify Developer - Upwork Freelancer from Lahore, Pakistan</title>
    <meta property="og:title" content="Test Freelancer"><meta property="og:description" content="Shopify Developer">
    <main><h1>Test Freelancer</h1><p>$35.00/hr 100% Job Success Top Rated Plus</p>
    <p>28 Total jobs 3.4K Total hours Skills Portfolio Work history</p>
    <section data-test="profile-overview"><span id="overview">Short preview</span><button onclick="document.getElementById('overview').textContent=${JSON.stringify(overview).replace(/"/g, '&quot;')};this.remove()">more</button></section></main>` }));
  capture = await captureProfile(context, url);
  assert.equal(capture.ok, true);
  if (!capture.ok || !('overview' in capture)) throw new Error('Fixture capture failed');
  check('Chromium expands the overview and captures visible profile evidence', () => {
    assert.equal(capture.overview, overview);
    assert.match(capture.text, /100% Job Success/);
    assert.equal('cookies' in capture, false);
  });
  await context.close();
} finally { await browser.close(); }

let payload: unknown = capture;
let status = 200;
let calls = 0;
const server = createServer(async (req, res) => {
  calls++;
  assert.equal(req.headers.authorization, `Bearer ${'t'.repeat(32)}`);
  let body = ''; for await (const chunk of req) body += chunk;
  assert.equal(JSON.parse(body).url, url);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing server address');
const oldUrl = process.env.UPWORK_BROWSER_URL, oldToken = process.env.UPWORK_BROWSER_TOKEN;
process.env.UPWORK_BROWSER_URL = `http://127.0.0.1:${address.port}`;
process.env.UPWORK_BROWSER_TOKEN = 't'.repeat(32);
try {
  const result = await fetchBrowserProfile(url);
  assert.equal(result.ok, true);
  const snapshot = await fetchPublicProfileSnapshot(url);
  assert.equal(snapshot.ok, true);
  if (!snapshot.ok) throw new Error('Expected parsed snapshot');
  const profile = await fetchUpworkProfile(url);
  check('both scoring and audit paths consume the worker capture without pasted text', () => {
    assert.equal(snapshot.overview, overview);
    assert.equal(snapshot.snapshot.title, 'Shopify Developer');
    assert.equal(snapshot.snapshot.jss, 100);
    assert.equal(snapshot.snapshot.totalJobs, 28);
    assert.equal(profile.outcome, 'success');
    if (profile.outcome === 'success') assert.match(profile.text, /I build Shopify stores/);
    assert.ok(measureOverview(snapshot.overview!).chars > 80);
    const ai = parseAiScores(JSON.stringify({ ...Object.fromEntries(['title','hook','flow','proof','keywords','cta'].map(key => [key, {points: 1, note: 'Observed evidence'}])), topFlaws: ['Improve the opening'], strengths: [] }));
    assert.ok(ai);
    assert.equal(assembleResult(snapshot.snapshot, ai, true).assessedPoints, 100);
  });
  payload = { ...capture, url: 'https://www.upwork.com/freelancers/~other' };
  assert.equal((await fetchBrowserProfile(url)).ok, false); checks++; console.log('ok - wrong-profile captures are rejected');
  for (const outcome of ['login_required', 'blocked', 'incomplete', 'busy', 'timeout']) {
    payload = { ok: false, outcome };
    assert.equal((await fetchBrowserProfile(url)).ok, false);
  }
  checks++; console.log('ok - worker failures never fall back to public-only evidence');
  payload = 'x'.repeat(256001);
  assert.equal((await fetchBrowserProfile(url)).ok, false); checks++; console.log('ok - oversized worker response is rejected');
  status = 401;
  assert.equal((await fetchBrowserProfile(url)).ok, false); checks++; console.log('ok - unauthorized worker response is handled');
  const before = calls;
  await fetchBrowserProfile('https://evil.example/freelancers/x');
  assert.equal(calls, before); checks++; console.log('ok - invalid target does not call worker');
  if (result.ok) check('evidence HTML escapes captured markup', () => assert.ok(!captureHtml({ ...result.capture, text: '<script>alert(1)</script>' }).includes('<script>')));
} finally {
  if (oldUrl === undefined) delete process.env.UPWORK_BROWSER_URL; else process.env.UPWORK_BROWSER_URL = oldUrl;
  if (oldToken === undefined) delete process.env.UPWORK_BROWSER_TOKEN; else process.env.UPWORK_BROWSER_TOKEN = oldToken;
  await new Promise<void>(resolve => server.close(() => resolve()));
}
// Exercise the actual HTTP worker process with an empty, temporary browser session.
// No valid capture request is sent, so this cannot contact Upwork.
const sessionDir = await mkdtemp(join(tmpdir(), 'upwork-worker-test-'));
const worker = spawn(process.execPath, ['scripts/upwork-browser/server.mjs'], {
  env: { ...process.env, UPWORK_BROWSER_TOKEN: 'w'.repeat(32), UPWORK_BROWSER_SESSION_DIR: sessionDir, UPWORK_BROWSER_PORT: String(address.port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
worker.stdout.on('data', chunk => { output += chunk; });
worker.stderr.on('data', chunk => { output += chunk; });
try {
  const endpoint = `http://127.0.0.1:${address.port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50 && worker.exitCode === null; attempt++) {
    try { await fetch(`${endpoint}/health`); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  assert.equal((await fetch(`${endpoint}/live`)).status, 200);
  checks++; console.log('ok - Render liveness probe does not require a service token');
  assert.equal((await fetch(`${endpoint}/desktop/vnc.html`)).status, 404);
  checks++; console.log('ok - operator desktop is disabled outside login mode');
  const unauthorized = await fetch(`${endpoint}/health`);
  assert.equal(unauthorized.status, 401);
  checks++; console.log('ok - real worker requires authentication');
  const health = await fetch(`${endpoint}/health`, { headers: { Authorization: `Bearer ${'w'.repeat(32)}` } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).busy, false);
  checks++; console.log('ok - persistent Chromium worker starts and answers health');
  const invalid = await fetch(`${endpoint}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${'w'.repeat(32)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1/private' }) });
  assert.equal(invalid.status, 400);
  checks++; console.log('ok - real worker rejects non-profile navigation');
} finally {
  if (worker.exitCode === null) { worker.kill('SIGTERM'); await once(worker, 'exit'); }
  await rm(sessionDir, { recursive: true, force: true });
}
console.log(`${checks} checks passed`);
