import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { managementEnquiries, notifications, profileAudits, weeklyReports, workspaceProfiles } from "@/db/schema";
import type { AppUser } from "./auth";
import { listActiveWorkspaces } from "./workspace-access";
import type { ShellNav } from "@/app/app-shell";

// Server-side data for the application frame and the welcome dashboard.
//
// Everything here is read fresh on each request. Nothing about permissions is cached or carried in
// a cookie, so an assignment granted or revoked by an admin is reflected on the user's very next
// page load rather than at their next sign-in.

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function getShellNav(user: AppUser): Promise<{ nav: ShellNav; workspaces: Awaited<ReturnType<typeof listActiveWorkspaces>> }> {
  const [workspaces, unread] = await Promise.all([
    listActiveWorkspaces(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  return {
    nav: {
      email: user.email,
      isAdmin: user.role === "admin",
      // An admin always sees the portal item because they can open a client's workspace from the
      // admin side; a normal account sees it only when they genuinely have an assignment.
      showPortal: workspaces.length > 0 || user.role === "admin",
      unreadNotifications: unread,
    },
    workspaces,
  };
}

// The customer's own audit history and this week's usage. Filtered to `status = 'completed'` in
// SQL: a "reserved" row (AI call still in flight, no report behind it) or a "failed" row (allowance
// released) must never appear as a saved audit.
export async function getAuditSummary(userId: string) {
  const db = getDb();
  const [recent, usage] = await Promise.all([
    db.select({
      id: profileAudits.id,
      profileName: profileAudits.profileName,
      profileUrl: profileAudits.profileUrl,
      score: profileAudits.score,
      passCount: profileAudits.passCount,
      weakCount: profileAudits.weakCount,
      failCount: profileAudits.failCount,
      createdAt: profileAudits.createdAt,
    })
      .from(profileAudits)
      .where(and(eq(profileAudits.userId, userId), eq(profileAudits.status, "completed")))
      .orderBy(desc(profileAudits.createdAt))
      .limit(5),
    db.select({ count: sql<number>`count(*)::int` })
      .from(profileAudits)
      .where(and(
        eq(profileAudits.userId, userId),
        eq(profileAudits.billable, true),
        eq(profileAudits.status, "completed"),
        sql`${profileAudits.createdAt} >= now() - interval '7 days'`,
      )),
  ]);
  return { recent, auditsLast7Days: Number(usage[0]?.count ?? 0) };
}

// Whether this user already has a management enquiry open, so the dashboard can say "we have your
// request" instead of offering the same button again — and so it never implies the request granted
// anything.
export async function getOpenManagementEnquiry(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: managementEnquiries.id, status: managementEnquiries.status, createdAt: managementEnquiries.createdAt })
    .from(managementEnquiries)
    .where(eq(managementEnquiries.userId, userId))
    .orderBy(desc(managementEnquiries.createdAt))
    .limit(1);
  return row ?? null;
}

// The most recent PUBLISHED weekly report across every workspace this person is assigned to, so the
// dashboard can put their latest report one click away instead of making them go Home → Client
// portal → pick a profile → pick a report.
//
// `status = 'published'` is filtered in SQL, and the workspace list passed in has already been
// resolved from active memberships by listActiveWorkspaces — this function never takes a workspace
// id from a request.
export async function getLatestPublishedReport(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: weeklyReports.id,
      title: weeklyReports.title,
      periodStart: weeklyReports.periodStart,
      periodEnd: weeklyReports.periodEnd,
      publishedAt: weeklyReports.publishedAt,
      workspaceId: weeklyReports.workspaceId,
      clientActions: weeklyReports.clientActions,
      overview: weeklyReports.overview,
      profileName: workspaceProfiles.name,
    })
    .from(weeklyReports)
    .innerJoin(workspaceProfiles, eq(workspaceProfiles.id, weeklyReports.workspaceProfileId))
    .where(and(
      inArray(weeklyReports.workspaceId, workspaceIds),
      eq(weeklyReports.status, "published"),
    ))
    .orderBy(desc(weeklyReports.periodEnd))
    .limit(1);
  return row ?? null;
}

// The newest few notifications, for the dashboard's preview. The full list lives at /notifications;
// this is the "is there anything I have not seen" glance.
export async function getRecentNotifications(userId: string, limit = 3) {
  const db = getDb();
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
