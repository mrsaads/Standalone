import { getCurrentUser } from "@/lib/auth";
import { mcpAuthorizeUrl, mcpFlowCookie, newMcpFlow, sealMcpFlow, upworkMcpConfig } from "@/lib/upwork-mcp-auth";

export async function GET(request: Request) {
  const cfg = upworkMcpConfig();
  const url = new URL(request.url);
  const destination = url.searchParams.get("destination") === "audits" ? "audits" : "score";
  const back = destination === "audits" ? "/audits" : "/profile-score";
  if (!cfg) return Response.redirect(`${url.origin}${back}?upwork=off`, 302);
  const profileUrl = url.searchParams.get("profileUrl") || "";
  const user = destination === "audits" ? await getCurrentUser().catch(() => null) : null;
  if (destination === "audits" && !user) return Response.redirect(`${cfg.origin}/login?next=%2Faudits`, 302);
  try {
    const flow = newMcpFlow({ profileUrl, destination, userId: user?.id });
    const headers = new Headers({ Location: mcpAuthorizeUrl(cfg, flow), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", mcpFlowCookie(cfg, sealMcpFlow(cfg, flow)));
    return new Response(null, { status: 302, headers });
  } catch { return Response.redirect(`${cfg.origin}${back}?upwork=invalid`, 302); }
}
