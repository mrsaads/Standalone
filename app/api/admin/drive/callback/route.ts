import { getCurrentUser } from "@/lib/auth";
import { completeConnection } from "@/lib/drive";
import { requestOrigin } from "@/lib/http";

// Must match the cookie name set in app/api/admin/drive/connect/route.ts.
const STATE_COOKIE = "ix_drive_oauth_state";

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  const match = header.split(/;\s*/).find(part => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Google redirects the admin's browser here after they grant (or deny) access. Exchanges the code
// for tokens, creates the "Improvexus Audits" root folder if needed, and stores the encrypted
// refresh token as the one owner connection — see lib/drive.ts's completeConnection().
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  // requestOrigin (the public Host header), not resolveAppOrigin: Google's redirect back here is a
  // plain navigation with no Origin header, so resolveAppOrigin fell through to RENDER_EXTERNAL_URL
  // (the onrender.com address) and sent an admin working on the custom domain to a domain where
  // they are not signed in. The result banner lives on /admin/accounts, where the Drive card is.
  const appOrigin = requestOrigin(request);
  const redirectTo = (path: string) => Response.redirect(`${appOrigin}/admin/accounts?drive=${path}`, 302);

  if (!user || user.role !== "admin") return redirectTo("forbidden");

  const error = url.searchParams.get("error");
  if (error) return redirectTo(`denied`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) return redirectTo("invalid_state");

  try {
    await completeConnection(code, user.email);
    return redirectTo("connected");
  } catch (err) {
    console.error("Google Drive connection failed", err instanceof Error ? err.message : "UnknownError");
    return redirectTo("failed");
  }
}
