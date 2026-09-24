import { isTrustedOrigin } from "@/lib/http";
import {
  browserBucketKey,
  browserQuota,
  consume,
  emailBuckets,
  lockedMessage,
  requestIdentity,
  type BrowserQuota,
  type Bucket,
  type RequestIdentity,
} from "./email-throttle";

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const authJson = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...extra } });

export type EmailGuard =
  | { ok: false; response: Response }
  | { ok: true; buckets: Bucket[]; identity: RequestIdentity & { browserId: string }; quotaAfter: () => Promise<BrowserQuota> };

/**
 * The single gate every "this will send an auth email" route passes through: same-origin check,
 * valid browser cookie, then one atomic hit against the browser / network / recipient buckets.
 * On a lock it returns a ready 429 carrying the countdown the page displays.
 */
export async function guardAuthEmail(request: Request, recipientEmail: string): Promise<EmailGuard> {
  if (!isTrustedOrigin(request)) return { ok: false, response: authJson({ error: "Please use this form on the Improvexus website." }, 403) };

  const identity = await requestIdentity();
  if (!identity.browserId) {
    // Every page load sets the browser cookie (middleware.ts); a request without it is either a
    // script or a browser with cookies disabled. Either way, no email.
    return { ok: false, response: authJson({ error: "Your browser session could not be verified. Enable cookies and reload the page, then try again." }, 400) };
  }
  const withBrowser = identity as RequestIdentity & { browserId: string };

  let buckets: Bucket[];
  let result;
  try {
    buckets = await emailBuckets(withBrowser, recipientEmail);
    result = await consume(buckets);
  } catch (error) {
    // Fail closed: if we cannot count, we do not send.
    console.error("Auth email throttle unavailable", error instanceof Error ? error.message : "UnknownError");
    return { ok: false, response: authJson({ error: "Email sending is temporarily unavailable. Please try again in a few minutes." }, 503) };
  }

  const quotaAfter = () => browserQuota(browserBucketKey(withBrowser.browserId));
  if (!result.ok) {
    const quota = await quotaAfter().catch(() => null);
    return {
      ok: false,
      response: authJson(
        { error: lockedMessage(result, "email"), code: "EMAIL_LIMIT", reason: result.reason, retryAfterSeconds: result.retryAfterSeconds, lockedUntil: result.lockedUntil, quota },
        429,
        { "Retry-After": String(result.retryAfterSeconds) },
      ),
    };
  }
  return { ok: true, buckets, identity: withBrowser, quotaAfter };
}

export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
