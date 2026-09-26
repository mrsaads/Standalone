import { requireAdminPage } from "@/lib/admin-guard";
import { listLeadsForAdmin, listManagementEnquiriesForAdmin } from "@/lib/admin-inbox";
import { AdminShell } from "../admin-shell";
import { AdminInbox } from "../inbox-cards";

export const dynamic = "force-dynamic";

// Inbound enquiries.
//
// Its own area rather than a card buried halfway down a long page, because this is the one part of
// the admin panel where somebody outside the company is waiting for a reply — and because it is the
// part that was silently reading the wrong table for weeks. Given that history, it gets a front
// door.
export default async function AdminEnquiriesPage() {
  const { user, navCounts } = await requireAdminPage();
  const [leads, managementEnquiries] = await Promise.all([
    listLeadsForAdmin(),
    listManagementEnquiriesForAdmin(),
  ]);

  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Enquiries"
      description="Everything a person submitted and is waiting on. Nothing here grants access to anything — replying and enrolling someone are separate, deliberate steps."
    >
      <AdminInbox leads={leads} managementEnquiries={managementEnquiries} />
    </AdminShell>
  );
}
