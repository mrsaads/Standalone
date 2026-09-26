import { requireAdminPage } from "@/lib/admin-guard";
import { AdminShell } from "./admin-shell";
import { AdminOverviewTiles } from "./overview";

export const dynamic = "force-dynamic";

// The admin overview.
//
// This page used to be the entire admin panel: one component 8,400 pixels tall that loaded the user
// table, every audit, every enquiry, every announcement and the Drive status on every visit. It is
// now five aggregate numbers and five tiles, and each area loads its own rows only when opened.
//
// Everything here is one round trip (lib/admin-stats.ts) and carries no personal data at all — the
// overview is counts, never rows, so the first screen of the admin panel does not put anybody's
// email address on screen before an admin has asked to see it.
export default async function AdminPage() {
  const { user, overview, navCounts } = await requireAdminPage();

  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Admin"
      description="Five areas. The number on a tile is what is waiting for you in it — if a tile is quiet, there is nothing to do there."
    >
      <AdminOverviewTiles overview={overview} />
    </AdminShell>
  );
}
