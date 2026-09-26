// LOCAL-ONLY integration test for the three admin-panel features added in this pass:
//
//   1. The inbound queues that were previously written and never read (leads, management enquiries).
//   2. Admin announcements: broadcast to everyone, to a segment, or to one person by email.
//   3. Client-portal management: onboarding, access grants against VERIFIED accounts only,
//      managed profiles, and weekly report drafting/publishing.
//
// Runs against a real local Postgres, not a mock, because every property under test is a SQL-level
// property: which rows an audience resolves to, whether a unique index actually stops a duplicate
// notification, whether NULL survives a round trip instead of becoming 0. A mocked client would
// only prove the TypeScript branches are arranged as written.
//
// Every result here is a LOCAL result. It proves the logic is correct against real Postgres
// semantics — it does not prove anything has been exercised against the deployed app.
//
// Usage:
//   DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db npx tsx scripts/local-tests/admin-panel.local-test.mts
//
// Requires the same local stand-in `auth.users` table the other local tests need.
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  announcementDeliveries, announcements, clientWorkspaces, leads, managementEnquiries,
  notifications, profileAudits, profiles, reportMetrics, weeklyReports, workspaceMembers,
  workspaceProfiles,
} from "../../db/schema";
import { listLeadsForAdmin, listManagementEnquiriesForAdmin } from "../../lib/admin-inbox";
import { listAnnouncements, resolveAudience, safeActionUrl, sendAnnouncement } from "../../lib/announcements";
import {
  AdminClientError, addWorkspaceProfile, createReport, createWorkspace, grantMember,
  listWorkspacesForAdmin, loadMetricsForReports, publishReport, revokeMember, setReportMetric,
  setWorkspaceProfileStatus, unpublishReport, updateWorkspace,
} from "../../lib/admin-clients";
import { countUnread, listNotifications } from "../../lib/notifications";

let pass = 0;
let fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}
function section(title: string) { console.log(`\n${title}`); }

async function assertRefused(fn: () => Promise<unknown>, expect: RegExp, label: string) {
  try {
    await fn();
    fail++; console.error(`  ✗ FAIL: ${label} (it was ALLOWED)`);
  } catch (error) {
    if (error instanceof AdminClientError && expect.test(error.message)) {
      pass++; console.log(`  ✓ ${label} (refused ${error.status}: ${error.message.slice(0, 64)}…)`);
    } else {
      fail++; console.error(`  ✗ FAIL: ${label} — wrong error: ${error}`);
    }
  }
}

const db = getDb();
const run = randomUUID().slice(0, 8);

