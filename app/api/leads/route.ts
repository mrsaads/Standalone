import { saveLead } from "@/lib/leads";
import { isTrustedOrigin } from "@/lib/http";
import { getCurrentUser } from "@/lib/auth";
import { guardLead } from "@/lib/security/lead-throttle";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function json(body: unknown, status: number, extra: Record<string, string> = {}) { return Response.json(body, { status, headers: { ...headers, ...extra } }); }

// Public: an anonymous landing-page visitor can submit this with no session. When it IS a signed-in
// user (the /client-portal "request access" case), we attach their userId server-side — never
// trusted from the request body — purely so an admin reviewing the lead can see it came from an
// existing account, not because it changes what the submission grants (still nothing automatic).
export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return json({ error: "Please submit this from the Improvexus site." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request format." }, 415);
  let input: unknown;
  try { input = await request.json(); } catch { return json({ error: "Your request could not be read. Please try again." }, 400); }
  // The one route a signed-out stranger hits: if the session lookup itself fails (auth service
  // unreachable), save the enquiry as anonymous rather than losing it to a 500.
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try { user = await getCurrentUser(); }
  catch (error) { console.error("Lead: could not resolve the signed-in user; saving it as anonymous.", error instanceof Error ? error.name : "UnknownError"); }
  try {
    const result = await saveLead(input, user?.id ?? null, guardLead);
    const retry = result.body.retryAfterSeconds;
    return json(result.body, result.status, retry ? { "Retry-After": String(retry) } : {});
  } catch (error) {
    console.error("Lead storage failure", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Your request could not be saved right now. Please try again." }, 503);
  }
}
