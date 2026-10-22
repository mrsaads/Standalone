// A deliberately small, read-only MCP client. The live server's tool schemas are the
// authority; fixture tests below prove transport/normalization, not Upwork's field coverage.
export type ContentProfile = {
  profileUrl: string;
  name?: string;
  title: string;
  overview: string;
  skills: string[];
  portfolio: { title: string; description: string; role?: string; skills?: string[] }[];
  certifications: { name: string; issuer?: string; description?: string; url?: string }[];
  missing: string[];
  readAt: string;
};

export type UpworkMcpErrorCode = "invalid_link" | "reauth" | "scope" | "account_required" | "mismatch" | "no_profile" | "schema" | "network" | "timeout" | "unavailable";
const MESSAGES: Record<UpworkMcpErrorCode, string> = {
  invalid_link: "Enter a valid HTTPS Upwork freelancer profile link.",
  reauth: "Your Upwork authorization expired. Connect Upwork again.",
  scope: "This Upwork connection does not allow the requested profile read.",
  account_required: "Connect the freelancer account that owns this profile.",
  mismatch: "The connected Upwork account does not match the submitted profile link.",
  no_profile: "Upwork did not return a readable freelancer profile.",
  schema: "Upwork returned a profile format we could not verify. Please try again later.",
  network: "Upwork could not be reached. Please try again later.",
  timeout: "Upwork took too long to return the profile. Please try again.",
  unavailable: "Upwork could not read this profile right now. Please try again later.",
};
export class UpworkMcpError extends Error {
  constructor(public readonly code: UpworkMcpErrorCode) { super(MESSAGES[code]); this.name = "UpworkMcpError"; }
}

type Obj = Record<string, unknown>;
type Tool = { name: string; inputSchema: Obj };
type Account = Obj & { org_uid: string; role: "TALENT" };
const object = (value: unknown): value is Obj => !!value && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
const keys = (value: Obj, names: string[]): unknown => { for (const name of names) if (value[name] !== undefined && value[name] !== null) return value[name]; return undefined; };
const ENDPOINT = "https://mcp.upwork.com/mcp";
const MAX_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = MAX_BYTES * 6;
const VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];

export type McpReadOptions = {
  fetch?: typeof fetch;
  /** Only loopback endpoints outside production, explicitly opted into for local fixtures. */
  endpoint?: string;
  allowLocalTest?: boolean;
  timeoutMs?: number;
};

export function normalizeMcpProfileUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || !["www.upwork.com", "upwork.com"].includes(u.hostname) || u.username || u.password || u.port) return null;
    const match = /^\/(?:freelancers|fl)\/([a-z\d_~.-]+)\/?$/i.exec(u.pathname);
    if (!match) return null;
    const id = /^~[0-9a-f]{8,}$/i.test(match[1]) ? match[1].toLowerCase() : match[1];
    return `https://www.upwork.com/freelancers/${id}`;
  } catch { return null; }
}

function failForPayload(value: unknown) {
  if (!object(value)) return;
  const error = value.error;
  if (value.isError === true || value.ok === false || value.success === false || error || ["error", "needs_details", "action_required"].includes(String(value.status))) {
    const code = String(object(error) ? error.code : value.code || "").toUpperCase();
    if (/UNAUTHENTICATED|UNAUTHORIZED|INVALID_TOKEN|TOKEN_EXPIRED/.test(code)) throw new UpworkMcpError("reauth");
    if (/PERMISSION|FORBIDDEN|SCOPE/.test(code)) throw new UpworkMcpError("scope");
    if (/INVALID_ARGUMENT|UNKNOWN_TOOL|METHOD_NOT_FOUND/.test(code) || value.status === "needs_details") throw new UpworkMcpError("schema");
    throw new UpworkMcpError("unavailable");
  }
}

/** Only parse structured tool results; natural-language output is never treated as profile facts. */
function toolPayload(value: unknown, allowPlainText = false): unknown {
  failForPayload(value);
  if (!object(value)) throw new UpworkMcpError("schema");
  if (value.structuredContent !== undefined) {
    failForPayload(value.structuredContent);
    return value.structuredContent;
  }
  if (Array.isArray(value.content)) {
    const texts = value.content.filter(object).filter(c => c.type === "text" && typeof c.text === "string").map(c => c.text as string);
    for (const text of texts) {
      const clean = text.trim().replace(/^```(?:json)?\s*\n/i, "").replace(/\n```$/, "");
      try { const parsed: unknown = JSON.parse(clean); failForPayload(parsed); return parsed; }
      catch (error) { if (error instanceof UpworkMcpError) throw error; }
    }
    if (allowPlainText && texts.length) return { text: texts.join("\n").slice(0, 40000) };
  }
  throw new UpworkMcpError("schema");
}

