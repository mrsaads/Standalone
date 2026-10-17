import { getCurrentUser } from "@/lib/auth";
import { paymentOptions } from "@/lib/audit-payments";

const headers = { "Cache-Control": "no-store" };

// What the "Unlock this report" dialog may offer: the price and which ways of paying are switched on.
// No secrets in here; it is read from the same settings the order route enforces.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  return Response.json(paymentOptions(), { headers });
}
