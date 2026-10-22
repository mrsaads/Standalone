import { getCurrentUser } from "@/lib/auth";
import { CONNECTION_COOKIE, holdEvidence } from "@/lib/upwork-connected";
import { mcpContentEvidence } from "@/lib/upwork-content";
import { readMcpContentProfile, UpworkMcpError } from "@/lib/upwork-mcp-client";
import { exchangeMcpCode, MCP_FLOW_COOKIE, mcpFlowCookie, openMcpFlow, UpworkMcpAuthError, upworkMcpConfig, validateMcpCallback } from "@/lib/upwork-mcp-auth";
import { consume, requestIdentity } from "@/lib/security/email-throttle";

function cookie(request: Request, name: string) {
  return (request.headers.get("cookie") || "").split(/;\s*/).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

export async function GET(request: Request) {
  const cfg = upworkMcpConfig();
  const requestUrl = new URL(request.url);
  if (!cfg) return Response.redirect(`${requestUrl.origin}/profile-score?upwork=off`, 302);
  const flow = openMcpFlow(cfg, cookie(request, MCP_FLOW_COOKIE));
  const destination = flow?.destination === "audits" ? "/audits" : "/profile-score";
  const finish = (result: string, connectionId?: string) => {
    const query = result === "connected" ? "connected=1&provider=mcp" : `upwork=${result}`;
    const headers = new Headers({ Location: `${cfg.origin}${destination}?${query}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", mcpFlowCookie(cfg));
    if (connectionId) headers.append("Set-Cookie", `${CONNECTION_COOKIE}=${connectionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${cfg.secureCookies ? "; Secure" : ""}`);
    return new Response(null, { status: 302, headers });
  };
  if (!flow) return finish("invalid");
  if (flow.destination === "audits") {
    const user = await getCurrentUser().catch(() => null);
    if (!user || user.id !== flow.userId) return finish("invalid");
  }
  let code: string;
  try { code = validateMcpCallback(flow, requestUrl.searchParams); }
  catch (error) { return finish(error instanceof UpworkMcpAuthError && error.code === "denied" ? "denied" : "invalid"); }
  try {
    const identity = await requestIdentity();
    const gate = await consume([{ key: `uwmcp:ip:${identity.ipHash}`, rule: { limit: Number(process.env.UPWORK_CONNECT_IP_LIMIT) || 20, windowMinutes: 60, lockMinutes: 60 } }]);
    if (!gate.ok) return finish("busy");
  } catch { return finish("busy"); }
  try {
    const token = await exchangeMcpCode(cfg, flow, code);
    const profile = await readMcpContentProfile(token, flow.profileUrl);
    const id = await holdEvidence(mcpContentEvidence(profile));
    return finish("connected", id);
  } catch (error) {
    console.error("Upwork MCP import failed", error instanceof UpworkMcpError ? error.code : error instanceof UpworkMcpAuthError ? error.code : "unknown");
    const outcome = error instanceof UpworkMcpError && error.code === "mismatch" ? "mismatch" :
      error instanceof UpworkMcpError && error.code === "account_required" ? "account" : "failed";
    return finish(outcome);
  }
}
