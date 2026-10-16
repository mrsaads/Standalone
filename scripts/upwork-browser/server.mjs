import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { chmod, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { allowedResource, captureProfile, profileUrl } from './core.mjs';
import { desktopHttp, desktopUpgrade, isDesktopPath } from './desktop-proxy.mjs';

const loginMode = process.env.UPWORK_BROWSER_LOGIN_MODE === 'true';
const adminPassword = process.env.UPWORK_BROWSER_ADMIN_PASSWORD;
if (loginMode && (!adminPassword || adminPassword.length < 32)) throw new Error('Login mode requires UPWORK_BROWSER_ADMIN_PASSWORD (32+ characters).');
const token = process.env.UPWORK_BROWSER_TOKEN;
const sessionDir = process.env.UPWORK_BROWSER_SESSION_DIR;
if (!token || token.length < 32 || !sessionDir) throw new Error('Set UPWORK_BROWSER_TOKEN (32+ characters) and UPWORK_BROWSER_SESSION_DIR outside the checkout.');
await mkdir(sessionDir, { recursive: true, mode: 0o700 });
await chmod(sessionDir, 0o700);
const context = await chromium.launchPersistentContext(resolve(sessionDir), { handleSIGTERM: false, handleSIGINT: false, headless: process.env.UPWORK_BROWSER_HEADED !== 'true', executablePath: process.env.UPWORK_BROWSER_EXECUTABLE_PATH || undefined, acceptDownloads: false, serviceWorkers: 'block' });
if (loginMode) {
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.upwork.com/ab/account-security/login', { timeout: 25000 }).catch(() => console.error('Open Upwork sign-in manually in the operator browser.'));
} else {
  await context.route('**/*', route => allowedResource(route.request().url()) ? route.continue() : route.abort());
}
let busy = false;
let lastAttempt = 0;
const cooldownMs = 15000;
function authorized(request) {
  const received = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const server = createServer(async (req, res) => {
  // Render health probes cannot supply the bearer token. This endpoint exposes no session data.
  if (req.method === 'GET' && req.url === '/live') return reply(res, 200, { ok: true });
  if (isDesktopPath(req.url)) {
    if (loginMode) return desktopHttp(req, res, adminPassword);
    return reply(res, 404, { ok: false, outcome: 'invalid' });
  }
  if (!authorized(req)) return reply(res, 401, { ok: false, outcome: 'unauthorized' });
  if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok: true, busy });
  if (req.method !== 'POST' || req.url !== '/capture') return reply(res, 404, { ok: false, outcome: 'invalid' });
  if (loginMode) return reply(res, 503, { ok: false, outcome: 'login_required' });
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { ok: false, outcome: 'invalid' });
  let input;
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 2048) return reply(res, 413, { ok: false, outcome: 'invalid' });
    }
    input = JSON.parse(body);
  } catch { return reply(res, 400, { ok: false, outcome: 'invalid' }); }
  const url = profileUrl(input?.url);
  if (!url) return reply(res, 400, { ok: false, outcome: 'invalid' });
  if (busy || Date.now() - lastAttempt < cooldownMs) return reply(res, 503, { ok: false, outcome: 'busy' });
  busy = true; lastAttempt = Date.now();
  try { reply(res, 200, await captureProfile(context, url)); }
  catch { reply(res, 500, { ok: false, outcome: 'unavailable' }); }
  finally { busy = false; }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.on('upgrade', (req, socket, head) => {
  if (loginMode && isDesktopPath(req.url)) return desktopUpgrade(req, socket, head, adminPassword);
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
});
server.listen(Number(process.env.PORT || process.env.UPWORK_BROWSER_PORT || 3100), process.env.UPWORK_BROWSER_HOST || '127.0.0.1', () => console.log('Upwork browser worker listening. Session readiness requires a successful profile capture.'));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Stopping Upwork browser worker.');
  server.close();
  await context.close();
  console.log('Browser session flushed.');
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