class ReadSession {
  private id = 0;
  private sessionId = "";
  private protocol = "2025-06-18";
  private totalBytes = 0;
  private readonly endpoint: string;
  private readonly doFetch: typeof fetch;
  readonly tools = new Map<string, Tool>();
  constructor(private readonly token: string, private readonly signal: AbortSignal, options: McpReadOptions) {
    this.endpoint = options.endpoint || ENDPOINT;
    this.doFetch = options.fetch || fetch;
    const u = new URL(this.endpoint);
    const local = process.env.NODE_ENV !== "production" && options.allowLocalTest === true && u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
    if ((!local && this.endpoint !== ENDPOINT) || u.username || u.password || u.search || u.hash) throw new UpworkMcpError("schema");
  }

  private rpcResult(value: unknown, id: number): unknown {
    if (!object(value) || value.jsonrpc !== "2.0" || value.id !== id) throw new UpworkMcpError("schema");
    failForPayload(value);
    if (!("result" in value)) throw new UpworkMcpError("schema");
    return value.result;
  }

  private async readResponse(response: Response, id: number): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new UpworkMcpError("schema");
    const sse = response.headers.get("content-type")?.toLowerCase().includes("text/event-stream");
    if (!sse && !response.headers.get("content-type")?.toLowerCase().includes("application/json")) { await reader.cancel(); throw new UpworkMcpError("schema"); }
    let bytes = 0, buffer = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength; this.totalBytes += part.value.byteLength;
        if (bytes > MAX_BYTES || this.totalBytes > MAX_TOTAL_BYTES) throw new UpworkMcpError("schema");
        buffer += decoder.decode(part.value, { stream: true });
        if (sse) {
          // Event framing is line-based; preserve chunk boundaries, including split CRLF pairs.
          let match: RegExpExecArray | null;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
            const data = event.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).replace(/^ /, "")).join("\n");
            if (!data) continue;
            let message: unknown;
            try { message = JSON.parse(data); } catch { throw new UpworkMcpError("schema"); }
            // The reader never executes server-initiated requests, elicitation, sampling, or instructions.
            if (object(message) && message.id === id && ("result" in message || "error" in message)) return this.rpcResult(message, id);
          }
        }
      }
      if (sse) throw new UpworkMcpError("schema");
      try { return this.rpcResult(JSON.parse(buffer + decoder.decode()), id); }
      catch (error) { if (error instanceof UpworkMcpError) throw error; throw new UpworkMcpError("schema"); }
    } finally { await reader.cancel().catch(() => {}); }
  }

  async request(method: string, params?: Obj, notify = false): Promise<unknown> {
    const id = ++this.id;
    let response: Response;
    try {
      response = await this.doFetch(this.endpoint, {
        method: "POST", redirect: "error", cache: "no-store", signal: this.signal,
        headers: {
          Accept: "application/json, text/event-stream", "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`, "User-Agent": "Improvexus-MCP/1.0",
          ...(method === "initialize" ? {} : { "MCP-Protocol-Version": this.protocol }),
          ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", ...(notify ? {} : { id }), method, ...(params ? { params } : {}) }),
      });
    } catch { throw new UpworkMcpError(this.signal.aborted ? "timeout" : "network"); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new UpworkMcpError(response.status === 401 ? "reauth" : response.status === 403 ? "scope" : "unavailable");
    }
    const receivedSession = response.headers.get("mcp-session-id");
    if (receivedSession) {
      if (!/^[\x21-\x7e]{1,256}$/.test(receivedSession)) { await response.body?.cancel(); throw new UpworkMcpError("schema"); }
      if (this.sessionId && receivedSession !== this.sessionId) { await response.body?.cancel(); throw new UpworkMcpError("schema"); }
      this.sessionId = receivedSession;
    }
    if (notify) { await response.body?.cancel(); return null; }
    try { return await this.readResponse(response, id); }
    catch (error) {
      if (error instanceof UpworkMcpError) throw error;
      throw new UpworkMcpError(this.signal.aborted ? "timeout" : "network");
    }
  }

  async initialize() {
    const result = await this.request("initialize", { protocolVersion: this.protocol, capabilities: {}, clientInfo: { name: "improvexus-profile-import", version: "1.0" } });
    if (!object(result) || typeof result.protocolVersion !== "string" || !VERSIONS.includes(result.protocolVersion)) throw new UpworkMcpError("schema");
    this.protocol = result.protocolVersion;
    await this.request("notifications/initialized", {}, true);
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 5; page++) {
      const result = await this.request("tools/list", cursor ? { cursor } : {});
      if (!object(result) || !Array.isArray(result.tools) || result.tools.length > 500) throw new UpworkMcpError("schema");
      for (const item of result.tools) {
        if (!object(item) || typeof item.name !== "string" || !object(item.inputSchema)) throw new UpworkMcpError("schema");
        if (this.tools.has(item.name)) throw new UpworkMcpError("schema");
        this.tools.set(item.name, { name: item.name, inputSchema: item.inputSchema });
      }
      if (!result.nextCursor) return;
      if (typeof result.nextCursor !== "string" || result.nextCursor.length > 4096 || seen.has(result.nextCursor)) throw new UpworkMcpError("schema");
      cursor = result.nextCursor; seen.add(cursor);
    }
    throw new UpworkMcpError("schema");
  }

  async call(name: string, args: Obj, allowPlainText = false): Promise<unknown> {
    // Independent hard allowlist: provider descriptions and returned text cannot add actions.
    if (!["list_accounts", "search_tools", "get_tool_help", "get_profile", "execute_tool"].includes(name)) throw new UpworkMcpError("schema");
    if ((name === "get_profile" || name === "execute_tool") && !["get", "list_highlights"].includes(String(args.action))) throw new UpworkMcpError("schema");
    if (name === "execute_tool" && args.tool_name !== "get_profile") throw new UpworkMcpError("schema");
    if (!this.tools.has(name)) throw new UpworkMcpError("schema");
    return toolPayload(await this.request("tools/call", { name, arguments: args }), allowPlainText);
  }
}

