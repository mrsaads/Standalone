import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { fetchUpworkProfile } from "@/lib/upwork-fetch";
import { CONNECTION_COOKIE, connectedAuditPreview, peekEvidence } from "@/lib/upwork-connected";
import { requestCookie } from "@/lib/upwork-connect-flow";
import { extractBasicDetails } from "@/lib/audit-preview";

// Preview-only extraction for the "Profile link" source tab. This is deliberately a separate,
// no-credit endpoint from POST /api/audits: it exists so the review screen can show the user what
// was actually read from Upwork *before* they commit to a full (weekly-limited, AI-billed) audit
// run. It never reserves an audit slot and never calls an AI provider — see app/api/audits/route.ts
// for the endpoint that does. The audit workspace calls it for links and connected profiles.
const requestSchema = z.union([
  z.object({ profileUrl: z.string().min(1).max(1000) }).strict(),
  z.object({ connected: z.literal(true) }).strict(),
]);

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to check a profile link." }, 401);
  if (!isTrustedOrigin(request)) return json({ error: "Start this check from the audit page." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Add a profile link." }, 400);

  if ("connected" in parsed.data) {
    try {
      const id = requestCookie(request, CONNECTION_COOKIE);
      const evidence = id ? await peekEvidence(id) : null;
      if (!evidence) return json({ code: "CONNECTION_EXPIRED", error: "Your connected profile has expired. Connect Upwork again to import it." }, 409);
      // Preview only: no model call, audit reservation or credit charge. Keeping the holding row
      // until its normal expiry lets the browser retry an interrupted import.
      return json(connectedAuditPreview(evidence));
    } catch {
      return json({ error: "Your connected profile could not be loaded. Please try again shortly." }, 503);
    }
  }

  const result = await fetchUpworkProfile(parsed.data.profileUrl);

  if (result.outcome === "success" || result.outcome === "partial") {
    return json({
      outcome: result.outcome,
      profileText: result.text,
      details: extractBasicDetails(result.text),
      message: result.outcome === "partial" ? result.message : undefined,
    });
  }
  // blocked / unavailable / timeout / parse_failed / invalid — no usable text. The frontend keeps the
  // user on the source screen and shows this message rather than advancing to an empty review step.
  // Logged (outcome only — never the URL's fetched HTML or any profile content) for the same reason
  // Part 1's AiProviderError diagnostics exist: so a pattern of failures is diagnosable from Render
  // logs instead of every failure looking identical.
  console.info("Profile link preview did not return usable text", result.outcome);
  return json({ outcome: result.outcome, message: result.message });
}
