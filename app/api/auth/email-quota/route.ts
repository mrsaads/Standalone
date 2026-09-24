import { authJson } from "@/lib/security/auth-guard";
import { browserBucketKey, browserQuota, emailRules, requestIdentity } from "@/lib/security/email-throttle";

// What the signup / verify / reset pages show: how many auth emails this browser has left, and —
// when it's locked — exactly when the lock ends, so the page can run a live countdown.
export async function GET() {
  const limit = emailRules().browser.limit;
  try {
    const identity = await requestIdentity();
    if (!identity.browserId) return authJson({ limit, used: 0, remaining: limit, lockedUntil: null, retryAfterSeconds: 0 });
    return authJson(await browserQuota(browserBucketKey(identity.browserId)));
  } catch {
    // Status display only; the real enforcement happens (and fails closed) on the send routes.
    return authJson({ limit, used: 0, remaining: limit, lockedUntil: null, retryAfterSeconds: 0, unavailable: true });
  }
}
