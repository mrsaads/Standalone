// LOCAL-ONLY test for paying to unlock a report.
//
// Needs a Postgres with migrations applied, via SUPABASE_DB_URL. No JazzCash account and no network:
// the gateway's signed result is produced here with the documented hash rule, written out a second
// time in this file (not imported) so a bug in lib/jazzcash.ts cannot hide behind itself.
//
// The properties that matter, in order:
//   1. Only a result that carries a valid signature, the right amount and a success code can unlock.
//   2. A report is unlocked by a paid order for THAT report and nothing else (not another report, not
//      another user's attempt).
//   3. Paying twice, or two confirmations at the same moment, can never double-count or break anything.
//   4. If the payments table is missing or unreachable the report stays locked, and still opens.
//
// Usage: SUPABASE_DB_URL=postgres://... npx tsx scripts/local-tests/payments.local-test.mts
import { createHmac, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

process.env.JAZZCASH_MERCHANT_ID = "MC00000";
process.env.JAZZCASH_PASSWORD = "pw-test";
process.env.JAZZCASH_INTEGRITY_SALT = "salt-test-123";
process.env.REPORT_PRICE_PKR = "1500";
process.env.PAYMENT_MANUAL_INSTRUCTIONS = "NayaPay: 0300 0000000 (Improvexus)";
process.env.APP_ORIGIN = "https://www.improvexus.test";

const { getDb } = await import("../../db");
const { paymentOrders, profileAudits } = await import("../../db/schema");
const pay = await import("../../lib/audit-payments");
const jc = await import("../../lib/jazzcash");
const { applyAuditAccess } = await import("../../lib/audit-access");
const { entitlementFor } = await import("../../lib/entitlements");
const { sampleAuditReport } = await import("../../lib/audit-preview");
const route = await import("../../app/api/payments/jazzcash/return/route");

let pass = 0, fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}
function section(title: string) { console.log(`\n${title}`); }

// Independent restatement of the hash rule from JazzCash's integration notes.
function referenceHash(fields: Record<string, string>, salt: string) {
  const values = Object.keys(fields).filter(k => k.startsWith("pp") && k !== "pp_SecureHash" && fields[k] !== "").sort().map(k => fields[k]);
  return createHmac("sha256", salt).update([salt, ...values].join("&"), "latin1").digest("hex").toUpperCase();
}

const cfg = jc.jazzcashConfig()!;

section("Configuration");
assert(cfg.environment === "sandbox", "defaults to the SANDBOX unless JAZZCASH_ENV=production");
assert(jc.jazzcashConfig({ JAZZCASH_MERCHANT_ID: "a", JAZZCASH_PASSWORD: "b" } as unknown as NodeJS.ProcessEnv) === null, "JazzCash is off unless merchant id, password AND salt are all set");
assert(jc.jazzcashConfig({ JAZZCASH_MERCHANT_ID: "a", JAZZCASH_PASSWORD: "b", JAZZCASH_INTEGRITY_SALT: "c", JAZZCASH_ENV: "production" } as unknown as NodeJS.ProcessEnv)!.checkoutUrl.startsWith("https://payments.jazzcash.com.pk/"), "production selects the production checkout address");
assert(pay.paymentOptions({} as unknown as NodeJS.ProcessEnv).pricePkr === null && !pay.paymentOptions({} as unknown as NodeJS.ProcessEnv).jazzcash, "no price means nothing is offered");
assert(pay.paymentOptions({ REPORT_PRICE_PKR: "0" } as unknown as NodeJS.ProcessEnv).pricePkr === null, "a zero price counts as no price");
assert(pay.paymentOptions({ REPORT_PRICE_PKR: "1500", PAYMENT_MANUAL_LINK: "http://evil" } as unknown as NodeJS.ProcessEnv).manual === null, "a manual payment link must be https, otherwise it is ignored");
const opts = pay.paymentOptions();
assert(opts.pricePkr === 1500 && opts.jazzcash && !!opts.manual && opts.sandbox, "options reflect the settings and carry no secrets");
assert(!JSON.stringify(opts).includes("salt-test-123") && !JSON.stringify(opts).includes("pw-test"), "the browser-facing options never contain the salt or password");

