import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl, upworkApiConfig } from "@/lib/upwork-api";
import { UPWORK_DESTINATION_COOKIE, upworkReturnPath } from "@/lib/upwork-connect-flow";
import { requestOrigin } from "@/lib/http";

// "Connect Upwork": sends the visitor to Upwork's own sign-in and approval page. We never see their
// Upwork password. The random `state` is parked in a short-lived cookie and checked again in
// app/api/upwork/callback/route.ts (standard OAuth CSRF protection). Without an approved Upwork API key
// (UPWORK_API_CLIENT_ID / _SECRET) this route does nothing but send the visitor back.
const STATE_COOKIE = "ix_uw_state";

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const destination = new URL(request.url).searchParams.get("destination");
  const returnPath = upworkReturnPath(destination);
  const cfg = upworkApiConfig(process.env, origin);
  if (!cfg) return Response.redirect(`${origin}${returnPath}?upwork=off`, 302);
  const state = randomBytes(24).toString("hex");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const headers = new Headers({ Location: buildAuthorizeUrl(cfg, state), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", `${STATE_COOKIE}=${state}; Path=/api/upwork; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  headers.append("Set-Cookie", `${UPWORK_DESTINATION_COOKIE}=${returnPath === "/audits" ? "audits" : "score"}; Path=/api/upwork; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  return new Response(null, { status: 302, headers });
}
