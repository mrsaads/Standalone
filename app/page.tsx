import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveAuthorizedPath } from "@/lib/destination";
import { LandingPage } from "./landing-page";

// "/" is the public marketing page. An already-authenticated visitor should go straight to their
// authorized destination without seeing marketing content or logging in again — resolved here,
// server-side, the same way every other entry point resolves it (see lib/destination.ts), so it
// never depends on which page happened to send them here.
export default async function RootPage() {
  // The public landing page must stay visitable even if auth/DB configuration is broken or
  // incomplete (the one place that really can't 500 for an anonymous visitor) — so a failure here
  // is treated as "not signed in", never as a fatal error. Worst case, an actually-signed-in
  // visitor sees marketing content instead of an instant redirect; that's harmless.
  let user = null;
  try { user = await getCurrentUser(); } catch { user = null; }
  if (user) redirect(await resolveAuthorizedPath(user));
  return <LandingPage />;
}