section("Signing");
const built = jc.buildCheckout(cfg, { txnRef: "T20261016120000AB12", amountMinor: 150000, billReference: "IX-ab_12 34", description: "Audit é report", returnUrl: "https://www.improvexus.test/api/payments/jazzcash/return", now: new Date("2026-10-16T07:00:00Z") });
assert(built.fields.pp_SecureHash === referenceHash(built.fields, cfg.salt), "the checkout hash matches the documented rule, computed independently");
assert(built.fields.pp_Amount === "150000" && built.fields.pp_TxnCurrency === "PKR", "amount is sent in paisa");
assert(built.fields.pp_TxnDateTime === "20261016120000", "time is Pakistan time (UTC+5)");
assert(built.fields.pp_TxnExpiryDateTime === "20261017120000", "the checkout expires after one day");
assert(built.fields.pp_BillReference === "IXab1234", "the bill reference is letters and digits only");
assert(/^[\x20-\x7e]*$/.test(built.fields.pp_Description), "the description is plain ASCII so the hash is unambiguous");
assert(built.url.startsWith("https://sandbox.jazzcash.com.pk/"), "sandbox credentials post to the sandbox");
const emptyChanged = { ...built.fields, ppmpf_1: "" };
assert(jc.signFields(emptyChanged, cfg.salt) === built.fields.pp_SecureHash, "empty fields do not change the hash");

section("Checking what comes back");
const signed = (over: Record<string, string> = {}, salt = cfg.salt) => {
  const f: Record<string, string> = { pp_Amount: "150000", pp_TxnRefNo: "T1", pp_ResponseCode: "000", pp_ResponseMessage: "Thank you", pp_MerchantID: "MC00000", ...over };
  f.pp_SecureHash = referenceHash(f, salt);
  return f;
};
const good = jc.verifyReturn(cfg, signed());
assert(good.ok && good.success && good.txnRef === "T1" && good.amountMinor === 150000, "a correctly signed success result is accepted");
assert(!jc.verifyReturn(cfg, signed({}, "some-other-salt")).ok, "a result signed with the wrong salt is refused");
const tampered = signed(); tampered.pp_Amount = "100";
assert(!jc.verifyReturn(cfg, tampered).ok, "changing the amount after signing is detected");
const tamperedCode = signed({ pp_ResponseCode: "124" }); tamperedCode.pp_ResponseCode = "000";
assert(!jc.verifyReturn(cfg, tamperedCode).ok, "changing the response code after signing is detected");
const noHash = signed(); delete noHash.pp_SecureHash;
assert(!jc.verifyReturn(cfg, noHash).ok, "a result with no signature is refused");
const lower = signed(); lower.pp_SecureHash = lower.pp_SecureHash.toLowerCase();
assert(jc.verifyReturn(cfg, lower).ok, "hex case does not matter");
const declined = jc.verifyReturn(cfg, signed({ pp_ResponseCode: "157", pp_ResponseMessage: "Declined" }));
assert(declined.ok && !declined.success, "a signed decline is valid but not a success");
const unknown = jc.verifyReturn(cfg, signed({ pp_ResponseCode: "" }));
assert(unknown.ok && !unknown.success, "a missing response code is never a success");
assert(jc.verifyReturn({ ...cfg, successCodes: ["000", "121"] }, signed({ pp_ResponseCode: "121" })).ok, "success codes can be extended without a code change");

section("Unlocking a report, against the database");
const db = getDb();
const owner = { id: randomUUID(), email: "owner@example.com", role: "base" } as never;
const other = { id: randomUUID(), email: "other@example.com", role: "base" } as never;
const mkAudit = async (userId: string, status = "completed") => {
  const [row] = await db.insert(profileAudits).values({ userId, userEmail: "x@example.com", profileKey: randomUUID(), contentHash: randomUUID(), status, reportJson: JSON.stringify(sampleAuditReport) }).returning({ id: profileAudits.id });
  return row.id;
};
const auditA = await mkAudit((owner as { id: string }).id);
const auditB = await mkAudit((owner as { id: string }).id);
const freeEntitlement = entitlementFor({ role: "base", auditEntitlement: "free", auditCredits: 0, auditCreditsUsed: 0 });

