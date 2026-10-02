import { consume, requestIdentity, type Bucket } from "./email-throttle";

// Abuse limit for the public enquiry form.
//
// The form is the one write endpoint a signed-out stranger can reach. Before this, the only limit
// was "5 per email address per day" — which stops nothing, because a script simply changes the
// address on every request. Each accepted enquiry now also counts against the browser (signed
// cookie) and the network address, in the same Postgres table the auth-email limits use.
//
// Deliberately more forgiving than the auth limits, and it FAILS OPEN: if the counter itself cannot
// be reached, the enquiry is still accepted. Losing a real lead to protect against a hypothetical
// flood is the wrong trade for a contact form — the per-email cap and the honeypot still apply.

function num(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function leadRules() {
  const lock = num("LEAD_LOCK_MINUTES", 30);
  return {
    browser: { limit: num("LEAD_BROWSER_LIMIT", 5), windowMinutes: 60, lockMinutes: lock },
    // Generous: a whole office or a mobile carrier's customers can share one address.
    ip: { limit: num("LEAD_IP_LIMIT", 20), windowMinutes: 60, lockMinutes: lock },
  };
}

export type LeadGuard = { ok: true } | { ok: false; retryAfterSeconds: number; message: string };

export async function guardLead(): Promise<LeadGuard> {
  try {
    const identity = await requestIdentity();
    const rules = leadRules();
    const buckets: Bucket[] = [{ key: `lead:ip:${identity.ipHash}`, rule: rules.ip }];
    // No cookie (a script, or cookies disabled) is not refused outright — it is simply held to the
    // network limit alone, which a cookie-less client cannot reset by "clearing" anything.
    if (identity.browserId) buckets.push({ key: `lead:browser:${identity.browserId}`, rule: rules.browser });
    const result = await consume(buckets);
    if (result.ok) return { ok: true };
    const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
    return {
      ok: false,
      retryAfterSeconds: result.retryAfterSeconds,
      message: `Several enquiries have already been sent from ${result.reason === "browser" ? "this browser" : "your network"}. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"} — or reply to the message we send you about your first one.`,
    };
  } catch (error) {
    console.error("Lead throttle unavailable; accepting the enquiry.", error instanceof Error ? error.name : "UnknownError");
    return { ok: true };
  }
}
