import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentOrders, profileAudits } from "@/db/schema";
import type { AppUser } from "@/lib/auth";
import type { Entitlement } from "@/lib/entitlements";
import { jazzcashConfig, pktStamp } from "@/lib/jazzcash";

// Paying to unlock ONE audit report. The rule is short on purpose:
//
//   a report is unlocked for its owner when a payment_orders row for it has status "paid".
//
// Everything else in this file is about getting a row to "paid" honestly, either from JazzCash
// (the signed return, app/api/payments/jazzcash/return/route.ts) or from an admin who has seen the
// money arrive in their own account (app/api/admin/payments/[id]/route.ts, for NayaPay or bank
// transfers). The reports themselves are still locked or unlocked on the server by
// lib/audit-access.ts; this file only decides what entitlement to hand it for a given report.

export type PaymentMethod = "jazzcash" | "manual";
export const OPEN_STATUSES = ["pending", "awaiting_review"] as const;

export type PaymentOptions = {
  /** Price in rupees, or null when no price is set (payments are then off). */
  pricePkr: number | null;
  jazzcash: boolean;
  manual: { text: string; link: string } | null;
  sandbox: boolean;
};

/** What can be offered right now. No secrets: this is sent to the browser. */
export function paymentOptions(env: NodeJS.ProcessEnv = process.env): PaymentOptions {
  const price = Number(env.REPORT_PRICE_PKR);
  const pricePkr = Number.isFinite(price) && price >= 1 ? Math.round(price) : null;
  const cfg = jazzcashConfig(env);
  const text = (env.PAYMENT_MANUAL_INSTRUCTIONS || "").trim().slice(0, 600);
  const link = (env.PAYMENT_MANUAL_LINK || "").trim();
  const safeLink = /^https:\/\//i.test(link) ? link.slice(0, 500) : "";
  return {
    pricePkr,
    jazzcash: Boolean(pricePkr && cfg),
    manual: pricePkr && (text || safeLink) ? { text, link: safeLink } : null,
    sandbox: cfg?.environment === "sandbox",
  };
}

export const amountMinorFor = (pricePkr: number) => Math.round(pricePkr * 100);

