import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentOrders } from "@/db/schema";
import { markOrderFailed, markOrderPaid } from "@/lib/audit-payments";
import { resolveAppOrigin } from "@/lib/http";
import { jazzcashConfig, verifyReturn } from "@/lib/jazzcash";

// Where JazzCash sends the customer's browser after the payment page.
//
// PUBLIC ON PURPOSE (middleware.ts publicPaths): this is a cross-site POST, so the browser does not
// attach the login cookie and a signed-in check here would bounce every customer to /login. It is
// safe without one because nothing is believed until verifyReturn() has checked the HMAC signature
// that only JazzCash and this server can produce. No origin check either, for the same reason: the
// request legitimately comes from JazzCash's domain.
//
// After handling it the customer is redirected (303) to a normal GET page, where their cookie is sent
// again and the report opens already unlocked.
export const dynamic = "force-dynamic";

function back(request: Request, auditId: string | null, result: "success" | "failed" | "invalid") {
  const origin = resolveAppOrigin(request);
  const target = auditId ? `/audits?openAudit=${auditId}&payment=${result}` : `/audits?payment=${result}`;
  return new Response(null, { status: 303, headers: { Location: `${origin}${target}`, "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const cfg = jazzcashConfig();
  if (!cfg) { console.error("Payments: JazzCash return received but JazzCash is not configured"); return back(request, null, "invalid"); }

  const posted: Record<string, string> = {};
  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) if (typeof value === "string" && key.length <= 60) posted[key] = value.slice(0, 600);
  } catch {
    return back(request, null, "invalid");
  }

  const checked = verifyReturn(cfg, posted);
  if (!checked.ok) {
    console.error("Payments: JazzCash return rejected", checked.reason);
    return back(request, null, "invalid");
  }

  const db = getDb();
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.txnRef, checked.txnRef)).limit(1);
  if (!order) { console.error("Payments: JazzCash return for an unknown reference"); return back(request, null, "invalid"); }

  // The signature proves JazzCash said it. The amount check proves it is about the price we set.
  if (checked.amountMinor !== order.amountMinor) {
    console.error("Payments: JazzCash amount did not match the order", { expected: order.amountMinor, got: checked.amountMinor });
    return back(request, order.auditId, "invalid");
  }

  if (checked.success) {
    const { result } = await markOrderPaid({ txnRef: order.txnRef }, "jazzcash", checked.code, checked.message);
    console.info("Payments: JazzCash payment recorded", result, checked.code);
    return back(request, order.auditId, "success");
  }
  // Seen once in the sandbox and then added to JAZZCASH_SUCCESS_CODES if it turns out to be a success.
  console.info("Payments: JazzCash payment not completed", checked.code, checked.message);
  await markOrderFailed(order.txnRef, checked.code, checked.message);
  return back(request, order.auditId, "failed");
}
