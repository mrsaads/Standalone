import { exchangeCode, sameSecret, upworkApiConfig } from "@/lib/upwork-api";
import { CONNECTION_COOKIE, holdEvidence, readOwnProfile } from "@/lib/upwork-connected";
import { requestOrigin } from "@/lib/http";
import { consume, requestIdentity } from "@/lib/security/email-throttle";

// Upwork sends the visitor's browser back here after they approve or refuse access. Public by design
// (the visit comes from upwork.com, so there is no login to check): what makes it trustworthy is the
// `state` cookie set in ../connect/route.ts, plus the fact that the code in the URL only works
// together with OUR client secret.
//
// The access token lives only inside this request. What is kept is the customer's own profile text,
// for 15 minutes, in one row that the next score request claims and deletes (lib/upwork-connected.ts).
const STATE_COOKIE = "ix_uw_state";

function readCookie(request: Request, name: string) {
  const match = (request.headers.get("cookie") || "").split(/;\s*/).find(part => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const clearState = `${STATE_COOKIE}=; Path=/api/upwork; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  const back = (outcome: string, extra: string[] = []) => {
    const headers = new Headers({ Location: `${origin}/profile-score?${outcome === "connected" ? "connected=1" : `upwork=${outcome}`}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearState);
    for (const cookie of extra) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
  };

  const cfg = upworkApiConfig(process.env, origin);
  if (!cfg) return back("off");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request, STATE_COOKIE);
  if (!state || !expected || !/^[0-9a-f]{48}$/.test(state) || !sameSecret(state, expected)) return back("invalid");
  if (url.searchParams.get("error")) return back("denied");
  if (!code || code.length > 4096) return back("invalid");

  // Every successful sign-in spends our Upwork API allowance, so this is limited per network address.
  try {
    const identity = await requestIdentity();
    const gate = await consume([{ key: `uwconnect:ip:${identity.ipHash}`, rule: { limit: Number(process.env.UPWORK_CONNECT_IP_LIMIT) || 20, windowMinutes: 60, lockMinutes: 60 } }]);
    if (!gate.ok) return back("busy");
  } catch { return back("busy"); }

  try {
    const token = await exchangeCode(cfg, code);
    const read = await readOwnProfile(cfg, token);
    if (!read.ok) return back(read.reason === "scope" ? "scope" : "failed");
    const id = await holdEvidence(read.evidence);
    return back("connected", [`${CONNECTION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${secure}`]);
  } catch (error) {
    console.error("Upwork connect failed", error instanceof Error ? error.name : "UnknownError");
    return back("failed");
  }
}
