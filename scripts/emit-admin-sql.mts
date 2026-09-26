// Prints the SQL Drizzle actually emits for the new admin queries.
//
// This exists because of a bug that took /admin down: Drizzle renders an interpolated column inside
// a sql`` fragment UNQUALIFIED, so inside a correlated subquery Postgres bound it to the INNER
// table and the correlation silently disappeared. The TypeScript was fine; only the emitted SQL was
// wrong, and only once a second row existed. So every new correlated subquery gets read here and
// then run against the live database before it is served to anybody.
//
// Uses drizzle's pg-core query builder with no connection — .toSQL() needs no database.
import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import postgres from "postgres";
import {
  announcements, clientWorkspaces, leads, managementEnquiries, profiles,
  reportMetrics, weeklyReports, workspaceMembers, workspaceProfiles,
} from "../db/schema";

// No connection is opened: postgres.js is lazy, and .toSQL() never touches the socket.
const db = drizzle(postgres("postgres://u:p@127.0.0.1:1/none", { prepare: false, max: 1 }));

const show = (label: string, q: { toSQL(): { sql: string; params: unknown[] } }) => {
  const { sql: text, params } = q.toSQL();
  console.log(`\n--- ${label} ---\n${text}\n    params: ${JSON.stringify(params)}`);
};

show("leads (admin inbox)", db.select({
  id: leads.id, email: leads.email, status: leads.status,
  hasAccount: sql<boolean>`("leads"."user_id" is not null)`,
}).from(leads).orderBy(desc(leads.createdAt)).limit(200));

show("management enquiries", db.select({
  id: managementEnquiries.id, userEmail: managementEnquiries.userEmail, status: managementEnquiries.status,
}).from(managementEnquiries).orderBy(desc(managementEnquiries.createdAt)).limit(200));

show("announcements + readCount", db.select({
  id: announcements.id, title: announcements.title, recipientCount: announcements.recipientCount,
  readCount: sql<number>`(select count(*)::int from notifications n where n.announcement_id = "announcements"."id" and n.read_at is not null)`,
}).from(announcements).orderBy(desc(announcements.createdAt)).limit(50));

show("weekly reports + metricCount", db.select({
  id: weeklyReports.id, status: weeklyReports.status,
  metricCount: sql<number>`(select count(*)::int from report_metrics rm where rm.report_id = "weekly_reports"."id" and rm.value is not null)`,
}).from(weeklyReports).where(inArray(weeklyReports.workspaceId, ["00000000-0000-0000-0000-000000000000"])).orderBy(desc(weeklyReports.periodEnd)));

show("grantMember: verified account lookup", db.select({
  id: profiles.id, email: profiles.email,
  verified: sql<boolean>`exists (select 1 from auth.users au where au.id = "profiles"."id" and au.email_confirmed_at is not null)`,
}).from(profiles).where(eq(sql`lower(${profiles.email})`, "someone@example.com")).limit(1));

show("audience: audit_users", db.select({ id: profiles.id, email: profiles.email, marketingOptIn: profiles.marketingOptIn })
  .from(profiles)
  .where(sql`exists (select 1 from profile_audits pa where pa.user_id = "profiles"."id" and pa.status = 'completed')`));

show("audience: managed_clients", db.selectDistinct({ id: profiles.id, email: profiles.email, marketingOptIn: profiles.marketingOptIn })
  .from(profiles)
  .innerJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.status, "active")))
  .innerJoin(clientWorkspaces, and(eq(clientWorkspaces.id, workspaceMembers.workspaceId), eq(clientWorkspaces.status, "active"))));

show("audience: selected (case-insensitive email match)", db.select({ id: profiles.id, email: profiles.email, marketingOptIn: profiles.marketingOptIn })
  .from(profiles).where(inArray(sql`lower(${profiles.email})`, ["a@b.com", "c@d.com"])));

show("next sortOrder for a new managed profile", db.select({ next: sql<number>`coalesce(max(${workspaceProfiles.sortOrder}), -1) + 1` })
  .from(workspaceProfiles).where(eq(workspaceProfiles.workspaceId, "00000000-0000-0000-0000-000000000000")));

show("metrics for reports", db.select({ reportId: reportMetrics.reportId, metricKey: reportMetrics.metricKey, value: reportMetrics.value })
  .from(reportMetrics).where(inArray(reportMetrics.reportId, ["00000000-0000-0000-0000-000000000000"])));

show("members by workspace", db.select().from(workspaceMembers)
  .where(inArray(workspaceMembers.workspaceId, ["00000000-0000-0000-0000-000000000000"])).orderBy(asc(workspaceMembers.userEmail)));

process.exit(0);
