import { request as httpRequest } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export function desktopAuthorized(req, password) {
  if (!password || password.length < 32) return false;
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Basic ${Buffer.from(`operator:${password}`).toString('base64')}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export function isDesktopPath(url) { return url?.startsWith('/desktop/'); }

export function desktopHttp(req, res, password, port = 6080) {
  if (!desktopAuthorized(req, password)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Profile reader operator", charset="UTF-8"', 'Cache-Control': 'no-store' });
    res.end('Operator sign-in required'); return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const upstream = httpRequest({ hostname: '127.0.0.1', port, path: req.url.slice('/desktop'.length), method: 'GET' }, response => {
    res.writeHead(response.statusCode || 502, {
      'Content-Type': response.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff',
    });
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on('aborted', () => upstream.destroy());
  upstream.end();
}

export function desktopUpgrade(req, socket, head, password, port = 6080) {
  let sameOrigin = false;
  try { const origin = new URL(req.headers.origin); sameOrigin = origin.host === req.headers.host && ['https:', 'http:'].includes(origin.protocol); } catch {}
  if (!desktopAuthorized(req, password) || !sameOrigin || req.url?.split('?')[0] !== '/desktop/websockify') {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  const upstream = httpRequest({ hostname: '127.0.0.1', port, path: '/websockify', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket',
    'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
    'Sec-WebSocket-Version': req.headers['sec-websocket-version'],
    ...(req.headers['sec-websocket-protocol'] ? { 'Sec-WebSocket-Protocol': req.headers['sec-websocket-protocol'] } : {}),
  }});
  upstream.on('upgrade', (response, peer, upstreamHead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) peer.write(head);
    peer.pipe(socket).pipe(peer);
    peer.on('error', () => socket.destroy());
    socket.on('error', () => peer.destroy());
    socket.on('close', () => peer.destroy());
  });
  upstream.on('response', response => { response.resume(); socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
  upstream.on('error', () => socket.destroy());
  socket.on('close', () => upstream.destroy());
  upstream.end();
}
