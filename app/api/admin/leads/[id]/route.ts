import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { logAdminAction } from "@/lib/admin-log";
import { LEAD_STATUSES } from "@/lib/admin-inbox-shared";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
const bodySchema = z.object({ status: z.enum(LEAD_STATUSES) }).strict();

// Moves a website enquiry through new -> reviewed -> actioned. Admin-only, logged.
//
// Deliberately the ONLY mutation this route can perform. A lead is a marketing record; it must
// never be possible to turn one into an account, an entitlement, or a workspace membership by
// poking this endpoint — those are created by hand elsewhere, against a verified account id.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  // Filtered here so a malformed id is a 400 rather than a Postgres uuid cast error (a 500) deeper in.
  if (!isUuid(id)) return json({ error: "Enquiry not found." }, 404);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid status." }, 400);

  const db = getDb();
  const [existing] = await db.select({ id: leads.id, email: leads.email }).from(leads).where(eq(leads.id, id)).limit(1);
  if (!existing) return json({ error: "Enquiry not found." }, 404);

  await db.update(leads).set({ status: parsed.data.status }).where(eq(leads.id, id));
  await logAdminAction(user.email, "lead_status", "lead", id, `${existing.email} -> ${parsed.data.status}`);

  return json({ ok: true, status: parsed.data.status }, 200);
}
