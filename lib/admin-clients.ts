import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clientWorkspaces,
  profiles,
  reportMetrics,
  weeklyReports,
  workspaceMembers,
  workspaceProfiles,
} from "@/db/schema";
import { createNotifications } from "./notifications";

// The admin side of the managed-client portal: creating a client, granting and revoking access,
// adding managed profiles, and writing and publishing weekly reports.
//
// This is the ONLY way a managed-client assignment comes into existence. There is no checkout, no
// self-service path, and no derivation from an audit entitlement — see the three-axis note in
// db/schema.ts. Everything the client then sees is authorized independently by
// lib/workspace-access.ts, which this file deliberately does not import: the reader and the writer
// share no code, so a mistake here cannot loosen the reader's rules.

export {
  WORKSPACE_STATUSES, PROFILE_STATUSES, REPORT_STATUSES, REPORT_TEXT_FIELDS,
} from "./admin-clients-shared";
export type {
  AdminWorkspaceRow, AdminMemberRow, AdminWorkspaceProfileRow, AdminReportRow, ReportTextKey,
} from "./admin-clients-shared";

import type {
  AdminMemberRow, AdminReportRow, AdminWorkspaceProfileRow, AdminWorkspaceRow,
} from "./admin-clients-shared";

// ------------------------------------------------------------------------------------------------
// READ
// ------------------------------------------------------------------------------------------------

export async function listWorkspacesForAdmin(): Promise<AdminWorkspaceRow[]> {
  const db = getDb();

  const workspaces = await db.select().from(clientWorkspaces).orderBy(desc(clientWorkspaces.createdAt)).limit(200);
  if (workspaces.length === 0) return [];
  const ids = workspaces.map(w => w.id);

  // Three flat reads stitched in memory rather than one joined query: a join across members,
  // profiles and reports multiplies rows and then has to be de-duplicated, which is where
  // "this client has 9 members" bugs come from.
  const [memberRows, profileRows, reportRows] = await Promise.all([
    db.select().from(workspaceMembers).where(inArray(workspaceMembers.workspaceId, ids)).orderBy(asc(workspaceMembers.userEmail)),
    db.select().from(workspaceProfiles).where(inArray(workspaceProfiles.workspaceId, ids)).orderBy(asc(workspaceProfiles.sortOrder), asc(workspaceProfiles.name)),
    db.select({
      id: weeklyReports.id,
      workspaceId: weeklyReports.workspaceId,
      workspaceProfileId: weeklyReports.workspaceProfileId,
      periodStart: weeklyReports.periodStart,
      periodEnd: weeklyReports.periodEnd,
      status: weeklyReports.status,
      title: weeklyReports.title,
      publishedAt: weeklyReports.publishedAt,
      publishedByEmail: weeklyReports.publishedByEmail,
      createdAt: weeklyReports.createdAt,
      // How many metrics have been entered. Shown so an admin can see at a glance that a report is
      // about to be published with no numbers in it — a metric nobody entered renders as
      // "Not provided" to the client, never as 0 (see lib/report-metrics.ts).
      metricCount: sql<number>`(select count(*)::int from report_metrics rm where rm.report_id = "weekly_reports"."id" and rm.value is not null)`,
    }).from(weeklyReports).where(inArray(weeklyReports.workspaceId, ids)).orderBy(desc(weeklyReports.periodEnd)),
  ]);

  const members = new Map<string, AdminMemberRow[]>();
  for (const row of memberRows) {
    const list = members.get(row.workspaceId) ?? [];
    list.push({
      id: row.id, userEmail: row.userEmail, status: row.status, grantedByEmail: row.grantedByEmail,
      grantedAt: row.grantedAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null,
    });
    members.set(row.workspaceId, list);
  }

  const wsProfiles = new Map<string, AdminWorkspaceProfileRow[]>();
  for (const row of profileRows) {
    const list = wsProfiles.get(row.workspaceId) ?? [];
    list.push({ id: row.id, name: row.name, upworkUrl: row.upworkUrl, status: row.status, sortOrder: row.sortOrder });
    wsProfiles.set(row.workspaceId, list);
  }

  const reports = new Map<string, AdminReportRow[]>();
  for (const row of reportRows) {
    const list = reports.get(row.workspaceId) ?? [];
    list.push({
      id: row.id, workspaceProfileId: row.workspaceProfileId, periodStart: row.periodStart,
      periodEnd: row.periodEnd, status: row.status, title: row.title,
      publishedAt: row.publishedAt?.toISOString() ?? null, publishedByEmail: row.publishedByEmail,
      metricCount: Number(row.metricCount ?? 0), createdAt: row.createdAt.toISOString(),
    });
    reports.set(row.workspaceId, list);
  }

  return workspaces.map(w => ({
    id: w.id, name: w.name, slug: w.slug, status: w.status,
    serviceStartDate: w.serviceStartDate ?? null, objectives: w.objectives,
    accountManager: w.accountManager, createdByEmail: w.createdByEmail,
    createdAt: w.createdAt.toISOString(),
    members: members.get(w.id) ?? [],
    profiles: wsProfiles.get(w.id) ?? [],
    reports: reports.get(w.id) ?? [],
  }));
}

