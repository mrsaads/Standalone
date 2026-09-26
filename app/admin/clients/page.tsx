import { requireAdminPage } from "@/lib/admin-guard";
import { listWorkspacesForAdmin, loadMetricsForReports } from "@/lib/admin-clients";
import { AdminShell } from "../admin-shell";
import { ClientsAdmin } from "./clients-admin";

export const dynamic = "force-dynamic";

// Client-portal management. Authorized here, server-side, and independently re-authorized by every
// route the UI calls — a signed-in base account that navigates straight to this URL is bounced to
// "/", and even if it were not, none of the APIs behind this page would answer it.
export default async function AdminClientsPage() {
  const { user, navCounts } = await requireAdminPage();

  const workspaces = await listWorkspacesForAdmin();
  const metricsByReport = await loadMetricsForReports(workspaces.flatMap(w => w.reports.map(r => r.id)));

  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Client portals"
      description="Managed profile-management clients: who they are, who can see their portal, the Upwork profiles you run for them, and their weekly reports."
    >
      <ClientsAdmin workspaces={workspaces} metricsByReport={metricsByReport} />
    </AdminShell>
  );
}
