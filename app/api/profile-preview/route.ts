import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { fetchUpworkProfile } from "@/lib/upwork-fetch";
import { extractBasicDetails } from "@/lib/audit-preview";

// Preview-only extraction for the "Profile link" source tab. This is deliberately a separate,
// no-credit endpoint from POST /api/audits: it exists so the review screen can show the user what
// was actually read from Upwork *before* they commit to a full (weekly-limited, AI-billed) audit
// run. It never reserves an audit slot and never calls an AI provider — see app/api/audits/route.ts
// for the endpoint that does. Frontend caller: app/page.tsx's submit() when source === "link".
const requestSchema = z.object({ profileUrl: z.string().min(1).max(1000) }).strict();

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
  return json({ outcome: result.outcome, message: result.message });
}
