import { createHash, timingSafeEqual } from "node:crypto";

// Upwork's OFFICIAL API, used only on behalf of a customer who has just approved access on
// Upwork's own page ("Connect Upwork"). Nothing in here scrapes a page, logs in as anybody, or
// keeps a credential: the customer signs in on upwork.com, Upwork sends their browser back to us
// with a one-time code, we trade it for an access token, read that customer's OWN profile once,
// and drop the token. See docs/upwork-api.md for what is verified and what is still assumed.
//
// Everything is OFF unless UPWORK_API_CLIENT_ID and UPWORK_API_CLIENT_SECRET are set, which
// can only happen after Upwork has approved an API key for this product.
//
// Endpoint paths come from Upwork's GraphQL documentation (OAuth2 section). The documentation
// gives the PATHS only; the hosts below are the ones Upwork's developer pages use and must be
// confirmed with the first real key (the probe script, scripts/upwork-api/probe.mjs, does that).
// Each can be overridden by an environment variable, but only to another https upwork.com host.

export type UpworkApiConfig = {
  clientId: string; clientSecret: string; redirectUri: string;
  authorizeUrl: string; tokenUrl: string; graphqlUrl: string;
};

const DEFAULTS = {
  authorizeUrl: "https://www.upwork.com/ab/account-security/oauth2/authorize",
  tokenUrl: "https://www.upwork.com/api/v3/oauth2/token",
  graphqlUrl: "https://api.upwork.com/graphql",
};

function upworkHttps(value: string | undefined, fallback: string, env: NodeJS.ProcessEnv): string | null {
  const candidate = (value || "").trim() || fallback;
  try {
    const u = new URL(candidate);
    // Local rehearsal only: a mock Upwork on this machine. Impossible in production builds.
    if (process.env.NODE_ENV !== "production" && env.NODE_ENV !== "production" && env.UPWORK_API_ALLOW_LOCAL_TEST === "1" &&
        u.protocol === "http:" && u.hostname === "127.0.0.1" && !u.username && !u.password && !u.hash) return u.href;
    const ok = u.protocol === "https:" && !u.port && !u.username && !u.password && !u.hash && !u.search &&
      (u.hostname === "upwork.com" || u.hostname.endsWith(".upwork.com"));
    return ok ? u.href : null;
  } catch { return null; }
}

/** Null (feature off) unless the key is configured and every address is a plain https upwork.com one. */
export function upworkApiConfig(env: NodeJS.ProcessEnv = process.env, origin?: string): UpworkApiConfig | null {
  const clientId = (env.UPWORK_API_CLIENT_ID || "").trim();
  const clientSecret = (env.UPWORK_API_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;
  const authorizeUrl = upworkHttps(env.UPWORK_API_AUTHORIZE_URL, DEFAULTS.authorizeUrl, env);
  const tokenUrl = upworkHttps(env.UPWORK_API_TOKEN_URL, DEFAULTS.tokenUrl, env);
  const graphqlUrl = upworkHttps(env.UPWORK_API_GRAPHQL_URL, DEFAULTS.graphqlUrl, env);
  if (!authorizeUrl || !tokenUrl || !graphqlUrl) return null;
  // Must equal the callback saved in the Upwork key settings, character for character.
  const base = (env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || env.NEXT_PUBLIC_SITE_URL || origin || "").replace(/\/+$/, "");
  const redirectUri = (env.UPWORK_API_REDIRECT_URI || "").trim() || (base ? `${base}/api/upwork/callback` : "");
  let callback: URL;
  try { callback = new URL(redirectUri); } catch { return null; }
  const localOk = process.env.NODE_ENV !== "production" && env.NODE_ENV !== "production" && env.UPWORK_API_ALLOW_LOCAL_TEST === "1" &&
    callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname);
  if ((callback.protocol !== "https:" && !localOk) || callback.username || callback.password || callback.hash || callback.search ||
      callback.pathname !== "/api/upwork/callback") return null;
  return { clientId, clientSecret, redirectUri, authorizeUrl, tokenUrl, graphqlUrl };
}

export const upworkApiEnabled = (env: NodeJS.ProcessEnv = process.env) => Boolean(upworkApiConfig(env));

export function buildAuthorizeUrl(cfg: UpworkApiConfig, state: string): string {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  // Upwork's documentation does not mention `state`. Standard OAuth providers send it back
  // unchanged; the callback refuses to continue if it does not come back, so a provider that
  // drops it fails closed instead of skipping the CSRF check.
  u.searchParams.set("state", state);
  return u.href;
}

export const sameSecret = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest(); const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

type Fetch = typeof fetch;
const MAX_BYTES = 1024 * 1024;

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("too_large"); }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export class UpworkApiError extends Error {
  constructor(public code: "token_exchange" | "unauthorized" | "scope" | "graphql" | "network" | "shape", message: string) { super(message); }
}

/** Trades the one-time code for an access token. The token is returned to the caller and never kept here. */
export async function exchangeCode(cfg: UpworkApiConfig, code: string, doFetch: Fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await doFetch(cfg.tokenUrl, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: cfg.clientId, client_secret: cfg.clientSecret,
        code, redirect_uri: cfg.redirectUri,
      }).toString(),
    });
  } catch { throw new UpworkApiError("network", "Upwork could not be reached."); }
  if (!response.ok) { await response.body?.cancel(); throw new UpworkApiError("token_exchange", `Upwork refused the sign-in (HTTP ${response.status}).`); }
  let body: unknown;
  try { body = await readJson(response); } catch { throw new UpworkApiError("shape", "Upwork's sign-in answer could not be read."); }
  const token = (body as { access_token?: unknown })?.access_token;
  if (typeof token !== "string" || token.length < 8 || token.length > 4096) throw new UpworkApiError("shape", "Upwork's sign-in answer had no access token.");
  return token;
}

export type GraphqlResult = { data: unknown; errors: { message: string; path?: unknown }[] };

/** One GraphQL call with the customer's token. Errors come back as data so callers can tolerate a missing field. */
export async function graphql(cfg: UpworkApiConfig, token: string, query: string, variables: Record<string, unknown> = {}, doFetch: Fetch = fetch): Promise<GraphqlResult> {
  let response: Response;
  try {
    response = await doFetch(cfg.graphqlUrl, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
  } catch { throw new UpworkApiError("network", "Upwork could not be reached."); }
  if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new UpworkApiError("unauthorized", "Upwork did not accept this sign-in for that request."); }
  if (!response.ok) { await response.body?.cancel(); throw new UpworkApiError("graphql", `Upwork's API answered HTTP ${response.status}.`); }
  let body: { data?: unknown; errors?: { message?: unknown; path?: unknown }[] };
  try { body = await readJson(response) as typeof body; } catch { throw new UpworkApiError("shape", "Upwork's answer could not be read."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new UpworkApiError("shape", "Upwork's answer could not be read.");
  const errors = Array.isArray(body.errors) ? body.errors.slice(0, 10).map(e => ({ message: String(e?.message ?? "").slice(0, 300), path: e?.path })) : [];
  return { data: body.data ?? null, errors };
}
