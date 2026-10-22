import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getShellNav } from "@/lib/shell-data";
import { AppShell } from "../app-shell";
import { upworkMcpEnabled } from "@/lib/upwork-mcp-auth";
import { AuditWorkspace } from "./audit-workspace";

export const dynamic = "force-dynamic";

// The audit workspace, inside the same frame as every other signed-in screen.
//
// It did not used to be. /audits rendered its own header — its own wordmark, its own navigation, its
// own sign-out — and its own footer, so moving from the dashboard into an audit replaced every piece
// of chrome on the screen and dropped the notification count and the way back to the client portal.
// It was the one route where the product visibly stopped being one product.
//
// The workspace itself is unchanged below the frame, and the audit REPORT is deliberately untouched:
// the approved three-page template, its document preview and its PDF/Word exports are not part of
// this redesign.
export default async function AuditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { nav } = await getShellNav(user);

  return (
    <AppShell nav={nav}>
      <AuditWorkspace upworkConnect={upworkMcpEnabled()} />
    </AppShell>
  );
}
