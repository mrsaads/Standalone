import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Discovered from Upwork's public MCP OAuth metadata on 2026-10-22. Advertising client
// metadata support is not approval of this website; a real consent/token exchange must pass.
export const MCP_RESOURCE = "https://mcp.upwork.com/mcp";
export const MCP_ISSUER = "https://mcp.upwork.com";
export const MCP_AUTHORIZATION_ENDPOINT = "https://www.upwork.com/ab/account-security/oauth2/authorize";
export const MCP_TOKEN_ENDPOINT = "https://www.upwork.com/api/v3/oauth2/token";
export const MCP_FLOW_COOKIE = "ix_uw_mcp_flow";
const CALLBACK_PATH = "/api/upwork/mcp/callback";
const CLIENT_PATH = "/api/upwork/mcp/client";
const FLOW_SECONDS = 600;
const COOKIE_AAD = Buffer.from("improvexus:upwork-mcp-flow:v1");

export type UpworkMcpConfig = {
  origin: string;
  clientId: string;
  clientSecret?: string;
  metadataUrl: string;
  redirectUri: string;
  sessionSecret: string;
  secureCookies: boolean;
};

function appOrigin(value: string | undefined, env: NodeJS.ProcessEnv): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = env.NODE_ENV !== "production" && process.env.NODE_ENV !== "production" &&
      env.UPWORK_MCP_ALLOW_LOCAL_TEST === "1" && url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    if ((!local && (url.protocol !== "https:" || url.port)) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

/** Canonical configured origin only: request Host/Origin headers never choose an OAuth callback. */
export function upworkMcpConfig(env: NodeJS.ProcessEnv = process.env): UpworkMcpConfig | null {
  if (env.UPWORK_MCP_ENABLED !== "true") return null;
  const origin = appOrigin(env.UPWORK_MCP_APP_ORIGIN || env.APP_ORIGIN || env.NEXT_PUBLIC_SITE_URL, env);
  const sessionSecret = env.UPWORK_MCP_SESSION_SECRET || "";
  if (!origin || sessionSecret.length < 32) return null;
  const metadataUrl = `${origin}${CLIENT_PATH}`;
  // Upwork's metadata advertises Client ID Metadata Document support, but its authorization
  // endpoint currently rejects a metadata URL with "Client not found or disabled". Require an
  // enabled, registered client until Upwork makes CIMD work end to end. The legacy names are
  // accepted so an approved Upwork developer key can be used without duplicating secrets.
  const explicitId = (env.UPWORK_MCP_CLIENT_ID || env.UPWORK_API_CLIENT_ID || "").trim();
  const clientSecret = (env.UPWORK_MCP_CLIENT_SECRET || env.UPWORK_API_CLIENT_SECRET || "").trim() || undefined;
  if (!explicitId || explicitId.length > 2048 || /[\u0000-\u0020]/.test(explicitId)) return null;
  return {
    origin, clientId: explicitId, clientSecret, metadataUrl,
    redirectUri: `${origin}${CALLBACK_PATH}`, sessionSecret, secureCookies: origin.startsWith("https:"),
  };
}

export const upworkMcpEnabled = (env: NodeJS.ProcessEnv = process.env) => Boolean(upworkMcpConfig(env));

/** Public metadata document; it must never contain the registered-client secret or cookie key. */
export function metadataDocument(cfg: UpworkMcpConfig) {
  return {
    client_id: cfg.metadataUrl,
    client_name: "Improvexus profile import",
    client_uri: cfg.origin,
    redirect_uris: [cfg.redirectUri],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export function normalizeMcpProfileUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["upwork.com", "www.upwork.com"].includes(url.hostname) ||
        url.port || url.username || url.password ||
        !/^\/(freelancers|fl)\/(?:~[0-9a-f]{8,}|[a-z0-9][a-z0-9_-]*)\/?$/i.test(url.pathname)) return null;
    url.hostname = "www.upwork.com";
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}

const flowSchema = z.object({
  v: z.literal(1),
  state: z.string().regex(/^[0-9a-f]{48}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  profileUrl: z.string().max(500),
  destination: z.enum(["score", "audits"]),
  userId: z.string().min(1).max(128).nullable(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
}).strict();
export type McpFlow = z.infer<typeof flowSchema>;

export function newMcpFlow(input: { profileUrl: string; destination: "score" | "audits"; userId?: string | null }, now = Date.now()): McpFlow {
  const profileUrl = normalizeMcpProfileUrl(input.profileUrl);
  if (!profileUrl || (input.destination === "audits" && !input.userId)) throw new UpworkMcpAuthError("invalid");
  return flowSchema.parse({
    v: 1, state: randomBytes(24).toString("hex"), verifier: randomBytes(32).toString("base64url"),
    profileUrl, destination: input.destination, userId: input.userId || null,
    createdAt: now, expiresAt: now + FLOW_SECONDS * 1000,
  });
}

const encryptionKey = (cfg: UpworkMcpConfig) => createHash("sha256").update(cfg.sessionSecret).digest();

export function sealMcpFlow(cfg: UpworkMcpConfig, flow: McpFlow): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(cfg), iv);
  cipher.setAAD(COOKIE_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(flow), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openMcpFlow(cfg: UpworkMcpConfig, cookie: string | null, now = Date.now()): McpFlow | null {
  if (!cookie || cookie.length > 3000 || !/^[A-Za-z0-9_-]+$/.test(cookie)) return null;
  try {
    const bytes = Buffer.from(cookie, "base64url");
    if (bytes.length < 29 || bytes.toString("base64url") !== cookie) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(cfg), bytes.subarray(0, 12));
    decipher.setAAD(COOKIE_AAD); decipher.setAuthTag(bytes.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = flowSchema.safeParse(JSON.parse(plain));
    if (!parsed.success) return null;
    const flow = parsed.data;
    if (flow.expiresAt <= now || flow.createdAt > now + 5000 || flow.expiresAt - flow.createdAt !== FLOW_SECONDS * 1000 ||
        normalizeMcpProfileUrl(flow.profileUrl) !== flow.profileUrl || (flow.destination === "audits" && !flow.userId)) return null;
    return flow;
  } catch { return null; }
}

export function mcpFlowCookie(cfg: UpworkMcpConfig, value = "") {
  return `${MCP_FLOW_COOKIE}=${value}; Path=/api/upwork/mcp; HttpOnly; SameSite=Lax; Max-Age=${value ? FLOW_SECONDS : 0}${cfg.secureCookies ? "; Secure" : ""}`;
}

export function mcpAuthorizeUrl(cfg: UpworkMcpConfig, flow: McpFlow): string {
  const url = new URL(MCP_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri,
    state: flow.state, code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256", resource: MCP_RESOURCE,
  }).toString();
  return url.href;
}

export type McpAuthFailure = "invalid" | "denied" | "reauth" | "network" | "token_exchange";
export class UpworkMcpAuthError extends Error {
  constructor(public readonly code: McpAuthFailure) { super(`Upwork authorization failed: ${code}`); this.name = "UpworkMcpAuthError"; }
}

/** Validate state and issuer before accepting either a successful code or a provider error. */
export function validateMcpCallback(flow: McpFlow, params: URLSearchParams, now = Date.now()): string {
  if (flow.expiresAt <= now) throw new UpworkMcpAuthError("invalid");
  for (const key of ["state", "code", "iss", "error"]) if (params.getAll(key).length > 1) throw new UpworkMcpAuthError("invalid");
  const state = params.get("state") || "";
  if (!/^[0-9a-f]{48}$/.test(state) || !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))) throw new UpworkMcpAuthError("invalid");
  if (params.has("iss") && params.get("iss") !== MCP_ISSUER) throw new UpworkMcpAuthError("invalid");
  if (params.has("error")) throw new UpworkMcpAuthError("denied");
  const code = params.get("code");
  if (!code || code.length > 4096 || /[\u0000-\u001f]/.test(code)) throw new UpworkMcpAuthError("invalid");
  return code;
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new UpworkMcpAuthError("token_exchange");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 1024 * 1024) { await reader.cancel(); throw new UpworkMcpAuthError("token_exchange"); }
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new UpworkMcpAuthError("token_exchange"); }
  finally { reader.releaseLock(); }
}

/** Tokens live only for this import request. Refresh tokens are deliberately not persisted. */
export async function exchangeMcpCode(cfg: UpworkMcpConfig, flow: McpFlow, code: string, doFetch: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await doFetch(MCP_TOKEN_ENDPOINT, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "Improvexus-MCP/1.0" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: cfg.clientId,
        ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
        redirect_uri: cfg.redirectUri, code, code_verifier: flow.verifier, resource: MCP_RESOURCE,
      }).toString(),
    });
  } catch { throw new UpworkMcpAuthError("network"); }
  if (!response.ok) { await response.body?.cancel(); throw new UpworkMcpAuthError("token_exchange"); }
  const data = await boundedJson(response);
  const parsed = z.object({ access_token: z.string().min(8).max(16384), token_type: z.string().optional() }).safeParse(data);
  if (!parsed.success || (parsed.data.token_type && parsed.data.token_type.toLowerCase() !== "bearer")) throw new UpworkMcpAuthError("token_exchange");
  return parsed.data.access_token;
}
