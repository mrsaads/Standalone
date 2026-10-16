import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { desktopAuthorized, desktopHttp, desktopUpgrade } from '../upwork-browser/desktop-proxy.mjs';

const password = 'operator-test-password-32-characters';
const auth = `Basic ${Buffer.from(`operator:${password}`).toString('base64')}`;
let upstreamAuth: string | undefined;
const upstream = createServer((req, res) => {
  upstreamAuth = req.headers.authorization;
  res.setHeader('Content-Type', 'text/html');
  res.end('<html><body>Operator screen</body></html>');
});
upstream.on('upgrade', (req, socket) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.on('data', () => socket.end());
});
await new Promise<void>(r => upstream.listen(0, '127.0.0.1', r));
const addr = upstream.address(); if (!addr || typeof addr === 'string') throw new Error('address');
const proxy = createServer((req, res) => desktopHttp(req, res, password, addr.port));
proxy.on('upgrade', (req, socket, head) => desktopUpgrade(req, socket, head, password, addr.port));
await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
const proxyAddr = proxy.address(); if (!proxyAddr || typeof proxyAddr === 'string') throw new Error('address');
const base = `http://127.0.0.1:${proxyAddr.port}`;
let browser;
try {
  assert.equal(desktopAuthorized({ headers: { authorization: 'Bearer wrong' } }, password), false);
  assert.equal((await fetch(`${base}/desktop/vnc.html`)).status, 401);
  console.log('ok - desktop requires separate operator credentials');
  const response = await fetch(`${base}/desktop/vnc.html`, { headers: { Authorization: auth } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Operator screen/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(upstreamAuth, undefined);
  console.log('ok - desktop proxy serves content without forwarding the operator password');
  const crossOrigin = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(`${base}/desktop/websockify`, { headers: { Authorization: auth, Origin: 'https://evil.example', Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' } });
    req.on('response', res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(crossOrigin, 403);
  console.log('ok - cross-origin browser control is rejected');
  browser = await chromium.launch({ executablePath: process.env.UPWORK_BROWSER_EXECUTABLE_PATH || undefined });
  const context = await browser.newContext({ httpCredentials: { username: 'operator', password } });
  const page = await context.newPage();
  await page.goto(`${base}/desktop/vnc.html`);
  const opened = await page.evaluate(() => new Promise<boolean>(resolve => {
    const ws = new WebSocket(`ws://${location.host}/desktop/websockify`);
    const timeout = setTimeout(() => { ws.close(); resolve(false); }, 5000);
    ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(true); };
    ws.onerror = () => { clearTimeout(timeout); resolve(false); };
  }));
  assert.equal(opened, true);
  console.log('ok - Chromium authenticates and connects the desktop WebSocket');
} finally {
  await browser?.close();
  await Promise.all([new Promise<void>(r => proxy.close(() => r())), new Promise<void>(r => upstream.close(() => r()))]);
}
console.log('4 desktop checks passed');
