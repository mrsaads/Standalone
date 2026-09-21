import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { getDb } from "@/db";
import { optimizationRequests } from "@/db/schema";
import { logAdminAction } from "@/lib/admin-log";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
const bodySchema = z.object({ status: z.enum(["new", "in_progress", "done"]) }).strict();

// Moves an optimization request through its status. Admin-only, logged.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid status." }, 400);

  const db = getDb();
  const [existing] = await db.select({ id: optimizationRequests.id, userEmail: optimizationRequests.userEmail }).from(optimizationRequests).where(eq(optimizationRequests.id, id)).limit(1);
  if (!existing) return json({ error: "Request not found." }, 404);

  await db.update(optimizationRequests).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(optimizationRequests.id, id));
  await logAdminAction(user.email, "optimization_request_status", "optimization_request", id, `${existing.userEmail} -> ${parsed.data.status}`);

  return json({ ok: true }, 200);
}
