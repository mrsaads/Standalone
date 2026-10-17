import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy: what this site is allowed to load and where it may send data.
// Script/style allow 'unsafe-inline' because Next.js injects inline bootstrap scripts and the UI
// uses inline styles; everything else is locked to this site plus the two outside services the
// browser really talks to (Supabase auth, Google Fonts). The big wins are frame-ancestors (no
// clickjacking), object-src/base-uri (classic injection tricks) and connect-src (a script that
// did get injected can't quietly ship data to some other server).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // JazzCash's hosted checkout: the report page posts a signed form to the gateway (lib/jazzcash.ts).
  "form-action 'self' https://sandbox.jazzcash.com.pk https://payments.jazzcash.com.pk",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Dev server needs eval for hot reload, so the CSP is production-only.
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  // Standard Node.js runtime build for Render — no Cloudflare/Workers, no
  // custom Vite/vinext bundling. `next build` + `next start` is the whole
  // deploy story here.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The signed-in app, the auth utility pages and the API must never appear in search results.
      // (robots.txt only asks crawlers not to fetch; this header is what actually prevents indexing.)
      ...["/api/:path*", "/admin/:path*", "/audits/:path*", "/audit/:path*", "/portal/:path*", "/client-portal/:path*", "/account/:path*", "/notifications/:path*", "/auth/:path*", "/verify", "/reset-password/:path*"]
        .map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ];
  },
};

export default nextConfig;
