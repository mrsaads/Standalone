import { z } from "zod";

const captureSchema = z.object({
  ok: z.literal(true),
  url: z.string().url(),
  capturedAt: z.string().datetime(),
  title: z.string().max(1000),
  heading: z.string().min(1).max(1000),
  text: z.string().min(200).max(40000),
  overview: z.string().min(80).max(5000),
  meta: z.array(z.object({ key: z.enum(["og:title", "og:description", "product:price:amount"]), value: z.string().max(2000) })).max(10),
});
export type BrowserCapture = z.infer<typeof captureSchema>;
export type BrowserCaptureResult = { ok: true; capture: BrowserCapture } | {
  ok: false; outcome: "blocked" | "unavailable" | "timeout" | "parse_failed" | "invalid"; message: string;
};
const unavailable = (): BrowserCaptureResult => ({ ok: false, outcome: "unavailable", message: "We couldn't open your profile right now. Please try again shortly." });

export function normalizeCaptureUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.upwork.com", "upwork.com"].includes(url.hostname) || url.port || url.username || url.password ||
        !/^\/(freelancers|fl)\/[^/]+\/?$/.test(url.pathname)) return null;
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`.replace("https://upwork.com/", "https://www.upwork.com/");
  } catch { return null; }
}

export async function fetchBrowserProfile(rawUrl: string): Promise<BrowserCaptureResult> {
  const target = normalizeCaptureUrl(rawUrl);
  if (!target) return { ok: false, outcome: "invalid", message: "Use a valid HTTPS Upwork freelancer profile link." };
  const endpoint = process.env.UPWORK_BROWSER_URL;
  const token = process.env.UPWORK_BROWSER_TOKEN;
  if (!endpoint || !token) return unavailable();
  try {
    const base = new URL(endpoint);
    if (base.username || base.password || base.search || base.hash ||
        (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) return unavailable();
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/capture`, {
      method: "POST", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: target }),
    });
    if (!response.ok) { await response.body?.cancel(); return unavailable(); }
    // Bound the worker response before parsing, including chunked bodies.
    const reader = response.body?.getReader();
    if (!reader) return unavailable();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 256000) { await reader.cancel(); return unavailable(); }
      chunks.push(part.value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    if (payload.ok !== true) {
      if (payload.outcome === "login_required" || payload.outcome === "blocked") return {
        ok: false, outcome: "blocked", message: "We couldn't access your profile right now. Our team needs to reconnect the profile reader. Please try again later.",
      };
      if (payload.outcome === "incomplete" || payload.outcome === "parse_failed") return {
        ok: false, outcome: "parse_failed", message: "We couldn't read the complete profile yet. Please try again later. No score was generated.",
      };
      if (payload.outcome === "timeout") return { ok: false, outcome: "timeout", message: "Your profile took too long to open. Please try again shortly." };
      return unavailable();
    }
    const parsed = captureSchema.safeParse(payload);
    if (!parsed.success || normalizeCaptureUrl(parsed.data.url) !== target) return {
      ok: false, outcome: "parse_failed", message: "We couldn't verify the profile content. Please try again later.",
    };
    return { ok: true, capture: parsed.data };
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError"
      ? { ok: false, outcome: "timeout", message: "Your profile took too long to open. Please try again shortly." }
      : unavailable();
  }
}

// Build only the evidence HTML needed by the existing deterministic parser. Signed-in page HTML
// may contain account data and must never cross the worker boundary.
export function captureHtml(capture: BrowserCapture): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<title>${escape(capture.title)}</title>${capture.meta.map(m => `<meta property="${m.key}" content="${escape(m.value)}">`).join("")}<main>${escape(capture.text)}</main>`;
}
