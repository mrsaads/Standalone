import { createHmac, timingSafeEqual } from "node:crypto";

// JazzCash "Hosted Checkout" (page redirection). The customer's browser is sent to JazzCash with a
// signed form; JazzCash takes the payment (wallet, card or voucher) and sends the browser back to
// our return URL with a signed result. Nothing here touches a card number: JazzCash's page does.
//
// Pure functions only, no database and no network, so the signing and the checking of a returned
// result can be tested without a JazzCash account.
//
// SECURITY MODEL, in one paragraph. The return request comes from the customer's browser, so
// anybody can send one. The ONLY thing that makes it believable is `pp_SecureHash`, an HMAC-SHA256
// over the fields, keyed with the Integrity Salt that only JazzCash and we know. verifyReturn()
// therefore runs before anything else, a result without a valid hash is discarded, and a valid one
// is still checked against the order we created (amount and reference) before a report is unlocked.
// A missing or unrecognised response code never unlocks anything.
//
// Hash rule, as documented by JazzCash and implemented by their open-source integrations: take every
// field whose name starts with "pp" and whose value is not empty, except pp_SecureHash itself; sort
// by field name; join the VALUES with "&"; put the Integrity Salt and "&" in front; HMAC-SHA256 with
// the salt as the key; upper-case hex. Text is hashed as ISO-8859-1, so only plain ASCII is sent.

export type JazzCashConfig = {
  merchantId: string;
  password: string;
  salt: string;
  checkoutUrl: string;
  environment: "sandbox" | "production";
  bankId: string;
  productId: string;
  successCodes: string[];
};

const SANDBOX_URL = "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
const PRODUCTION_URL = "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

/** Null unless all three secrets are set, so a half-configured server never shows a broken button.
 * Defaults to the SANDBOX: going live is a deliberate act (JAZZCASH_ENV=production). */
export function jazzcashConfig(env: NodeJS.ProcessEnv = process.env): JazzCashConfig | null {
  const merchantId = (env.JAZZCASH_MERCHANT_ID || "").trim();
  const password = (env.JAZZCASH_PASSWORD || "").trim();
  const salt = (env.JAZZCASH_INTEGRITY_SALT || "").trim();
  if (!merchantId || !password || !salt) return null;
  const environment = env.JAZZCASH_ENV === "production" ? "production" : "sandbox";
  return {
    merchantId, password, salt, environment,
    checkoutUrl: (env.JAZZCASH_CHECKOUT_URL || "").trim() || (environment === "production" ? PRODUCTION_URL : SANDBOX_URL),
    bankId: (env.JAZZCASH_BANK_ID || "TBANK").trim(),
    productId: (env.JAZZCASH_PRODUCT_ID || "RETL").trim(),
    // "000" is the documented success code for the hosted checkout return. Overridable without a
    // code change because the sandbox is where this gets confirmed.
    successCodes: (env.JAZZCASH_SUCCESS_CODES || "000").split(",").map(c => c.trim()).filter(Boolean),
  };
}

/** The secure hash over a set of form fields. */
export function signFields(fields: Record<string, string>, salt: string): string {
  const parts = Object.keys(fields)
    .filter(key => key.startsWith("pp") && key !== "pp_SecureHash" && String(fields[key] ?? "") !== "")
    .sort()
    .map(key => String(fields[key]));
  const message = [salt, ...parts].join("&");
  return createHmac("sha256", salt).update(Buffer.from(message, "latin1")).digest("hex").toUpperCase();
}

/** JazzCash wants Pakistan time (UTC+5, no daylight saving) as YYYYMMDDHHmmss. */
export function pktStamp(date: Date): string {
  const shifted = new Date(date.getTime() + 5 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}${p(shifted.getUTCMonth() + 1)}${p(shifted.getUTCDate())}${p(shifted.getUTCHours())}${p(shifted.getUTCMinutes())}${p(shifted.getUTCSeconds())}`;
}

export type CheckoutInput = { txnRef: string; amountMinor: number; billReference: string; description: string; returnUrl: string; now?: Date };

/** The signed form the browser posts to JazzCash. `fields` is everything including the hash. */
export function buildCheckout(cfg: JazzCashConfig, input: CheckoutInput): { url: string; fields: Record<string, string> } {
  const now = input.now ?? new Date();
  const fields: Record<string, string> = {
    pp_Version: "1.1",
    pp_TxnType: "",
    pp_Language: "EN",
    pp_MerchantID: cfg.merchantId,
    pp_SubMerchantID: "",
    pp_Password: cfg.password,
    pp_BankID: cfg.bankId,
    pp_ProductID: cfg.productId,
    pp_TxnRefNo: input.txnRef,
    pp_Amount: String(input.amountMinor),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: pktStamp(now),
    // Letters and digits only, as JazzCash requires.
    pp_BillReference: input.billReference.replace(/[^A-Za-z0-9]/g, "").slice(0, 20),
    pp_Description: input.description.replace(/[^\x20-\x7e]/g, "").slice(0, 100),
    pp_TxnExpiryDateTime: pktStamp(new Date(now.getTime() + 24 * 3600 * 1000)),
    pp_ReturnURL: input.returnUrl,
    ppmpf_1: "", ppmpf_2: "", ppmpf_3: "", ppmpf_4: "", ppmpf_5: "",
  };
  fields.pp_SecureHash = signFields(fields, cfg.salt);
  return { url: cfg.checkoutUrl, fields };
}

export type ReturnCheck =
  | { ok: false; reason: "bad_hash" | "missing_fields" }
  | { ok: true; txnRef: string; amountMinor: number; code: string; message: string; success: boolean };

/** Checks a result posted back by JazzCash. Order matters: hash first, then meaning. */
export function verifyReturn(cfg: JazzCashConfig, posted: Record<string, string>): ReturnCheck {
  const received = String(posted.pp_SecureHash ?? "").trim().toUpperCase();
  if (!received) return { ok: false, reason: "bad_hash" };
  const expected = signFields(posted, cfg.salt);
  const a = Buffer.from(received); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_hash" };

  const txnRef = String(posted.pp_TxnRefNo ?? "").trim();
  const amountMinor = Number(posted.pp_Amount);
  if (!txnRef || !Number.isInteger(amountMinor) || amountMinor <= 0) return { ok: false, reason: "missing_fields" };
  const code = String(posted.pp_ResponseCode ?? "").trim();
  return {
    ok: true, txnRef, amountMinor, code,
    message: String(posted.pp_ResponseMessage ?? "").trim().slice(0, 300),
    success: cfg.successCodes.includes(code),
  };
}