// ------------------------------------------------------------------------------------------------
// WRITE
// ------------------------------------------------------------------------------------------------

export class AdminClientError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base) || "client";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const [clash] = await db.select({ id: clientWorkspaces.id }).from(clientWorkspaces).where(eq(clientWorkspaces.slug, candidate)).limit(1);
    if (!clash) return candidate;
  }
  throw new AdminClientError("Could not find a free identifier for this client — try a different name.", 409);
}

export async function createWorkspace(input: {
  name: string; serviceStartDate?: string | null; objectives?: string; accountManager?: string; createdByEmail: string;
}) {
  const db = getDb();
  const slug = await uniqueSlug(input.name);
  const [row] = await db.insert(clientWorkspaces).values({
    name: input.name.trim(),
    slug,
    status: "active",
    serviceStartDate: input.serviceStartDate || null,
    objectives: input.objectives ?? "",
    accountManager: input.accountManager ?? "",
    createdByEmail: input.createdByEmail,
  }).returning({ id: clientWorkspaces.id, slug: clientWorkspaces.slug });
  return row;
}

export async function updateWorkspace(id: string, patch: {
  name?: string; status?: string; serviceStartDate?: string | null; objectives?: string; accountManager?: string;
}) {
  const db = getDb();
  const [existing] = await db.select({ id: clientWorkspaces.id, name: clientWorkspaces.name }).from(clientWorkspaces).where(eq(clientWorkspaces.id, id)).limit(1);
  if (!existing) throw new AdminClientError("Client not found.", 404);
  await db.update(clientWorkspaces).set({ ...patch, updatedAt: new Date() }).where(eq(clientWorkspaces.id, id));
  return existing;
}

/**
 * Grants portal access.
 *
 * The email must belong to an account that exists AND has confirmed its email address. That check
 * is the whole point of this function: an assignment is stored against a verified `auth.users.id`,
 * never against a typed-in email string. Otherwise a typo ("buddy@gmial.com") would create a
 * membership that silently waits for somebody to register that address — and whoever eventually did
 * would inherit a stranger's client reports.
 *
 * Re-granting access to somebody previously revoked reactivates their existing row (the unique
 * index on (workspace, user) makes that the only possible outcome), so the history of who had access
 * when is never rewritten.
 */
export async function grantMember(workspaceId: string, email: string, grantedByEmail: string) {
  const db = getDb();
  const normalized = email.trim().toLowerCase();

  const [workspace] = await db.select({ id: clientWorkspaces.id, name: clientWorkspaces.name, slug: clientWorkspaces.slug })
    .from(clientWorkspaces).where(eq(clientWorkspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new AdminClientError("Client not found.", 404);

  const [account] = await db.select({
    id: profiles.id,
    email: profiles.email,
    // Read straight from Supabase's own auth table. "profiles"."id" is written in full and the inner
    // table is aliased — an unqualified interpolated column inside a subquery binds to the INNER
    // table and silently stops correlating, which is exactly what took /admin down once (see
    // app/admin/page.tsx).
    verified: sql<boolean>`exists (select 1 from auth.users au where au.id = "profiles"."id" and au.email_confirmed_at is not null)`,
  }).from(profiles).where(eq(sql`lower(${profiles.email})`, normalized)).limit(1);

  if (!account) {
    throw new AdminClientError(
      `No Improvexus account uses ${normalized}. They need to create an account and confirm their email first — access is granted to a verified account, never to a bare email address.`,
      404,
    );
  }
  if (!account.verified) {
    throw new AdminClientError(
      `${account.email} has an account but has not confirmed their email address yet. Ask them to click the link in their verification email, then grant access.`,
      409,
    );
  }

  const [existing] = await db.select({ id: workspaceMembers.id, status: workspaceMembers.status })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, account.id)))
    .limit(1);

  if (existing) {
    if (existing.status === "active") throw new AdminClientError(`${account.email} already has access to ${workspace.name}.`, 409);
    await db.update(workspaceMembers)
      .set({ status: "active", revokedAt: null, grantedByEmail, grantedAt: new Date() })
      .where(eq(workspaceMembers.id, existing.id));
  } else {
    await db.insert(workspaceMembers).values({
      workspaceId, userId: account.id, userEmail: account.email, status: "active", grantedByEmail,
    });
  }

  // Tell them. A person who has just been given access to something should not have to be told
  // out-of-band that it exists. dedupeKey is the workspace, so re-granting after a revoke does
  // notify again (a new grant is genuinely new news) only if the previous notification was for a
  // different workspace — the same workspace notifies once, which is the conservative choice.
  await createNotifications([{
    userId: account.id,
    kind: "managed_access_granted",
    title: `You now have access to the ${workspace.name} client portal`,
    body: "Your weekly management reports from the Improvexus team will appear here.",
    link: "/portal",
    dedupeKey: `workspace:${workspaceId}`,
  }]);

  return { userEmail: account.email, workspaceName: workspace.name };
}

