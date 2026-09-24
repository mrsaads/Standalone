import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { managementEnquiries } from "@/db/schema";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

const bodySchema = z.object({
  message: z.string().trim().max(1000).default(""),
}).strict();

// Records a signed-in user's interest in the managed profile-management service.
//
// THIS GRANTS NOTHING. It inserts one row in `management_enquiries` and touches no other table —
// in particular it never writes `workspace_members`, never creates a `client_workspaces` row, and
// never changes `profiles.audit_entitlement`. Enrolment is a manual admin action, by design: an
// endpoint a signed-in stranger can call is exactly the wrong place to be able to grant access to
// another client's reporting workspace.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  if (!isTrustedOrigin(request)) return json({ error: "Start this request from the Improvexus app." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Invalid request." }, 415);
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Check your message." }, 400);

  const db = getDb();

  // Rate limit by intent rather than by clock: one OPEN enquiry per user. A second submission
  // while the first is still unhandled is treated as success (the team already has the request)
  // rather than as an error, because from the customer's side nothing is wrong — and it stops the
  // admin queue filling with duplicates from someone clicking twice.
  const [existing] = await db
    .select({ id: managementEnquiries.id })
    .from(managementEnquiries)
    .where(and(
      eq(managementEnquiries.userId, user.id),
      inArray(managementEnquiries.status, ["new", "contacted"]),
    ))
    .orderBy(desc(managementEnquiries.createdAt))
    .limit(1);

  if (existing) {
    // If they wrote something new, keep it — appended rather than overwritten, so the earlier
    // context is not lost.
    if (parsed.data.message) {
      await db.update(managementEnquiries)
        .set({
          message: sql`case when ${managementEnquiries.message} = '' then ${parsed.data.message}
                       else ${managementEnquiries.message} || E'\n\n---\n\n' || ${parsed.data.message} end`,
          updatedAt: new Date(),
        })
        .where(eq(managementEnquiries.id, existing.id));
    }
    return json({ ok: true, alreadyOpen: true }, 200);
  }

  await db.insert(managementEnquiries).values({
    userId: user.id,
    userEmail: user.email,
    message: parsed.data.message,
    status: "new",
  });

  return json({ ok: true, alreadyOpen: false }, 201);
}