// Known envelope locations only. Never recursively search unrelated portfolio, contract,
// promotion or financial records for plausible-looking identity/profile fields.
function containers(value: unknown): Obj[] {
  const out: Obj[] = [];
  const visit = (v: unknown, depth: number) => {
    if (!object(v) || depth > 3 || out.includes(v)) return;
    out.push(v);
    for (const k of ["data", "result", "profile", "freelancer", "freelancer_profile", "freelancerProfile", "personalData", "personal_data"]) visit(v[k], depth + 1);
  };
  visit(value, 0); return out;
}
function field(roots: Obj[], names: string[]): unknown {
  for (const root of roots) { const value = keys(root, names); if (value !== undefined) return value; }
  return undefined;
}
function urls(value: unknown): string[] {
  const result = new Set<string>();
  for (const root of containers(value)) {
    for (const name of ["profile_url", "profileUrl", "public_url", "publicUrl", "profile_link", "profileLink", "url"]) {
      const url = normalizeMcpProfileUrl(root[name]); if (url) result.add(url);
    }
    for (const name of ["profile_key", "profileKey", "ciphertext"]) {
      if (typeof root[name] === "string" && /^~[0-9a-f]{8,}$/i.test(root[name])) result.add(`https://www.upwork.com/freelancers/${root[name].toLowerCase()}`);
    }
    for (const name of ["profile_urls", "profileUrls", "profile_aliases", "profileAliases"]) {
      if (Array.isArray(root[name])) for (const v of root[name]) { const url = normalizeMcpProfileUrl(v); if (url) result.add(url); }
    }
  }
  return [...result];
}

function accountsFrom(value: unknown): Account[] {
  const roots = containers(value);
  const list = Array.isArray(value) ? value : field(roots, ["accounts"]);
  if (!Array.isArray(list) || list.length > 100) throw new UpworkMcpError("schema");
  const accounts: Account[] = [];
  for (const item of list) {
    if (!object(item) || item.role !== "TALENT" || item.suspended === true) continue;
    if ((typeof item.org_uid !== "string" && typeof item.org_uid !== "number") || !String(item.org_uid).trim() || String(item.org_uid).length > 200) throw new UpworkMcpError("schema");
    accounts.push({ ...item, org_uid: String(item.org_uid), role: "TALENT" });
  }
  if (!accounts.length) throw new UpworkMcpError("account_required");
  return accounts;
}

