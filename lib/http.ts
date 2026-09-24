// Shared same-origin / app-origin helpers for state-changing API routes.
//
// Why this exists: every state-changing route used to check
// `origin header !== new URL(request.url).origin` inline. That works when the
// Node process sees the request exactly as the browser sent it, but this app
// runs behind Render's edge proxy (TLS terminated at the edge, forwarded to
// the container over plain HTTP on an internal port). `request.url` reflects
// what the Node process itself saw — which does not reliably reproduce the
// public `https://<service>.onrender.com` origin the browser's `Origin`
// header actually contains. In production this made the check fail for every
// legitimate same-origin POST (signup, audit creation, audit delivery,
// enquiries all 403'd with their same-origin error even though the request
// really did come from the app's own page).
//
// The fix, and the standard mitigation for this exact proxy scenario (it's
// the same technique Next.js's own Server Actions origin check uses): compare
// the `Origin` header's *host* against the `Host` header, not against a
// reconstructed request URL. The `Host` header is set correctly by Render's
// proxy to the public domain regardless of the internal scheme/port, so this
// comparison is robust in a way `new URL(request.url).origin` is not.
export function isTrustedOrigin(request: Request): boolean {
  // Modern browsers label every request with where it came from. Anything a browser marks as
  // cross-site or same-site-but-different-origin is refused outright, whatever Origin says.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // no Origin header: not a browser fetch/form POST, nothing to compare
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// The app's own public origin, for building absolute URLs (e.g. email
// confirmation links) from server code that isn't handling a browser request
// with an Origin header. Same precedence as lib/delivery-worker.ts uses for
// the same problem: an explicit override first, then Render's own automatic
// env var, then a legacy public-env fallback.
export function resolveAppOrigin(request?: Request): string {
  const fromHeader = request?.headers.get("origin");
  if (fromHeader) return fromHeader;
  const configured = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (configured) return configured.startsWith("http") ? configured : `https://${configured}`;
  // Last resort: derive from the Host header we know Render sets correctly.
  const host = request?.headers.get("host");
  if (host) return `https://${host}`;
  throw new Error("Could not resolve the app's origin: set APP_ORIGIN or rely on Render's RENDER_EXTERNAL_URL.");
}

// Only ever redirect to a path on THIS site after an auth step. Rejects absolute URLs,
// protocol-relative `//evil.com`, backslash tricks (`/\\evil.com`), `javascript:` and anything
// that is not a plain "/path". Falls back to "/".
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const parsed = new URL(next, "https://ix.invalid");
    if (parsed.origin !== "https://ix.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

// The public origin for a browser navigation (GET) — built from the Host header Render's proxy
// sets to the public domain, not from request.url (which reflects the container's internal
// address; see the top of this file).
export function requestOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
