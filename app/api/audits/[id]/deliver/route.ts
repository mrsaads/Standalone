import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { profileAudits } from "@/db/schema";
import { requeueDelivery } from "@/lib/delivery-worker";
import { isTrustedOrigin } from "@/lib/http";

const headers = { "Cache-Control": "no-store" };

// Manually retries Drive filing and the audit-ready email for one audit, without generating
// another audit or touching the weekly allowance — the exact "retryable" requirement for both
// integrations. Callable by the audit's own owner (e.g. a "resend / retry filing" action on the
// saved-audits list) or an admin (from the admin panel's per-audit retry action).
//
// This only writes to the persisted delivery_jobs queue (requeueDelivery) and returns immediately
// — it does not perform the Drive upload or email send inline. The in-process worker (started once
// per server start from instrumentation.ts; see lib/delivery-worker.ts) picks the requeued job up
// on its next poll tick (within POLL_INTERVAL_MS), which also means this endpoint responds quickly
// instead of making the caller wait on Drive/Resend latency.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Matches the same-origin check in app/api/audits/route.ts and app/api/enquiries/route.ts.
  // Supabase's session cookie is already SameSite=Lax (blocking cross-site POST on its own), but
  // this keeps the CSRF posture consistent across every state-changing route rather than relying
  // on cookie behavior alone.
  if (!isTrustedOrigin(request)) return Response.json({ error: "Start this action from the app." }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select({ userId: profileAudits.userId }).from(profileAudits).where(eq(profileAudits.id, id)).limit(1);
  if (!row) return Response.json({ error: "Audit not found." }, { status: 404, headers });
  if (row.userId !== user.id && user.role !== "admin") return Response.json({ error: "Audit not found." }, { status: 404, headers });

  await requeueDelivery(id);
  return Response.json({ queued: true }, { headers });
}
