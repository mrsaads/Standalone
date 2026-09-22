import { saveLead } from "@/lib/leads";
import { isTrustedOrigin } from "@/lib/http";
import { getCurrentUser } from "@/lib/auth";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function json(body: unknown, status: number) { return Response.json(body, { status, headers }); }

// Public: an anonymous landing-page visitor can submit this with no session. When it IS a signed-in
// user (the /client-portal "request access" case), we attach their userId server-side — never
// trusted from the request body — purely so an admin reviewing the lead can see it came from an
// existing account, not because it changes what the submission grants (still nothing automatic).
export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return json({ error: "Please submit this from the Improvexus site." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request format." }, 415);
  let input: unknown;
  try { input = await request.json(); } catch { return json({ error: "Your request could not be read. Please try again." }, 400); }
  const user = await getCurrentUser();
  try {
    const result = await saveLead(input, user?.id ?? null);
    return json(result.body, result.status);
  } catch (error) {
    console.error("Lead storage failure", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Your request could not be saved right now. Please try again." }, 503);
  }
}