const locked = async (auditId: string) => applyAuditAccess(sampleAuditReport, await pay.entitlementForAudit(freeEntitlement, auditId)).access.locked;
assert(await locked(auditA) === true, "an unpaid report is locked for a free account");

try { await pay.createOrder(other, auditA, "manual"); assert(false, "another user can open an order for my report"); }
catch (error) { assert((error as { code?: string }).code === "NOT_FOUND", "another user cannot create an order for my report (same answer as a missing report)"); }
const reserved = await mkAudit((owner as { id: string }).id, "reserved");
try { await pay.createOrder(owner, reserved, "manual"); assert(false, "an unfinished audit can be bought"); }
catch (error) { assert((error as { code?: string }).code === "NOT_READY", "an audit that has not finished cannot be bought"); }
try { await pay.createOrder(owner, auditA, "manual", { ...opts, manual: null }); assert(false, "manual order with manual off"); }
catch (error) { assert((error as { code?: string }).code === "DISABLED", "an order for a payment method that is switched off is refused"); }

const manual1 = await pay.createOrder(owner, auditA, "manual");
const manual2 = await pay.createOrder(owner, auditA, "manual");
assert(manual1.id === manual2.id && manual1.amountMinor === 150000, "pressing the manual button twice reuses one order, priced by the server");
assert(await locked(auditA) === true, "opening a manual order unlocks nothing");

assert(await pay.claimManualPayment(other, manual1.id, "hi") === null, "another user cannot say they paid my order");
const claimed = await pay.claimManualPayment(owner, manual1.id, "  sent from   0300 1234567 ");
assert(claimed?.status === "awaiting_review" && claimed.payerNote === "sent from 0300 1234567", "'I've paid' moves it to review with a tidy note");
assert(await locked(auditA) === true, "saying 'I have paid' still unlocks nothing");

const first = await pay.markOrderPaid({ id: manual1.id }, "admin@improvexus.com", "manual", "Confirmed by an admin");
assert(first.result === "paid" && await locked(auditA) === false, "an admin marking it paid unlocks that report");
assert(await locked(auditB) === true, "…and only that report: the same owner's other report stays locked");
const ent = await pay.entitlementForAudit(freeEntitlement, auditA);
assert(ent.canDownload && ent.canOptimize && ent.unlockedByPayment, "a paid report can download and shows the optimization section");
assert((await pay.markOrderPaid({ id: manual1.id }, "admin@improvexus.com")).result === "already_paid", "marking an already-paid order again is harmless");
try { await pay.createOrder(owner, auditA, "manual"); assert(false, "buying a paid report again"); }
catch (error) { assert((error as { code?: string }).code === "ALREADY_PAID", "an already-unlocked report cannot be bought twice"); }

section("Races and duplicates");
const raceOrder = await pay.createOrder(owner, auditB, "jazzcash");
const racers = await Promise.all([1, 2, 3, 4].map(() => pay.markOrderPaid({ txnRef: raceOrder.txnRef }, "jazzcash", "000", "ok")));
const results = racers.map(r => r.result);
assert(results.filter(r => r === "paid").length === 1 && results.every(r => r === "paid" || r === "already_paid"), "four confirmations at the same instant produce exactly one 'paid'");
const rows = await db.select().from(paymentOrders).where(eq(paymentOrders.auditId, auditB));
assert(rows.filter(r => r.status === "paid").length === 1, "and exactly one paid row for the report");
const dup = (await db.insert(paymentOrders).values({ userId: (owner as { id: string }).id, userEmail: "o@x.com", auditId: auditB, amountMinor: 150000, gateway: "manual", status: "pending", txnRef: `DUP${randomUUID().slice(0, 8)}` }).returning())[0];
assert((await pay.markOrderPaid({ id: dup.id }, "admin")).result === "report_already_unlocked", "a second paid order for a report is turned away by the database, not by luck");
assert(new Set([pay.newTxnRef(), pay.newTxnRef(), pay.newTxnRef()]).size === 3 && pay.newTxnRef().length <= 20, "references are unique and short enough for the gateway");