export async function revokeMember(workspaceId: string, memberId: string) {
  const db = getDb();
  const [member] = await db.select({ id: workspaceMembers.id, userEmail: workspaceMembers.userEmail, status: workspaceMembers.status })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  if (!member) throw new AdminClientError("That member is not on this client.", 404);

  // Status + timestamp, never a delete: the record of who could see what, and until when, is part of
  // the audit trail and outlives the access itself.
  await db.update(workspaceMembers)
    .set({ status: "inactive", revokedAt: new Date() })
    .where(eq(workspaceMembers.id, memberId));
  return { userEmail: member.userEmail };
}

export async function addWorkspaceProfile(workspaceId: string, input: { name: string; upworkUrl?: string }) {
  const db = getDb();
  const [workspace] = await db.select({ id: clientWorkspaces.id }).from(clientWorkspaces).where(eq(clientWorkspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new AdminClientError("Client not found.", 404);

  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${workspaceProfiles.sortOrder}), -1) + 1` })
    .from(workspaceProfiles).where(eq(workspaceProfiles.workspaceId, workspaceId));

  const [row] = await db.insert(workspaceProfiles).values({
    workspaceId, name: input.name.trim(), upworkUrl: (input.upworkUrl ?? "").trim(), sortOrder: Number(next ?? 0),
  }).returning({ id: workspaceProfiles.id });
  return row;
}

export async function setWorkspaceProfileStatus(workspaceId: string, profileId: string, status: "active" | "archived") {
  const db = getDb();
  const [row] = await db.select({ id: workspaceProfiles.id, name: workspaceProfiles.name })
    .from(workspaceProfiles)
    .where(and(eq(workspaceProfiles.id, profileId), eq(workspaceProfiles.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new AdminClientError("That profile is not on this client.", 404);
  await db.update(workspaceProfiles).set({ status, updatedAt: new Date() }).where(eq(workspaceProfiles.id, profileId));
  return row;
}

export async function createReport(workspaceId: string, input: {
  workspaceProfileId: string; periodStart: string; periodEnd: string;
  title?: string; overview?: string; goals?: string; workCompleted?: string; nextActions?: string; clientActions?: string;
  createdByEmail: string;
}) {
  const db = getDb();
  const [profile] = await db.select({ id: workspaceProfiles.id })
    .from(workspaceProfiles)
    .where(and(eq(workspaceProfiles.id, input.workspaceProfileId), eq(workspaceProfiles.workspaceId, workspaceId)))
    .limit(1);
  if (!profile) throw new AdminClientError("That profile is not on this client.", 404);
  if (input.periodEnd < input.periodStart) throw new AdminClientError("The period end cannot be before the period start.", 400);

  // Always created as a draft. A client-facing query filters on status = 'published' in SQL, so an
  // unfinished report is not merely hidden in their UI — it is never selected for them at all.
  const [row] = await db.insert(weeklyReports).values({
    workspaceId,
    workspaceProfileId: input.workspaceProfileId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: "draft",
    title: input.title ?? "",
    overview: input.overview ?? "",
    goals: input.goals ?? "",
    workCompleted: input.workCompleted ?? "",
    nextActions: input.nextActions ?? "",
    clientActions: input.clientActions ?? "",
    createdByEmail: input.createdByEmail,
  }).onConflictDoNothing({
    target: [weeklyReports.workspaceProfileId, weeklyReports.periodStart, weeklyReports.periodEnd],
  }).returning({ id: weeklyReports.id });

  if (!row) throw new AdminClientError("A report already exists for that profile and that week — edit that one instead of creating a second.", 409);
  return row;
}

export async function updateReport(reportId: string, patch: {
  title?: string; overview?: string; goals?: string; workCompleted?: string; nextActions?: string; clientActions?: string;
}) {
  const db = getDb();
  const [report] = await db.select({ id: weeklyReports.id }).from(weeklyReports).where(eq(weeklyReports.id, reportId)).limit(1);
  if (!report) throw new AdminClientError("Report not found.", 404);
  await db.update(weeklyReports).set({ ...patch, updatedAt: new Date() }).where(eq(weeklyReports.id, reportId));
}

/**
 * Publishes a draft report and notifies every active member of that client.
 *
 * The notification is created once per (user, report) by the unique index behind
 * `createNotifications`, so publishing twice — or a retried request — cannot put two copies in
 * somebody's list. The count returned is the number of rows ACTUALLY inserted, so the admin panel
 * reports what happened rather than what was attempted.
 */
export async function publishReport(reportId: string, publishedByEmail: string) {
  const db = getDb();
  const [report] = await db.select({
    id: weeklyReports.id,
    workspaceId: weeklyReports.workspaceId,
    status: weeklyReports.status,
    title: weeklyReports.title,
    periodStart: weeklyReports.periodStart,
    periodEnd: weeklyReports.periodEnd,
  }).from(weeklyReports).where(eq(weeklyReports.id, reportId)).limit(1);
  if (!report) throw new AdminClientError("Report not found.", 404);

  const [workspace] = await db.select({ name: clientWorkspaces.name, status: clientWorkspaces.status })
    .from(clientWorkspaces).where(eq(clientWorkspaces.id, report.workspaceId)).limit(1);

  await db.update(weeklyReports)
    .set({ status: "published", publishedAt: new Date(), publishedByEmail, updatedAt: new Date() })
    .where(eq(weeklyReports.id, reportId));

  const members = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, report.workspaceId), eq(workspaceMembers.status, "active")));

  const label = report.title || `${report.periodStart} – ${report.periodEnd}`;
  const notified = await createNotifications(members.map(m => ({
    userId: m.userId,
    kind: "weekly_report_published" as const,
    title: `Your weekly report is ready: ${label}`,
    body: workspace ? `${workspace.name} · ${report.periodStart} to ${report.periodEnd}` : "",
    link: `/portal/reports/${reportId}`,
    dedupeKey: `report:${reportId}`,
  })));

  return {
    notified,
    activeMembers: members.length,
    // Stated plainly so the panel can warn rather than imply success: publishing a report for a
    // client with nobody assigned to it means nobody was told.
    workspaceSuspended: workspace?.status === "suspended",
  };
}

export async function unpublishReport(reportId: string) {
  const db = getDb();
  const [report] = await db.select({ id: weeklyReports.id }).from(weeklyReports).where(eq(weeklyReports.id, reportId)).limit(1);
  if (!report) throw new AdminClientError("Report not found.", 404);
  // Back to draft: the client-facing query stops selecting it immediately. The notification that
  // already went out is left alone — un-telling somebody is not a thing, and deleting the row would
  // just make their notification centre lie about its own history.
  await db.update(weeklyReports)
    .set({ status: "draft", publishedAt: null, publishedByEmail: "", updatedAt: new Date() })
    .where(eq(weeklyReports.id, reportId));
}

export async function setReportMetric(reportId: string, metricKey: string, value: number | null, note = "") {
  const db = getDb();
  const [report] = await db.select({ id: weeklyReports.id }).from(weeklyReports).where(eq(weeklyReports.id, reportId)).limit(1);
  if (!report) throw new AdminClientError("Report not found.", 404);
  // value === null is stored as NULL, deliberately. NULL renders as "Not provided" to the client; 0
  // is a real measurement ("no proposals sent this week"). Coalescing one into the other would
  // invent data — see the reportMetrics comment in db/schema.ts.
  await db.insert(reportMetrics).values({ reportId, metricKey, value, note })
    .onConflictDoUpdate({
      target: [reportMetrics.reportId, reportMetrics.metricKey],
      set: { value, note, updatedAt: new Date() },
    });
}

// Entered metric values for a set of reports, keyed by report then metric.
//
// A key that is absent and a key stored as NULL both mean "Not provided" — the editor shows an empty
// box for either, and saving an empty box writes NULL rather than 0. That distinction is preserved
// end to end on purpose; see lib/report-metrics.ts.
export async function loadMetricsForReports(reportIds: string[]): Promise<Record<string, Record<string, number | null>>> {
  if (reportIds.length === 0) return {};
  const db = getDb();
  const rows = await db.select({
    reportId: reportMetrics.reportId,
    metricKey: reportMetrics.metricKey,
    value: reportMetrics.value,
  }).from(reportMetrics).where(inArray(reportMetrics.reportId, reportIds));

  const out: Record<string, Record<string, number | null>> = {};
  for (const row of rows) {
    (out[row.reportId] ??= {})[row.metricKey] = row.value === null || row.value === undefined ? null : Number(row.value);
  }
  return out;
}