function argsFromSchema(schema: Obj, known: Obj): Obj {
  const properties = object(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const out: Obj = {};
  for (const k of Object.keys(properties)) if (known[k] !== undefined) {
    const p = properties[k];
    if (object(p) && Array.isArray(p.enum) && !p.enum.includes(known[k])) throw new UpworkMcpError("schema");
    out[k] = known[k];
  }
  for (const k of required) if (typeof k !== "string" || out[k] === undefined) throw new UpworkMcpError("schema");
  return out;
}

function listSkills(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(list.map(v => typeof v === "string" ? str(v, 120) : object(v) ? str(keys(v, ["name", "skill_name", "skillName", "prettyName", "label"]), 120) : "").filter(Boolean))].slice(0, 60);
}
function sectionList(roots: Obj[], names: string[]): unknown[] | undefined {
  const value = field(roots, names);
  if (Array.isArray(value)) return value;
  if (object(value)) {
    const list = keys(value, ["items", "nodes", "results"]);
    if (Array.isArray(list)) return list;
  }
  return undefined;
}
function highlightsByType(roots: Obj[], type: RegExp): unknown[] | undefined {
  const items = sectionList(roots, ["highlights", "items"]);
  if (!items) return undefined;
  return items.filter(object).filter(v => type.test(String(keys(v, ["type", "kind", "highlight_type"]) || ""))).map(v => object(v.data) ? v.data : v);
}

function normalizeProfile(profile: unknown, highlights: unknown, profileUrl: string, account: Account): ContentProfile {
  const roots = containers(profile);
  const highlightRoots = containers(highlights);
  const title = str(field(roots, ["title", "professional_title", "professionalTitle", "headline"]), 300);
  const overview = str(field(roots, ["overview", "description", "summary", "profile_overview"]), 5000);
  if (!title && !overview) throw new UpworkMcpError("no_profile");
  const missing: string[] = [];
  if (!title) missing.push("Title"); if (!overview) missing.push("Overview");
  const skillSource = field(roots, ["skills", "skill_tags", "skillTags"]);
  const skills = listSkills(skillSource);
  if (skillSource === undefined) missing.push("Skills");
  const projectNames = ["portfolio", "portfolio_projects", "portfolioProjects", "portfolio_items", "portfolioItems", "projects", "projectList"];
  const certificateNames = ["certifications", "certificates", "credentials"];
  const projectSources = [sectionList(roots, projectNames), sectionList(highlightRoots, projectNames), highlightsByType(highlightRoots, /portfolio|project/i)].filter((v): v is unknown[] => v !== undefined);
  const certificateSources = [sectionList(roots, certificateNames), sectionList(highlightRoots, certificateNames), highlightsByType(highlightRoots, /certif|credential/i)].filter((v): v is unknown[] => v !== undefined);
  if (!projectSources.length) missing.push("Portfolio");
  if (!certificateSources.length) missing.push("Certifications");
  const portfolio = new Map<string, ContentProfile["portfolio"][number]>();
  for (const item of projectSources.flat().slice(0, 120)) {
    const obj = object(item) ? item : typeof item === "string" ? { title: item } : {};
    const title = str(keys(obj, ["title", "name", "project_title"]), 300);
    if (!title) continue;
    const description = str(keys(obj, ["description", "summary", "project_description"]), 2000);
    const role = str(keys(obj, ["role", "project_role"]), 300);
    const entrySkills = listSkills(keys(obj, ["skills", "skill_tags"]));
    const key = title.toLocaleLowerCase(); const old = portfolio.get(key);
    portfolio.set(key, { title, description: old && old.description.length > description.length ? old.description : description,
      ...(role || old?.role ? { role: role || old?.role } : {}), ...(entrySkills.length || old?.skills?.length ? { skills: entrySkills.length ? entrySkills : old?.skills } : {}) });
  }
  const certifications = new Map<string, ContentProfile["certifications"][number]>();
  for (const item of certificateSources.flat().slice(0, 120)) {
    const obj = object(item) ? item : typeof item === "string" ? { name: item } : {};
    const name = str(keys(obj, ["name", "title", "certificate_name", "certification_name"]), 300);
    if (!name) continue;
    const issuer = str(keys(obj, ["issuer", "issuing_organization", "provider"]), 200);
    const description = str(keys(obj, ["description", "summary"]), 1000);
    const rawUrl = str(keys(obj, ["verification_url", "credential_url", "url"]), 1000);
    let url = "";
    try { const u = new URL(rawUrl); if (u.protocol === "https:" && !u.username && !u.password) url = u.href; } catch { /* An absent credential URL is not fabricated. */ }
    const key = `${name.toLocaleLowerCase()}|${issuer.toLocaleLowerCase()}`;
    certifications.set(key, { name, ...(issuer ? { issuer } : {}), ...(description ? { description } : {}), ...(url ? { url } : {}) });
  }
  const name = str(field(roots, ["name", "full_name", "fullName"]), 200) || str(account.name, 200) ||
    [str(field(roots, ["first_name", "firstName"]), 100), str(field(roots, ["last_name", "lastName"]), 100)].filter(Boolean).join(" ");
  let budget = 38000 - title.length - overview.length - skills.join(", ").length;
  const projects: ContentProfile["portfolio"] = [];
  for (const entry of portfolio.values()) {
    const cost = entry.title.length + entry.description.length + (entry.role?.length || 0) + (entry.skills?.join(", ").length || 0);
    if (projects.length >= 40 || cost > budget) { missing.push("Portfolio (partially imported)"); break; }
    projects.push(entry); budget -= cost;
  }
  const certs: ContentProfile["certifications"] = [];
  for (const entry of certifications.values()) {
    const cost = entry.name.length + (entry.issuer?.length || 0) + (entry.description?.length || 0) + (entry.url?.length || 0);
    if (certs.length >= 40 || cost > budget) { missing.push("Certifications (partially imported)"); break; }
    certs.push(entry); budget -= cost;
  }
  // Account ids, financials, contracts, promotions and provider messages never leave this boundary.
  return { profileUrl, ...(name ? { name } : {}), title, overview, skills, portfolio: projects, certifications: certs,
    missing: [...new Set(missing)], readAt: new Date().toISOString() };
}