section("The JazzCash return, end to end");
const auditC = await mkAudit((owner as { id: string }).id);
const auditD = await mkAudit((owner as { id: string }).id);
const auditE = await mkAudit((owner as { id: string }).id);
const orderC = await pay.createOrder(owner, auditC, "jazzcash");
const orderD = await pay.createOrder(owner, auditD, "jazzcash");
const orderE = await pay.createOrder(owner, auditE, "jazzcash");
const post = async (fields: Record<string, string>) => route.POST(new Request("https://www.improvexus.test/api/payments/jazzcash/return", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", host: "www.improvexus.test" }, body: new URLSearchParams(fields) }));
const reply = (over: Record<string, string>, order: { txnRef: string; amountMinor: number }) => signed({ pp_TxnRefNo: order.txnRef, pp_Amount: String(order.amountMinor), ...over });
const where = (r: Response) => r.headers.get("location") ?? "";

let r = await post(reply({}, orderC));
assert(r.status === 303 && where(r).endsWith(`/audits?openAudit=${auditC}&payment=success`), "a good result sends the customer back to their report");
assert(await locked(auditC) === false, "…and the report is unlocked");

const forged = reply({}, orderD); forged.pp_SecureHash = "A".repeat(64);
r = await post(forged);
assert(where(r).includes("payment=invalid") && await locked(auditD) === true, "a forged result (bad signature) unlocks nothing");

r = await post(reply({ pp_Amount: "100" }, { txnRef: orderD.txnRef, amountMinor: 100 }));
assert(where(r).includes("payment=invalid") && await locked(auditD) === true, "a genuinely signed result for the WRONG amount unlocks nothing");

r = await post(signed({ pp_TxnRefNo: "T-NO-SUCH-ORDER" }));
assert(where(r).includes("payment=invalid"), "a signed result for an order we never created is rejected");

r = await post(reply({ pp_ResponseCode: "157", pp_ResponseMessage: "Declined by bank" }, orderD));
const [afterDecline] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderD.id));
assert(where(r).includes("payment=failed") && afterDecline.status === "failed" && afterDecline.gatewayCode === "157" && await locked(auditD) === true, "a decline is recorded as failed and unlocks nothing");

r = await post(reply({ pp_ResponseCode: "" }, orderE));
assert(await locked(auditE) === true, "a signed result with no response code unlocks nothing");

r = await post(reply({}, orderC));
const cRows = await db.select().from(paymentOrders).where(eq(paymentOrders.auditId, auditC));
assert(where(r).includes("payment=success") && cRows.filter(x => x.status === "paid").length === 1, "the customer pressing Back and the result arriving twice is harmless");

r = await post(reply({}, orderC)); await db.update(paymentOrders).set({ status: "paid" }).where(eq(paymentOrders.id, orderC.id));
const lateFail = await post(reply({ pp_ResponseCode: "157" }, orderC));
const [stillPaid] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderC.id));
assert(stillPaid.status === "paid" && await locked(auditC) === false, "a late 'declined' message can never take a paid report away");
void lateFail;

section("When the payments table is not there");
await db.execute(sql`alter table payment_orders rename to payment_orders_hidden`);
const whileMissing = await pay.isAuditPaid(auditA);
const stillOpens = applyAuditAccess(sampleAuditReport, await pay.entitlementForAudit(freeEntitlement, auditA));
await db.execute(sql`alter table payment_orders_hidden rename to payment_orders`);
assert(whileMissing === false && stillOpens.access.locked === true, "a missing table fails CLOSED (locked) and does not throw, so reports still open");
assert(await pay.isAuditPaid(auditA) === true, "and everything is back as soon as the table is");

// Clean up what this run created.
for (const id of [auditA, auditB, auditC, auditD, auditE, reserved]) {
  await db.delete(paymentOrders).where(eq(paymentOrders.auditId, id));
  await db.delete(profileAudits).where(eq(profileAudits.id, id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
