import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getShellNav } from "@/lib/shell-data";
import { countUnread, listNotifications } from "@/lib/notifications";
import { AppShell, PageHead } from "../app-shell";
import { NotificationList } from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { nav } = await getShellNav(user);
  const [rows, unread] = await Promise.all([listNotifications(user.id), countUnread(user.id)]);

  return (
    <AppShell nav={nav}>
      <PageHead
        title="Notifications"
        description="Everything Improvexus has told you about, newest first."
      />
      <NotificationList
        initialUnread={unread}
        initial={rows.map(row => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          link: row.link,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </AppShell>
  );
}
