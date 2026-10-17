import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { claimManualPayment } from "@/lib/audit-payments";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const bodySchema = z.object({ note: z.string().max(300).default("") }).strict();

// "I have paid." Puts the order at the top of the admin's list with the customer's note (for
// example the sending account or transaction number). It unlocks NOTHING by itself: only an admin
// who has seen the money arrive can do that.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  if (!isTrustedOrigin(request)) return json({ error: "Start this from the report page." }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Order not found." }, 404);
  let body: unknown = {};
  try { body = await request.json(); } catch { /* an empty body is fine */ }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const order = await claimManualPayment(user, id, parsed.data.note);
  if (!order) return json({ error: "Order not found." }, 404);
  return json({ ok: true });
}
