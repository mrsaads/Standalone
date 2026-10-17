import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { logAdminAction } from "@/lib/admin-log";
import { markOrderPaid } from "@/lib/audit-payments";
import { getDb } from "@/db";
import { paymentOrders } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const bodySchema = z.object({ action: z.enum(["mark_paid", "cancel"]) }).strict();

// An admin confirms that money arrived (NayaPay, bank transfer, cash) or closes an order that never
// will. Admin-only, origin-checked and written to the admin log. Marking paid is the ONLY way a
// manual payment unlocks a report.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Order not found." }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid action." }, 400);

  if (parsed.data.action === "mark_paid") {
    const { result, order } = await markOrderPaid({ id }, user.email, "manual", "Confirmed by an admin");
    if (result === "not_found") return json({ error: "Order not found." }, 404);
    await logAdminAction(user.email, "payment_mark_paid", "payment_order", id, `${order?.userEmail ?? ""} ${order?.txnRef ?? ""} -> ${result}`);
    return json({ ok: true, result });
  }

  const [closed] = await getDb().update(paymentOrders).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(paymentOrders.id, id), inArray(paymentOrders.status, ["pending", "awaiting_review"]))).returning({ id: paymentOrders.id, ref: paymentOrders.txnRef });
  if (!closed) return json({ error: "Only an open order can be closed." }, 409);
  await logAdminAction(user.email, "payment_cancel", "payment_order", id, closed.ref);
  return json({ ok: true });
}
