import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// The numbers behind the admin overview and the counts in the admin bar.
//
// One round trip, not fourteen. Every figure the overview shows is an aggregate, so they are all
// asked for in a single statement rather than as a query per tile — the overview is the page an
// admin opens most often and it should not cost a dozen sequential trips to a database in another
// region to render five tiles.
//
// Every count is computed in Postgres and returned as an int. Nothing here loads rows into Node to
// count them in JavaScript, which is how an admin page that was fine with 3 clients becomes slow
// with 300.

export type AdminOverview = {
  // Accounts
  users: number;
  admins: number;
  verifiedUsers: number;
  paidUsers: number;
  activeLast7Days: number;

  // Audits
  auditsTotal: number;
  auditsCompleted: number;
  auditsFailed: number;
  auditsStuck: number;
  audits7Days: number;

  // Managed clients
  workspaces: number;
  activeWorkspaces: number;
  suspendedWorkspaces: number;
  managedMembers: number;
  managedProfiles: number;
  reportsPublished: number;
  reportsDraft: number;

  // Inbound
  leadsTotal: number;
  leadsNew: number;
  managementTotal: number;
  managementNew: number;
  optimizationTotal: number;
  optimizationOpen: number;

  // Notifications
  announcementsSent: number;
  announcementRecipients: number;
  notificationsUnread: number;
  lastAnnouncementAt: string | null;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const db = getDb();

  // Written as one raw statement of scalar subqueries rather than a builder chain: each line is a
  // single independent aggregate, so the flat form is the readable one, and it is impossible to
  // accidentally multiply rows the way a chain of joins can.
  const rows = await db.execute<Record<string, number | string | null>>(sql`
    select
      (select count(*)::int from profiles)                                                as users,
      (select count(*)::int from profiles where role = 'admin')                           as admins,
      (select count(*)::int from profiles p
         where exists (select 1 from auth.users au
                        where au.id = p.id and au.email_confirmed_at is not null))        as verified_users,
      (select count(*)::int from profiles
         where audit_entitlement in ('subscribed', 'admin_granted'))                      as paid_users,
      (select count(*)::int from profiles where last_seen_at >= now() - interval '7 days') as active_last_7_days,

      (select count(*)::int from profile_audits)                                          as audits_total,
      (select count(*)::int from profile_audits where status = 'completed')               as audits_completed,
      (select count(*)::int from profile_audits where status = 'failed')                  as audits_failed,
      -- "reserved" for over an hour means an AI call that never came back, or a server that died
      -- mid-audit. Surfaced as its own number because it is the one audit state that needs a human.
      (select count(*)::int from profile_audits
         where status = 'reserved' and created_at < now() - interval '1 hour')            as audits_stuck,
      (select count(*)::int from profile_audits
         where status = 'completed' and created_at >= now() - interval '7 days')          as audits_7_days,

      (select count(*)::int from client_workspaces)                                       as workspaces,
      (select count(*)::int from client_workspaces where status = 'active')               as active_workspaces,
      (select count(*)::int from client_workspaces where status = 'suspended')            as suspended_workspaces,
      (select count(*)::int from workspace_members where status = 'active')               as managed_members,
      (select count(*)::int from workspace_profiles where status = 'active')              as managed_profiles,
      (select count(*)::int from weekly_reports where status = 'published')               as reports_published,
      (select count(*)::int from weekly_reports where status = 'draft')                   as reports_draft,

      (select count(*)::int from leads)                                                   as leads_total,
      (select count(*)::int from leads where status = 'new')                              as leads_new,
      (select count(*)::int from management_enquiries)                                    as management_total,
      (select count(*)::int from management_enquiries where status = 'new')               as management_new,
      (select count(*)::int from optimization_requests)                                   as optimization_total,
      (select count(*)::int from optimization_requests where status <> 'done')            as optimization_open,

      (select count(*)::int from announcements where status = 'sent')                     as announcements_sent,
      (select coalesce(sum(recipient_count), 0)::int from announcements
         where status = 'sent')                                                           as announcement_recipients,
      (select count(*)::int from notifications where read_at is null)                     as notifications_unread,
      (select max(sent_at)::text from announcements)                                      as last_announcement_at
  `);

  // db.execute returns the driver's own row shape; normalise it here so every caller gets numbers
  // rather than the strings Postgres sends for some aggregate types.
  const raw = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as Record<string, unknown> | undefined;
  const n = (key: string) => Number(raw?.[key] ?? 0) || 0;

  return {
    users: n("users"),
    admins: n("admins"),
    verifiedUsers: n("verified_users"),
    paidUsers: n("paid_users"),
    activeLast7Days: n("active_last_7_days"),

    auditsTotal: n("audits_total"),
    auditsCompleted: n("audits_completed"),
    auditsFailed: n("audits_failed"),
    auditsStuck: n("audits_stuck"),
    audits7Days: n("audits_7_days"),

    workspaces: n("workspaces"),
    activeWorkspaces: n("active_workspaces"),
    suspendedWorkspaces: n("suspended_workspaces"),
    managedMembers: n("managed_members"),
    managedProfiles: n("managed_profiles"),
    reportsPublished: n("reports_published"),
    reportsDraft: n("reports_draft"),

    leadsTotal: n("leads_total"),
    leadsNew: n("leads_new"),
    managementTotal: n("management_total"),
    managementNew: n("management_new"),
    optimizationTotal: n("optimization_total"),
    optimizationOpen: n("optimization_open"),

    announcementsSent: n("announcements_sent"),
    announcementRecipients: n("announcement_recipients"),
    notificationsUnread: n("notifications_unread"),
    lastAnnouncementAt: (raw?.last_announcement_at as string | null) ?? null,
  };
}

// The subset the admin bar needs. Derived from the same object so a count in the bar and the number
// on its tile can never disagree.
export function navCountsFrom(overview: AdminOverview) {
  return {
    enquiries: overview.leadsNew + overview.managementNew,
    optimization: overview.optimizationOpen,
    notifications: 0,
    clients: overview.activeWorkspaces,
  };
}
