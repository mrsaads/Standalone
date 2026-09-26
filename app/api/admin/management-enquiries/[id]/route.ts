import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { managementEnquiries } from "@/db/schema";
import { logAdminAction } from "@/lib/admin-log";
import { MANAGEMENT_ENQUIRY_STATUSES } from "@/lib/admin-inbox-shared";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
const bodySchema = z.object({ status: z.enum(MANAGEMENT_ENQUIRY_STATUSES) }).strict();

// Moves a "manage my profile for me" request through its status, and records which admin handled it.
//
// Setting the status to "converted" grants NOTHING. It is a note about what a human decided; the
// actual managed-client access is a workspace_members row created in the client-portal section
// against a verified account id. Keeping those two apart is the point — see lib/workspace-access.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Request not found." }, 404);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid status." }, 400);

  const db = getDb();
  const [existing] = await db.select({ id: managementEnquiries.id, userEmail: managementEnquiries.userEmail })
    .from(managementEnquiries).where(eq(managementEnquiries.id, id)).limit(1);
  if (!existing) return json({ error: "Request not found." }, 404);

  await db.update(managementEnquiries)
    .set({ status: parsed.data.status, handledByEmail: user.email, updatedAt: new Date() })
    .where(eq(managementEnquiries.id, id));
  await logAdminAction(user.email, "management_enquiry_status", "management_enquiry", id, `${existing.userEmail} -> ${parsed.data.status}`);

  return json({ ok: true, status: parsed.data.status, handledByEmail: user.email }, 200);
}
