// LOCAL-ONLY demo seed. Wipes and repopulates a LOCAL Postgres replica with a representative admin
// view, so the new admin sections can be inspected and screenshotted against real data shapes
// instead of empty tables.
//
// It starts with TRUNCATE and DELETE. Never point it at the production database.
//
// Usage:
//   DATABASE_URL=postgres://user:pass@127.0.0.1:5432/ix_test npx tsx scripts/seed-local-demo.mts
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { leads, managementEnquiries, profiles } from "../db/schema";
import { sendAnnouncement } from "../lib/announcements";
import {
  addWorkspaceProfile, createReport, createWorkspace, grantMember, publishReport, setReportMetric,
} from "../lib/admin-clients";

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error("Refusing to run: DATABASE_URL does not point at a local database. This script deletes data.");
  process.exit(1);
}

const db = getDb();
await db.execute(sql`truncate leads, management_enquiries, announcements, announcement_deliveries, notifications, client_workspaces, workspace_members, workspace_profiles, weekly_reports, report_metrics, admin_audit_log`);
await db.execute(sql`delete from profiles`);
await db.execute(sql`delete from auth.users`);

async function account(email: string, opts: { entitlement?: "free" | "subscribed" | "admin_granted"; role?: "base" | "admin" } = {}) {
  const id = randomUUID();
  await db.execute(sql`insert into auth.users (id, email_confirmed_at, last_sign_in_at) values (${id}, now(), now())`);
  await db.insert(profiles).values({
    id, email, fullName: email.split("@")[0],
    role: opts.role ?? "base", auditEntitlement: opts.entitlement ?? "free",
  });
  return { id, email };
}

const admin = await account("saadkkhalidd@gmail.com", { role: "admin", entitlement: "admin_granted" });
const clientA = await account("ayesha.khan@example.com", { entitlement: "subscribed" });
await account("hamza@example.com");

// Two anonymous landing-page enquiries and one from a signed-in user — the exact shapes that were
// being stored and never shown.
await db.insert(leads).values([
  { name: "Bilal Ahmed", email: "bilal@example.com", profileLink: "https://www.upwork.com/freelancers/~01abc", goals: "I want more invitations for data-entry work.", source: "landing_audit" },
  { name: "Sana Tariq", email: "sana@example.com", goals: "Interested in your profile management service.", source: "landing_client_portal" },
  { name: "Ayesha Khan", email: clientA.email, source: "client_portal_access_request", userId: clientA.id, status: "reviewed" },
]);
await db.insert(managementEnquiries).values({
  userId: clientA.id, userEmail: clientA.email,
  message: "I'd like Improvexus to run my profile. I'm getting views but no invites.",
});

const ws = await createWorkspace({
  name: "Ayesha Khan", accountManager: "Saad",
  objectives: "Move from views to invitations: reposition as a specialist and raise the reply rate.",
  serviceStartDate: "2026-09-01", createdByEmail: admin.email,
});
await grantMember(ws.id, clientA.email, admin.email);
const prof = await addWorkspaceProfile(ws.id, { name: "Data & admin support", upworkUrl: "https://www.upwork.com/freelancers/~01abc" });

const r1 = await createReport(ws.id, {
  workspaceProfileId: prof.id, periodStart: "2026-09-14", periodEnd: "2026-09-20",
  title: "Week of 14 September", overview: "Views up, invitations flat.", createdByEmail: admin.email,
});
await setReportMetric(r1.id, "profile_views", 412);
await setReportMetric(r1.id, "proposals_sent", 18);
await setReportMetric(r1.id, "replies", 4);
// Deliberately a real zero, to show that 0 and "Not provided" are not the same thing on the report.
await setReportMetric(r1.id, "invitations", 0);
await publishReport(r1.id, admin.email);

await createReport(ws.id, {
  workspaceProfileId: prof.id, periodStart: "2026-09-21", periodEnd: "2026-09-27",
  title: "Week of 21 September", createdByEmail: admin.email,
});

await sendAnnouncement({
  title: "Your reports have moved to the Client portal",
  body: "Weekly reports now live under Client portal in the top navigation. Nothing else changed.",
  audience: "managed_clients", category: "service",
  actionLabel: "Open portal", actionUrl: "/portal", createdByEmail: admin.email,
});
await sendAnnouncement({
  title: "Scheduled maintenance on Sunday",
  body: "Improvexus will be briefly unavailable on Sunday between 02:00 and 03:00 PKT.",
  audience: "everyone", category: "service", createdByEmail: admin.email,
});

const [row] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, admin.email));
console.log(`ADMIN_ID=${row.id}`);
process.exit(0);