/** A reference that is unique, short enough for the gateway, and easy to read out in a message. */
export function newTxnRef(now = new Date()): string {
  return `T${pktStamp(now)}${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** True when this report has been paid for. Fails CLOSED: any database problem means "not paid", so
 * a payments table that is missing or unreachable can never unlock a report, and also never stops
 * a report from opening. */
export async function isAuditPaid(auditId: string): Promise<boolean> {
  try {
    const [row] = await getDb().select({ id: paymentOrders.id }).from(paymentOrders)
      .where(and(eq(paymentOrders.auditId, auditId), eq(paymentOrders.status, "paid"))).limit(1);
    return Boolean(row);
  } catch (error) {
    console.error("Payments: paid check failed, treating the report as locked", error instanceof Error ? error.name : "UnknownError");
    return false;
  }
}

/** The entitlement to enforce for ONE report: the account's own, widened if this report was paid for. */
export function entitlementForPaid(base: Entitlement, paid: boolean): Entitlement & { unlockedByPayment: boolean } {
  if (!paid) return { ...base, unlockedByPayment: false };
  return { ...base, canDownload: true, canOptimize: true, unlockedByPayment: true };
}

export async function entitlementForAudit(base: Entitlement, auditId: string | null | undefined) {
  return entitlementForPaid(base, auditId ? await isAuditPaid(auditId) : false);
}

export type OrderRow = typeof paymentOrders.$inferSelect;

export class PaymentError extends Error {
  constructor(public code: "NOT_FOUND" | "ALREADY_PAID" | "NOT_READY" | "DISABLED" | "TOO_MANY", message: string) { super(message); }
}

/** Creates (or, for a manual payment, reuses) an order for one of the caller's completed audits. */
export async function createOrder(user: AppUser, auditId: string, method: PaymentMethod, options = paymentOptions()): Promise<OrderRow> {
  if (!options.pricePkr) throw new PaymentError("DISABLED", "Payments are not switched on yet.");
  if (method === "jazzcash" && !options.jazzcash) throw new PaymentError("DISABLED", "Card and wallet payment is not available yet.");
  if (method === "manual" && !options.manual) throw new PaymentError("DISABLED", "Bank transfer payment is not available yet.");

  const db = getDb();
  const [audit] = await db.select({ id: profileAudits.id, userId: profileAudits.userId, status: profileAudits.status })
    .from(profileAudits).where(eq(profileAudits.id, auditId)).limit(1);
  // Same answer for "not yours" and "does not exist": the id of someone else's report is not a secret to leak.
  if (!audit || audit.userId !== user.id) throw new PaymentError("NOT_FOUND", "Audit not found.");
  if (audit.status !== "completed") throw new PaymentError("NOT_READY", "This audit has not finished generating.");
  if (await isAuditPaid(auditId)) throw new PaymentError("ALREADY_PAID", "This report is already unlocked.");

  if (method === "manual") {
    const [open] = await db.select().from(paymentOrders)
      .where(and(eq(paymentOrders.auditId, auditId), eq(paymentOrders.gateway, "manual"), inArray(paymentOrders.status, [...OPEN_STATUSES])))
      .orderBy(desc(paymentOrders.createdAt)).limit(1);
    if (open) return open;
  }

  // A browser that keeps pressing the button should not fill the table.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db.select({ n: count() }).from(paymentOrders)
    .where(and(eq(paymentOrders.userId, user.id), gte(paymentOrders.createdAt, since)));
  if ((recent?.n ?? 0) >= 12) throw new PaymentError("TOO_MANY", "Too many payment attempts. Please try again in a little while.");

  const [created] = await db.insert(paymentOrders).values({
    userId: user.id, userEmail: user.email, auditId, amountMinor: amountMinorFor(options.pricePkr),
    currency: "PKR", gateway: method, status: "pending", txnRef: newTxnRef(),
  }).returning();
  return created;
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: string }).code === "23505") return true;
  }
  return false;
}

export type PaidResult = "paid" | "already_paid" | "report_already_unlocked" | "not_found";

/** Moves an order to "paid". Safe to call twice and safe to call at the same moment from two places:
 * the UPDATE only matches an order that is not already paid, and the unique index allows a single
 * paid order per report, so the worst a race can do is report "already". */
export async function markOrderPaid(where: { id: string } | { txnRef: string }, by: string, gatewayCode = "", gatewayMessage = ""): Promise<{ result: PaidResult; order?: OrderRow }> {
  const db = getDb();
  const match = "id" in where ? eq(paymentOrders.id, where.id) : eq(paymentOrders.txnRef, where.txnRef);
  const [existing] = await db.select().from(paymentOrders).where(match).limit(1);
  if (!existing) return { result: "not_found" };
  if (existing.status === "paid") return { result: "already_paid", order: existing };
  try {
    const [updated] = await db.update(paymentOrders)
      .set({ status: "paid", paidAt: new Date(), paidBy: by, gatewayCode, gatewayMessage, updatedAt: new Date() })
      .where(and(eq(paymentOrders.id, existing.id), ne(paymentOrders.status, "paid"))).returning();
    return updated ? { result: "paid", order: updated } : { result: "already_paid", order: existing };
  } catch (error) {
    // 23505: another order for this report is already paid (unique index). The report is unlocked,
    // which is the goal. drizzle wraps the driver's error, so the code is on `cause`.
    if (isUniqueViolation(error)) return { result: "report_already_unlocked", order: existing };
    throw error;
  }
}

/** Records a failed or abandoned attempt, but never downgrades a paid order. */
export async function markOrderFailed(txnRef: string, code: string, message: string, status: "failed" | "cancelled" = "failed") {
  await getDb().update(paymentOrders)
    .set({ status, gatewayCode: code.slice(0, 20), gatewayMessage: message.slice(0, 300), updatedAt: new Date() })
    .where(and(eq(paymentOrders.txnRef, txnRef), inArray(paymentOrders.status, [...OPEN_STATUSES])));
}

/** The customer says "I have paid": it moves to the top of the admin's list. It does NOT unlock anything. */
export async function claimManualPayment(user: AppUser, orderId: string, note: string): Promise<OrderRow | null> {
  const [row] = await getDb().update(paymentOrders)
    .set({ status: "awaiting_review", payerNote: note.replace(/\s+/g, " ").trim().slice(0, 300), updatedAt: new Date() })
    .where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.userId, user.id), eq(paymentOrders.gateway, "manual"), inArray(paymentOrders.status, [...OPEN_STATUSES])))
    .returning();
  return row ?? null;
}

export async function listOrdersForAdmin(limit = 200): Promise<OrderRow[]> {
  return getDb().select().from(paymentOrders).orderBy(desc(paymentOrders.createdAt)).limit(limit);
}
