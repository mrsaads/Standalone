import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin, resolveAppOrigin } from "@/lib/http";
import { createOrder, paymentOptions, PaymentError } from "@/lib/audit-payments";
import { buildCheckout, jazzcashConfig } from "@/lib/jazzcash";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const bodySchema = z.object({ auditId: z.string().uuid(), method: z.enum(["jazzcash", "manual"]) }).strict();

const STATUS: Record<PaymentError["code"], number> = { NOT_FOUND: 404, ALREADY_PAID: 409, NOT_READY: 409, DISABLED: 503, TOO_MANY: 429 };

// Starts a payment for one of the caller's own audit reports.
//   jazzcash: returns a signed form; the browser posts it to JazzCash, which sends the customer back
//             to /api/payments/jazzcash/return when done. The amount is decided HERE from the server's
//             own price setting, never from anything the browser sent.
//   manual:   returns the payment instructions (a NayaPay link or bank details) and an order
//             reference. Nothing is unlocked until an admin has seen the money and marked it paid.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  if (!isTrustedOrigin(request)) return json({ error: "Start this from the report page." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);

  const options = paymentOptions();
  try {
    const order = await createOrder(user, parsed.data.auditId, parsed.data.method, options);
    const summary = { id: order.id, reference: order.txnRef, amountPkr: order.amountMinor / 100 };
    if (parsed.data.method === "manual") return json({ order: summary, manual: options.manual });

    const cfg = jazzcashConfig();
    if (!cfg) return json({ error: "Card and wallet payment is not available yet." }, 503);
    const checkout = buildCheckout(cfg, {
      txnRef: order.txnRef,
      amountMinor: order.amountMinor,
      billReference: `IX${order.id.replace(/-/g, "").slice(0, 10)}`,
      description: "Improvexus Upwork profile audit report",
      returnUrl: `${resolveAppOrigin(request)}/api/payments/jazzcash/return`,
    });
    return json({ order: summary, checkout });
  } catch (error) {
    if (error instanceof PaymentError) return json({ error: error.message, code: error.code }, STATUS[error.code]);
    console.error("Payments: could not create an order", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "We couldn't start the payment. Please try again." }, 503);
  }
}