/** Authorize separately, then call once per customer import. This function retains no token/session. */
export async function readMcpContentProfile(token: string, requestedProfileUrl: string, options: McpReadOptions = {}): Promise<ContentProfile> {
  const target = normalizeMcpProfileUrl(requestedProfileUrl);
  if (!target) throw new UpworkMcpError("invalid_link");
  if (!token || token.length > 16000 || /[\r\n]/.test(token)) throw new UpworkMcpError("reauth");
  const controller = new AbortController();
  const timeout = Math.max(100, Math.min(options.timeoutMs || 45000, 45000));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const session = new ReadSession(token, controller.signal, options);
    await session.initialize();
    const accountTool = session.tools.get("list_accounts");
    if (!accountTool) throw new UpworkMcpError("schema");
    const accounts = accountsFrom(await session.call("list_accounts", argsFromSchema(accountTool.inputSchema, {})));
    const explicitlyMatching = accounts.filter(a => urls(a).includes(target));
    // Never guess between organizations. The submitted URL selects one only when metadata proves it.
    const account = explicitlyMatching.length === 1 ? explicitlyMatching[0] : accounts.length === 1 ? accounts[0] : null;
    if (!account) throw new UpworkMcpError("account_required");
    const direct = session.tools.get("get_profile");
    const execute = session.tools.get("execute_tool");
    if (!direct && !execute) throw new UpworkMcpError("schema");
    if (!direct && session.tools.has("search_tools")) {
      const search = session.tools.get("search_tools")!;
      await session.call("search_tools", argsFromSchema(search.inputSchema, { role: account.role, query: "get_profile", org_uid: account.org_uid }));
    }
    const helper = session.tools.get("get_tool_help");
    if (helper) await session.call("get_tool_help", argsFromSchema(helper.inputSchema, { tool_name: "get_profile", org_uid: account.org_uid, role: account.role }), true);
    const callProfile = (action: "get" | "list_highlights") => {
      const tool = direct || execute!;
      const args = argsFromSchema(tool.inputSchema, { tool_name: "get_profile", action, org_uid: account.org_uid, role: account.role, params: {} });
      // Minimal tool schemas must still permit explicit account/action binding.
      if (args.action !== action || args.org_uid !== account.org_uid || (!direct && (args.role !== "TALENT" || args.tool_name !== "get_profile"))) throw new UpworkMcpError("schema");
      return session.call(tool.name, args);
    };
    const profile = await callProfile("get");
    const identity = urls(profile);
    const accountIdentity = urls(account);
    if (identity.length ? !identity.includes(target) : !accountIdentity.includes(target)) throw new UpworkMcpError("mismatch");
    const canonical = [...identity, ...accountIdentity].find(u => /\/~[0-9a-f]+$/.test(u)) || target;
    let highlights: unknown = undefined;
    try { highlights = await callProfile("list_highlights"); }
    catch (error) {
      // Preserve independently fetched title/overview when optional sections are unavailable.
      if (!(error instanceof UpworkMcpError) || !["scope", "schema", "unavailable"].includes(error.code)) throw error;
    }
    const highlightIdentity = urls(highlights);
    if (highlightIdentity.length && !highlightIdentity.some(u => u === canonical || u === target)) throw new UpworkMcpError("mismatch");
    return normalizeProfile(profile, highlights, canonical, account);
  } catch (error) {
    if (error instanceof UpworkMcpError) throw error;
    throw new UpworkMcpError(controller.signal.aborted ? "timeout" : "network");
  } finally { clearTimeout(timer); }
}
