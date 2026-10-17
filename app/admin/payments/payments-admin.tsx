"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel, TableScroll } from "../admin-shell";

export type OrderView = {
  id: string; email: string; auditId: string; amountPkr: number; gateway: string; status: string; reference: string;
  note: string; code: string; message: string; createdAt: string; paidAt: string | null; paidBy: string;
};

const LABEL: Record<string, string> = { pending: "Not paid yet", awaiting_review: "Says paid, check it", paid: "Paid", failed: "Failed", cancelled: "Closed" };
const variant = (s: string): "default" | "secondary" | "outline" | "destructive" => s === "paid" ? "default" : s === "awaiting_review" ? "destructive" : s === "failed" ? "outline" : "secondary";

export function PaymentsAdmin({ orders: initial, status }: { orders: OrderView[] | null; status: { price: number | null; jazzcash: string; manual: boolean } }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initial ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = useMemo(() => orders.filter(o => o.status === "awaiting_review").length, [orders]);

  async function act(order: OrderView, action: "mark_paid" | "cancel") {
    if (action === "mark_paid" && !window.confirm(`Confirm that Rs ${order.amountPkr.toLocaleString("en-PK")} from ${order.email} (reference ${order.reference}) has arrived in your account? This unlocks their report.`)) return;
    setBusy(order.id);
    try {
      const response = await fetch(`/api/admin/payments/${order.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) { toast.error(body.error || "That didn't work."); return; }
      setOrders(list => list.map(o => (o.id === order.id ? { ...o, status: action === "mark_paid" ? "paid" : "cancelled", paidBy: action === "mark_paid" ? "you" : o.paidBy } : o)));
      toast.success(action === "mark_paid" ? "Marked as paid. The report is unlocked." : "Order closed.");
      router.refresh();
    } catch { toast.error("That didn't work. Please try again."); }
    finally { setBusy(null); }
  }

  return (
    <>
      <Panel title="Setup" description="What customers can use right now. These come from Render environment variables.">
        <ul style={{ display: "grid", gap: 6 }}>
          <li>Price per report: <b>{status.price ? `Rs ${status.price.toLocaleString("en-PK")}` : "not set (REPORT_PRICE_PKR). Payments are off."}</b></li>
          <li>JazzCash / card: <b>{status.jazzcash === "off" ? "not connected yet" : status.jazzcash === "sandbox" ? "test mode (no real money)" : "live"}</b></li>
          <li>NayaPay / bank transfer: <b>{status.manual ? "on" : "off (set PAYMENT_MANUAL_INSTRUCTIONS or PAYMENT_MANUAL_LINK)"}</b></li>
        </ul>
      </Panel>

      <Panel title={`Orders${waiting ? ` (${waiting} waiting for you)` : ""}`} description="Newest first.">
        {initial === null ? (
          <p role="alert">The payments table isn&apos;t in the database yet. Run migration 0010 first, then reload this page.</p>
        ) : orders.length === 0 ? (
          <p>No orders yet.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>How</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell>{new Date(o.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                    <TableCell>{o.email}{o.note && <div style={{ opacity: 0.75, fontSize: 12.5 }}>&ldquo;{o.note}&rdquo;</div>}</TableCell>
                    <TableCell>Rs {o.amountPkr.toLocaleString("en-PK")}</TableCell>
                    <TableCell>{o.gateway === "jazzcash" ? "JazzCash" : "Transfer"}</TableCell>
                    <TableCell><code>{o.reference}</code></TableCell>
                    <TableCell>
                      <Badge variant={variant(o.status)}>{LABEL[o.status] ?? o.status}</Badge>
                      {o.status === "failed" && o.message && <div style={{ opacity: 0.75, fontSize: 12.5 }}>{o.code} {o.message}</div>}
                      {o.status === "paid" && <div style={{ opacity: 0.75, fontSize: 12.5 }}>{o.paidBy === "jazzcash" ? "confirmed by JazzCash" : `by ${o.paidBy}`}</div>}
                    </TableCell>
                    <TableCell>
                      {(o.status === "pending" || o.status === "awaiting_review") && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button size="sm" disabled={busy === o.id} onClick={() => void act(o, "mark_paid")}>Mark as paid</Button>
                          <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => void act(o, "cancel")}>Close</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </Panel>
    </>
  );
}
