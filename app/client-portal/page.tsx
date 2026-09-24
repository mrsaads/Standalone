import { redirect } from "next/navigation";

// The client portal moved to /portal in the managed-clients redesign (lib/workspace-access.ts is
// now the single access check). Kept as a redirect so old links don't 404.
export default function LegacyClientPortalRedirect() {
  redirect("/portal");
}
