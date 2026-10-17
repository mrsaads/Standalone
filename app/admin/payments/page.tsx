import { requireAdminPage } from "@/lib/admin-guard";
import { listOrdersForAdmin, paymentOptions } from "@/lib/audit-payments";
import { jazzcashConfig } from "@/lib/jazzcash";
import { AdminShell } from "../admin-shell";
import { PaymentsAdmin, type OrderView } from "./payments-admin";

export const dynamic = "force-dynamic";

// Report payments: who is paying to unlock a report, and the manual ones that are waiting for an
// admin to confirm that the money arrived. A manual order unlocks nothing until "Mark as paid" is
// pressed here.
export default async function AdminPaymentsPage() {
  const { user, navCounts } = await requireAdminPage();
  const rows = await listOrdersForAdmin().catch(() => null);
  const options = paymentOptions();
  const cfg = jazzcashConfig();
  const orders: OrderView[] | null = rows && rows.map(r => ({
    id: r.id, email: r.userEmail, auditId: r.auditId, amountPkr: r.amountMinor / 100, gateway: r.gateway, status: r.status,
    reference: r.txnRef, note: r.payerNote, code: r.gatewayCode, message: r.gatewayMessage,
    createdAt: r.createdAt.toISOString(), paidAt: r.paidAt ? r.paidAt.toISOString() : null, paidBy: r.paidBy,
  }));
  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Payments"
      description="Each row is one attempt to unlock one report. Card and wallet payments confirm themselves. Bank and NayaPay payments wait here until you have seen the money arrive and press Mark as paid."
    >
      <PaymentsAdmin
        orders={orders}
        status={{ price: options.pricePkr, jazzcash: cfg ? cfg.environment : "off", manual: Boolean(options.manual) }}
      />
    </AdminShell>
  );
}
