import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { getConnectUrl } from "@/lib/drive";

// Must match the cookie name read in app/api/admin/drive/callback/route.ts — kept as a plain
// literal in both files rather than a shared export, since a route.ts file may only export HTTP
// method handlers and Next's own route config fields.
const STATE_COOKIE = "ix_drive_oauth_state";

// Admin-only "Connect Google Drive" action. Generates the Google consent-screen URL and stashes a
// random state value in a short-lived cookie so the callback can confirm the redirect really came
// from the request this admin just made (standard OAuth CSRF protection), before redirecting the
// admin's browser to Google.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });

  try {
    const state = randomBytes(24).toString("hex");
    const url = getConnectUrl(state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Drive is not configured." }, { status: 503 });
  }
}