// Local stand-in for the two columns this code reads out of Supabase's own `auth.users`:
// `email_confirmed_at` (whether the person clicked the verification link) and `last_sign_in_at`.
// Supabase's real table has both; the minimal local fixture the earlier tests created has only
// `id`, so the columns are added here if they are missing. Additive and idempotent — it never
// touches the live database, which already has them.
async function ensureAuthUsersFixture() {
  await db.execute(sql`set client_min_messages to warning`);
  await db.execute(sql`create schema if not exists auth`);
  await db.execute(sql`create table if not exists auth.users (id uuid primary key)`);
  await db.execute(sql`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  await db.execute(sql`alter table auth.users add column if not exists last_sign_in_at timestamptz`);
}

async function makeAccount(opts: {
  label: string; verified?: boolean; entitlement?: "free" | "subscribed" | "admin_granted";
  marketingOptIn?: boolean; completedAudit?: boolean;
}) {
  const id = randomUUID();
  const email = `${opts.label}-${run}@example.com`;
  // `email_confirmed_at` is what grantMember insists on. An account row with a NULL there is a
  // person who registered and never clicked the link.
  await db.execute(sql`insert into auth.users (id, email_confirmed_at) values (${id}, ${opts.verified === false ? null : new Date().toISOString()})`);
  await db.insert(profiles).values({
    id, email,
    auditEntitlement: opts.entitlement ?? "free",
    marketingOptIn: opts.marketingOptIn ?? true,
  });
  if (opts.completedAudit) {
    await db.insert(profileAudits).values({
      userId: id, userEmail: email, status: "completed", profileName: "seed", billable: true,
      profileKey: `seed-${id}`, contentHash: `hash-${id}`,
    });
  }
  return { id, email };
}

async function main() {
  console.log(`Admin-panel integration test (run ${run})`);
  await ensureAuthUsersFixture();

  // ============================================================================================
  section("1. Inbound queues — the bug this pass fixes");
  // The landing form writes `leads`; the dashboard button writes `management_enquiries`. The admin
  // panel only ever read `optimization_requests`, which nothing on the public site writes. So a real
  // submission was stored and then invisible. These two readers are the missing half; the assertions
  // below are that a row written the way the public site writes it is actually returned.
  // ============================================================================================
  const landingLeadId = randomUUID();
  await db.insert(leads).values({
    id: landingLeadId, name: `Lead ${run}`, email: `lead-${run}@example.com`,
    profileLink: "https://www.upwork.com/freelancers/~seed", goals: "Get more invites",
    source: "landing_audit",
  });
  const accountHolder = await makeAccount({ label: "acct" });
  const portalRequestId = randomUUID();
  await db.insert(leads).values({
    id: portalRequestId, name: "Signed-in person", email: accountHolder.email,
    source: "client_portal_access_request", userId: accountHolder.id,
  });

  const leadRows = await listLeadsForAdmin();
  const anonLead = leadRows.find(r => r.id === landingLeadId);
  const linkedLead = leadRows.find(r => r.id === portalRequestId);
  assert(!!anonLead, "a landing-page enquiry is returned to the admin panel");
  assert(anonLead?.status === "new", "a new enquiry arrives with status 'new'");
  assert(anonLead?.source === "landing_audit", "the form it came from is preserved");
  assert(anonLead?.hasAccount === false, "an enquiry from a stranger reports hasAccount = false");
  // This is the correlated-subquery assertion. If ("leads"."user_id" is not null) were rendered
  // unqualified inside a subquery it would bind to the wrong table — the exact class of bug that
  // took /admin down with Postgres 21000.
  assert(linkedLead?.hasAccount === true, "an enquiry from a signed-in user reports hasAccount = true");

  const enquirer = await makeAccount({ label: "enq" });
  const mgmtId = randomUUID();
  await db.insert(managementEnquiries).values({
    id: mgmtId, userId: enquirer.id, userEmail: enquirer.email, message: "Please manage my profile",
  });
  const mgmtRows = await listManagementEnquiriesForAdmin();
  const mgmt = mgmtRows.find(r => r.id === mgmtId);
  assert(!!mgmt, "a management service request is returned to the admin panel");
  assert(mgmt?.message === "Please manage my profile", "the request's own message survives");
  // A "converted" enquiry must not have created any access. Checked directly, not inferred.
  await db.update(managementEnquiries).set({ status: "converted", handledByEmail: "admin@example.com" }).where(eq(managementEnquiries.id, mgmtId));
  const [{ count: membershipsAfterConvert }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers).where(eq(workspaceMembers.userId, enquirer.id));
  assert(Number(membershipsAfterConvert) === 0, "marking an enquiry 'converted' grants no portal access by itself");

  // ============================================================================================
  section("2. Announcements — audience resolution");
  // ============================================================================================
  const optedIn = await makeAccount({ label: "optin", marketingOptIn: true });
  const optedOut = await makeAccount({ label: "optout", marketingOptIn: false });
  const subscriber = await makeAccount({ label: "sub", entitlement: "subscribed" });
  const auditUser = await makeAccount({ label: "auditor", completedAudit: true });
  const unverified = await makeAccount({ label: "unverified", verified: false });

  const everyone = await resolveAudience("everyone");
  const everyoneEmails = new Set(everyone.map(r => r.email));
  assert(everyoneEmails.has(optedOut.email), "'everyone' includes a marketing opt-out (the filter is per-category, not per-audience)");
  assert(everyoneEmails.has(unverified.email), "'everyone' includes an unverified account — they still have a notification centre");

  const subs = await resolveAudience("subscribers");
  const subEmails = new Set(subs.map(r => r.email));
  assert(subEmails.has(subscriber.email), "'subscribers' includes a subscribed account");
  assert(!subEmails.has(optedIn.email), "'subscribers' excludes a free account");

  const auditors = await resolveAudience("audit_users");
  const auditorEmails = new Set(auditors.map(r => r.email));
  assert(auditorEmails.has(auditUser.email), "'audit users' includes someone with a COMPLETED audit");
  assert(!auditorEmails.has(subscriber.email), "'audit users' excludes an account that has never completed one");

  const selected = await resolveAudience("selected", [optedIn.email.toUpperCase(), "nobody-at-all@example.com"]);
  assert(selected.length === 1 && selected[0].email === optedIn.email, "'selected' matches an email case-insensitively and drops one that has no account");

  section("2b. Announcements — sending");
  const dry = await sendAnnouncement({
    title: "Dry run", body: "Nothing should be written.", audience: "selected",
    selectedEmails: [optedIn.email], category: "service", createdByEmail: "admin@example.com", dryRun: true,
  });
  // Scoped to THIS run's title rather than counting the whole table: the local database is reused
  // between runs, so a global count would be testing how many times this file has been run.
  const [{ count: announcementsAfterDry }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(announcements).where(sql`${announcements.title} like ${`%${run}%`} or ${announcements.title} = 'Dry run'`);
  assert(dry.recipientCount === 1, "a dry run reports the real recipient count");
  assert(dry.announcementId === "", "a dry run returns no announcement id, because it created none");
  assert(Number(announcementsAfterDry) === 0, "a dry run writes NOTHING — no announcement row is created");

  const sent = await sendAnnouncement({
    title: `Service notice ${run}`, body: "Your reports moved.", audience: "selected",
    selectedEmails: [optedIn.email, optedOut.email], category: "service",
    actionUrl: "/portal", actionLabel: "Open portal", createdByEmail: "admin@example.com",
  });
  assert(sent.recipientCount === 2, "a SERVICE notice reaches a marketing opt-out too (they cannot opt out of service messages)");
  assert(sent.notificationsCreated === 2, "both recipients got an in-app notification");
  assert(sent.suppressed === 0, "nothing is suppressed for a service notice");

  const optedOutInbox = await listNotifications(optedOut.id);
  assert(optedOutInbox.some(n => n.title === `Service notice ${run}` && n.link === "/portal"), "the notification lands in the recipient's own list, with its link");
  assert((await countUnread(optedOut.id)) >= 1, "it counts as unread, so the header badge shows it");

  const promo = await sendAnnouncement({
    title: `Promo ${run}`, body: "Half price.", audience: "selected",
    selectedEmails: [optedIn.email, optedOut.email], category: "promotional", createdByEmail: "admin@example.com",
  });
  assert(promo.recipientCount === 1, "a PROMOTIONAL announcement skips the marketing opt-out");
  assert(promo.suppressed === 1, "and reports the suppression rather than hiding it");
  const suppressedRow = await db.select().from(announcementDeliveries)
    .where(and(eq(announcementDeliveries.announcementId, promo.announcementId), eq(announcementDeliveries.userId, optedOut.id)));
  assert(suppressedRow[0]?.status === "suppressed" && suppressedRow[0]?.suppressionReason === "marketing_opt_out",
    "the skipped recipient is recorded WITH the reason, so 'why did they not get it' is answerable from the data");
  assert(!(await listNotifications(optedOut.id)).some(n => n.title === `Promo ${run}`), "and they genuinely did not receive it");

  const everyDelivery = await db.select({ channel: announcementDeliveries.channel }).from(announcementDeliveries);
  assert(everyDelivery.every(d => d.channel === "in_app"), "every delivery is channel 'in_app' — no email path was taken, so no customer inbox was touched");

  assert(safeActionUrl("https://evil.example/steal") === "", "an absolute action URL is refused, not stored");
  assert(safeActionUrl("//evil.example") === "", "a protocol-relative action URL is refused");
  assert(safeActionUrl("javascript:alert(1)") === "", "a javascript: action URL is refused");
  assert(safeActionUrl("/portal/reports") === "/portal/reports", "an app-relative path is kept");

  const listed = await listAnnouncements();
  const sentRow = listed.find(a => a.id === sent.announcementId);
  assert(sentRow?.status === "sent" && sentRow?.recipientCount === 2, "the announcement history shows it as sent with its audience size");
  assert(sentRow?.readCount === 0, "nobody has opened it yet (readCount correlates per announcement, not across all of them)");
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, optedIn.id), eq(notifications.announcementId, sent.announcementId)));
  const relisted = await listAnnouncements();
  assert(relisted.find(a => a.id === sent.announcementId)?.readCount === 1, "once one recipient reads it, readCount is 1 — and stays per-announcement");

  // ============================================================================================
  section("3. Client portal — onboarding and access");
  // ============================================================================================
  const ws = await createWorkspace({
    name: `Test Client ${run}`, accountManager: "AM", objectives: "More invites",
    serviceStartDate: "2026-09-01", createdByEmail: "admin@example.com",
  });
  assert(!!ws.id && ws.slug.startsWith("test-client-"), "a client is created with a URL-safe slug derived from its name");
  const twin = await createWorkspace({ name: `Test Client ${run}`, createdByEmail: "admin@example.com" });
  assert(twin.slug !== ws.slug, "a second client with the SAME name gets a different slug rather than colliding");

  const [freshMembers] = await db.select({ count: sql<number>`count(*)::int` }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id));
  assert(Number(freshMembers.count) === 0, "creating a client grants nobody access");

  await assertRefused(
    () => grantMember(ws.id, `ghost-${run}@example.com`, "admin@example.com"),
    /No Improvexus account uses/,
    "access cannot be granted to an email with no account",
  );
  await assertRefused(
    () => grantMember(ws.id, unverified.email, "admin@example.com"),
    /has not confirmed their email/,
    "access cannot be granted to an account that has not confirmed its email",
  );

  const client = await makeAccount({ label: "client" });
  const granted = await grantMember(ws.id, client.email.toUpperCase(), "admin@example.com");
  assert(granted.userEmail === client.email, "a grant matches the account case-insensitively and stores its real email");
  const [memberRow] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, client.id)));
  assert(memberRow.userId === client.id, "the membership is stored against the VERIFIED account id, not a typed-in string");
  assert(memberRow.status === "active", "and it is active");
  assert((await listNotifications(client.id)).some(n => n.kind === "managed_access_granted"), "the person is told in-app that they now have access");

  await assertRefused(
    () => grantMember(ws.id, client.email, "admin@example.com"),
    /already has access/,
    "granting twice is refused rather than creating a duplicate membership",
  );

  await revokeMember(ws.id, memberRow.id);
  const [revoked] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, memberRow.id));
  assert(revoked.status === "inactive" && revoked.revokedAt !== null, "revoking sets the row inactive and stamps when — it does not delete the history");

  await grantMember(ws.id, client.email, "admin@example.com");
  const [afterRegrant] = await db.select({ count: sql<number>`count(*)::int` }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, client.id)));
  assert(Number(afterRegrant.count) === 1, "re-granting reactivates the SAME row rather than stacking a second one");

  const managedAudience = await resolveAudience("managed_clients");
  assert(managedAudience.some(r => r.email === client.email), "an active member of an active client is in the 'managed clients' audience");
  await updateWorkspace(ws.id, { status: "suspended" });
  const suspendedAudience = await resolveAudience("managed_clients");
  assert(!suspendedAudience.some(r => r.email === client.email), "suspending the client removes them from that audience");
  await updateWorkspace(ws.id, { status: "active" });

  // ============================================================================================
  section("4. Client portal — profiles and weekly reports");
  // ============================================================================================
  const prof = await addWorkspaceProfile(ws.id, { name: "Main profile", upworkUrl: "https://www.upwork.com/freelancers/~x" });
  const prof2 = await addWorkspaceProfile(ws.id, { name: "Second profile" });
  const [p2] = await db.select().from(workspaceProfiles).where(eq(workspaceProfiles.id, prof2.id));
  assert(p2.sortOrder === 1, "a second managed profile is ordered after the first rather than both claiming 0");

  const otherWs = await createWorkspace({ name: `Other ${run}`, createdByEmail: "admin@example.com" });
  await assertRefused(
    () => setWorkspaceProfileStatus(otherWs.id, prof.id, "archived"),
    /not on this client/,
    "one client's profile cannot be touched through another client's endpoint",
  );

  const report = await createReport(ws.id, {
    workspaceProfileId: prof.id, periodStart: "2026-09-14", periodEnd: "2026-09-20",
    title: "Week 38", overview: "Steady", createdByEmail: "admin@example.com",
  });
  const [draft] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, report.id));
  assert(draft.status === "draft", "a new report is a DRAFT — a client-facing query filters on published, so it is not merely hidden");
  assert((await listNotifications(client.id)).filter(n => n.kind === "weekly_report_published").length === 0, "creating a draft notifies nobody");

  await assertRefused(
    () => createReport(ws.id, { workspaceProfileId: prof.id, periodStart: "2026-09-14", periodEnd: "2026-09-20", createdByEmail: "admin@example.com" }),
    /already exists for that profile and that week/,
    "a second report for the same profile and week is refused rather than competing with the first",
  );
  await assertRefused(
    () => createReport(ws.id, { workspaceProfileId: prof.id, periodStart: "2026-09-20", periodEnd: "2026-09-14", createdByEmail: "admin@example.com" }),
    /cannot be before/,
    "a backwards period is refused",
  );
  await assertRefused(
    () => createReport(otherWs.id, { workspaceProfileId: prof.id, periodStart: "2026-09-14", periodEnd: "2026-09-20", createdByEmail: "admin@example.com" }),
    /not on this client/,
    "a report cannot be written for a profile that belongs to a different client",
  );

  section("4b. Metrics: NULL is 'Not provided', and 0 is a real zero");
  await setReportMetric(report.id, "proposals_sent", 0);
  await setReportMetric(report.id, "profile_views", 412);
  await setReportMetric(report.id, "earnings", null);
  const stored = await loadMetricsForReports([report.id]);
  assert(stored[report.id]?.proposals_sent === 0, "an entered 0 is stored as 0 — a real measurement");
  assert(stored[report.id]?.earnings === null, "an unentered metric is stored as NULL, which renders as 'Not provided'");
  assert(stored[report.id]?.profile_views === 412, "an entered number round-trips unchanged");
  const [metricCountRow] = await db.select({ n: sql<number>`count(*)::int` }).from(reportMetrics)
    .where(and(eq(reportMetrics.reportId, report.id), sql`${reportMetrics.value} is not null`));
  assert(Number(metricCountRow.n) === 2, "the 'metrics entered' count counts 0 but not NULL — so it never overstates how complete a report is");
  await setReportMetric(report.id, "proposals_sent", 7);
  assert((await loadMetricsForReports([report.id]))[report.id]?.proposals_sent === 7, "re-entering a metric updates it in place instead of inserting a duplicate");

  section("4c. Publishing");
  const published = await publishReport(report.id, "admin@example.com");
  assert(published.activeMembers === 1, "publishing resolves the client's ACTIVE members");
  assert(published.notified === 1, "the client is notified");
  const [afterPublish] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, report.id));
  assert(afterPublish.status === "published" && afterPublish.publishedAt !== null, "the report is published and stamped");
  const clientInbox = await listNotifications(client.id);
  const reportNote = clientInbox.find(n => n.kind === "weekly_report_published");
  assert(reportNote?.link === `/portal/reports/${report.id}`, "the notification links straight to the report");

  const republished = await publishReport(report.id, "admin@example.com");
  assert(republished.notified === 0, "publishing again notifies 0 — the unique index dedupes, and the count reported is rows ACTUALLY inserted");
  assert(clientInbox.filter(n => n.kind === "weekly_report_published" && n.dedupeKey === `report:${report.id}`).length === 1,
    "so the client has exactly one notification for this report, not two");

  await unpublishReport(report.id);
  const [unpublished] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, report.id));
  assert(unpublished.status === "draft" && unpublished.publishedAt === null, "unpublishing returns it to draft, so the client can no longer open it");
  assert((await listNotifications(client.id)).some(n => n.dedupeKey === `report:${report.id}`),
    "the notification already sent is left alone — un-telling somebody is not a thing, and deleting it would make their history lie");

  section("4d. Publishing with nobody assigned, and while suspended");
  const emptyWs = await createWorkspace({ name: `Empty ${run}`, createdByEmail: "admin@example.com" });
  const emptyProf = await addWorkspaceProfile(emptyWs.id, { name: "Nobody's profile" });
  const emptyReport = await createReport(emptyWs.id, { workspaceProfileId: emptyProf.id, periodStart: "2026-09-14", periodEnd: "2026-09-20", createdByEmail: "admin@example.com" });
  const emptyResult = await publishReport(emptyReport.id, "admin@example.com");
  assert(emptyResult.activeMembers === 0 && emptyResult.notified === 0, "publishing for a client with nobody assigned reports 0 notified rather than implying success");

  await updateWorkspace(ws.id, { status: "suspended" });
  const suspReport = await createReport(ws.id, { workspaceProfileId: prof.id, periodStart: "2026-09-07", periodEnd: "2026-09-13", createdByEmail: "admin@example.com" });
  const suspResult = await publishReport(suspReport.id, "admin@example.com");
  assert(suspResult.workspaceSuspended === true, "publishing for a suspended client says so, so the admin is not told it worked when the client cannot open it");
  await updateWorkspace(ws.id, { status: "active" });

  // ============================================================================================
  section("5. The admin listing stitches its three reads correctly");
  // ============================================================================================
  const listing = await listWorkspacesForAdmin();
  const mine = listing.find(w => w.id === ws.id);
  assert(!!mine, "the client appears in the admin listing");
  assert(mine!.members.length === 1, "exactly one membership row, not one per report (the flat-read-then-stitch avoids join multiplication)");
  assert(mine!.profiles.length === 2, "both managed profiles");
  assert(mine!.reports.length === 2, "both reports");
  // Three metrics were touched on this report, but one of them (earnings) was set to NULL, and NULL
  // means "Not provided" rather than "entered". So the honest count is 2 — the same number the
  // direct SQL assertion in section 4b established.
  assert(mine!.reports.find(r => r.id === report.id)?.metricCount === 2, "the per-report metric count correlates to the right report, and counts only metrics that were actually entered");
  assert(mine!.reports.find(r => r.id === suspReport.id)?.metricCount === 0, "and a report with no metrics reports 0, not the other report's count");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(error => { console.error(error); process.exit(1); });
