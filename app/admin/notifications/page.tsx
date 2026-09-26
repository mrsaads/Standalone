import { requireAdminPage } from "@/lib/admin-guard";
import { listAnnouncements } from "@/lib/announcements";
import { AdminShell } from "../admin-shell";
import { AnnouncementComposer } from "../announcement-composer";

export const dynamic = "force-dynamic";

// Notification management: compose, check the audience, send, and see what has already gone out.
export default async function AdminNotificationsPage() {
  const { user, navCounts } = await requireAdminPage();
  const announcements = await listAnnouncements();

  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Notifications"
      description="Messages you send into people's notification centres. In-app only — nothing here reaches anybody's email inbox."
    >
      <AnnouncementComposer initial={announcements} />
    </AdminShell>
  );
}
