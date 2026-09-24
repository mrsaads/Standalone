// LOCAL-ONLY integration test for the three-axis permission model.
//
// Runs against a real (local) Postgres — not mocked — because what is under test is SQL-level
// scoping: which rows a given caller's queries can reach. A test with a fake DB client would only
// prove that the TypeScript branches are arranged as written, which is not the property that
// matters. Every result below is a LOCAL result: it proves the access logic is correct against real
// Postgres semantics, not that it has been exercised against the deployed app.
//
// Usage:
//   DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db npx tsx scripts/local-tests/workspace-isolation.local-test.mts
//
// Requires: migrations 0000-0004 applied to that database, plus the local stand-in `auth.users`
// table the other local tests also need.
//
// The five account shapes the brief asks to be tested are all constructed here:
//   admin, free audit user, subscriber, assigned managed client, unassigned user.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  clientWorkspaces, workspaceMembers, workspaceProfiles, weeklyReports,
  reportAttachments, profiles, profileAudits,
} from "../../db/schema";
import {
  requireWorkspaceAccess, resolveWorkspaceAccess, requireReportAccess, requireAttachmentAccess,
  listActiveWorkspaces, listReportsForProfile, WorkspaceAccessError,
} from "../../lib/workspace-access";
import { entitlementFor } from "../../lib/entitlements";
import { reserveAuditSlot, releaseReservation, precheckWeeklyLimit, WeeklyLimitError } from "../../lib/audit-limit";
import type { AppUser } from "../../lib/auth";

let pass = 0;
let fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}
function section(title: string) { console.log(`\n${title}`); }

// Asserts that an operation is refused, and refused for an access reason rather than by crashing.
async function assertDenied(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    fail++; console.error(`  ✗ FAIL: ${label} (it was ALLOWED)`);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) { pass++; console.log(`  ✓ ${label} (denied: ${error.reason})`); }
    else { fail++; console.error(`  ✗ FAIL: ${label} — threw the wrong error: ${error}`); }
  }
}
async function assertAllowed(fn: () => Promise<unknown>, label: string) {
  try { await fn(); pass++; console.log(`  ✓ ${label}`); }
  catch (error) { fail++; console.error(`  ✗ FAIL: ${label} — ${error}`); }
}

type Seeded = { user: AppUser };

async function makeUser(
  db: ReturnType<typeof getDb>,
  opts: { role?: "base" | "admin"; auditEntitlement?: "free" | "subscribed" | "admin_granted"; auditCredits?: number; label: string },
): Promise<Seeded> {
  const id = randomUUID();
  const email = `${opts.label}-${id.slice(0, 8)}@example.com`;
  await db.execute(sql`insert into auth.users (id) values (${id})`);
  await db.insert(profiles).values({
    id, email,
    role: opts.role ?? "base",
    auditEntitlement: opts.auditEntitlement ?? "free",
    auditCredits: opts.auditCredits ?? 0,
  });
  return {
    user: {
      id, email, fullName: "", mobile: "", upworkLink: "",
      role: opts.role ?? "base",
      auditEntitlement: opts.auditEntitlement ?? "free",
      auditCredits: opts.auditCredits ?? 0,
      auditCreditsUsed: 0,
      marketingOptIn: true,
    },
  };
}

async function main() {
  const db = getDb();
  const stamp = randomUUID().slice(0, 8);

  section("Seeding the five account shapes from the brief");
  const admin = await makeUser(db, { role: "admin", label: "admin" });
  const freeUser = await makeUser(db, { auditEntitlement: "free", label: "free" });
  const subscriber = await makeUser(db, { auditEntitlement: "subscribed", label: "subscriber" });
  const clientA = await makeUser(db, { auditEntitlement: "free", label: "clientA" });
  const clientB = await makeUser(db, { auditEntitlement: "free", label: "clientB" });
  const unassigned = await makeUser(db, { auditEntitlement: "free", label: "unassigned" });
  console.log("  seeded admin, free, subscriber, clientA, clientB, unassigned");

  // Two separate managed clients, each with its own profile, a published report, a draft report,
  // a client-visible attachment and an internal attachment.
  async function makeWorkspace(name: string, member: Seeded) {
    const [ws] = await db.insert(clientWorkspaces)
      .values({ name, slug: `${name.toLowerCase()}-${stamp}`, createdByEmail: admin.user.email })
      .returning();
    await db.insert(workspaceMembers).values({
      workspaceId: ws.id, userId: member.user.id, userEmail: member.user.email,
      status: "active", grantedByEmail: admin.user.email,
    });
    const [prof] = await db.insert(workspaceProfiles)
      .values({ workspaceId: ws.id, name: `${name} profile`, upworkUrl: "https://upwork.com/x" })
      .returning();
    const [published] = await db.insert(weeklyReports).values({
      workspaceId: ws.id, workspaceProfileId: prof.id,
      periodStart: "2026-09-08", periodEnd: "2026-09-14",
      status: "published", title: `${name} week 1`, publishedAt: new Date(),
    }).returning();
    const [draft] = await db.insert(weeklyReports).values({
      workspaceId: ws.id, workspaceProfileId: prof.id,
      periodStart: "2026-09-15", periodEnd: "2026-09-21",
      status: "draft", title: `${name} week 2 DRAFT`,
    }).returning();
    const [visibleAtt] = await db.insert(reportAttachments).values({
      reportId: published.id, workspaceId: ws.id, fileName: `${name}-evidence.png`, visibleToClient: true,
    }).returning();
    const [internalAtt] = await db.insert(reportAttachments).values({
      reportId: published.id, workspaceId: ws.id, fileName: `${name}-internal.png`, visibleToClient: false,
    }).returning();
    return { ws, prof, published, draft, visibleAtt, internalAtt };
  }

  const A = await makeWorkspace("Acme", clientA);
  const B = await makeWorkspace("Borealis", clientB);
  console.log(`  workspace A=${A.ws.id} workspace B=${B.ws.id}`);

  section("A. Client A reaches its own workspace");
  await assertAllowed(() => requireWorkspaceAccess(clientA.user, A.ws.id), "clientA opens workspace A");
  await assertAllowed(() => requireReportAccess(clientA.user, A.published.id), "clientA opens its own published report");
  await assertAllowed(() => requireAttachmentAccess(clientA.user, A.visibleAtt.id), "clientA downloads its own client-visible attachment");
  const aWorkspaces = await listActiveWorkspaces(clientA.user.id);
  assert(aWorkspaces.length === 1 && aWorkspaces[0].id === A.ws.id, "clientA's workspace list contains exactly workspace A");

  section("B. Client A cannot reach Client B — the core isolation requirement");
  await assertDenied(() => requireWorkspaceAccess(clientA.user, B.ws.id), "clientA cannot open workspace B");
  await assertDenied(() => requireReportAccess(clientA.user, B.published.id), "clientA cannot open B's published report by id");
  await assertDenied(() => requireReportAccess(clientA.user, B.draft.id), "clientA cannot open B's draft report by id");
  await assertDenied(() => requireAttachmentAccess(clientA.user, B.visibleAtt.id), "clientA cannot download B's attachment by id");
  const crossProfileReports = await listReportsForProfile(
    await requireWorkspaceAccess(clientA.user, A.ws.id),
    B.prof.id,
  );
  assert(crossProfileReports.length === 0, "listing B's profile id inside A's authorized workspace returns nothing");

  section("C. Drafts and internal attachments are invisible to the client who owns the workspace");
  await assertDenied(() => requireReportAccess(clientA.user, A.draft.id), "clientA cannot open its OWN workspace's draft report");
  await assertDenied(() => requireAttachmentAccess(clientA.user, A.internalAtt.id), "clientA cannot download an internal attachment on its own published report");
  const clientVisibleReports = await listReportsForProfile(await requireWorkspaceAccess(clientA.user, A.ws.id), A.prof.id);
  assert(clientVisibleReports.length === 1 && clientVisibleReports[0].status === "published",
    "clientA's report list contains only the published report, not the draft");

  section("D. Removing an assignment removes access immediately");
  await db.update(workspaceMembers).set({ status: "inactive", revokedAt: new Date() })
    .where(eq(workspaceMembers.userId, clientA.user.id));
  await assertDenied(() => requireWorkspaceAccess(clientA.user, A.ws.id), "revoked clientA can no longer open workspace A");
  await assertDenied(() => requireReportAccess(clientA.user, A.published.id), "revoked clientA can no longer open the report they could read a moment ago");
  await assertDenied(() => requireAttachmentAccess(clientA.user, A.visibleAtt.id), "revoked clientA can no longer download the attachment");
  assert((await listActiveWorkspaces(clientA.user.id)).length === 0, "revoked clientA's workspace list is now empty");
  // Restore for the remaining sections.
  await db.update(workspaceMembers).set({ status: "active", revokedAt: null })
    .where(eq(workspaceMembers.userId, clientA.user.id));
  await assertAllowed(() => requireWorkspaceAccess(clientA.user, A.ws.id), "re-granting access restores it immediately");

  section("E. Suspending the workspace withdraws access without touching memberships");
  await db.update(clientWorkspaces).set({ status: "suspended" }).where(eq(clientWorkspaces.id, A.ws.id));
  await assertDenied(() => requireWorkspaceAccess(clientA.user, A.ws.id), "clientA cannot open a suspended workspace");
  await db.update(clientWorkspaces).set({ status: "active" }).where(eq(clientWorkspaces.id, A.ws.id));
  await assertAllowed(() => requireWorkspaceAccess(clientA.user, A.ws.id), "un-suspending restores access");

  section("F. The two entitlement axes do not grant each other's permissions");
  // Audit entitlement must not open the portal...
  await assertDenied(() => requireWorkspaceAccess(subscriber.user, A.ws.id), "a SUBSCRIBER with no membership cannot open a workspace");
  await assertDenied(() => requireReportAccess(subscriber.user, A.published.id), "a SUBSCRIBER cannot open a managed client's report");
  await assertDenied(() => requireWorkspaceAccess(unassigned.user, A.ws.id), "an UNASSIGNED user cannot open a workspace");
  assert((await listActiveWorkspaces(subscriber.user.id)).length === 0, "a subscriber has no workspaces");

  // ...and membership must not grant audit downloads.
  const clientAEntitlement = entitlementFor(clientA.user);
  assert(clientAEntitlement.plan === "free", "an assigned managed client on the free tier still resolves to the FREE audit plan");
  assert(clientAEntitlement.canDownload === false, "being a managed client does NOT grant audit PDF/Word export");
  assert(clientAEntitlement.canOptimize === false, "being a managed client does NOT unlock the AI optimization section");
  // ...but it also must not take their report download away, which is the point of the split.
  await assertAllowed(() => requireReportAccess(clientA.user, A.published.id),
    "that same free-tier managed client CAN still read their weekly report (no checkout involved)");

  section("G. Admin access is opt-in per call site, never implicit");
  const implicit = await resolveWorkspaceAccess(admin.user, A.ws.id);
  assert("denied" in implicit, "an admin is NOT silently admitted to the client portal path (allowAdmin defaults off)");
  const explicit = await resolveWorkspaceAccess(admin.user, A.ws.id, { allowAdmin: true });
  assert(!("denied" in explicit) && explicit.via === "admin", "an admin IS admitted where the route opts in, and is labelled via=admin");
  const adminDrafts = await listReportsForProfile(
    await requireWorkspaceAccess(admin.user, A.ws.id, { allowAdmin: true }), A.prof.id, { includeDrafts: true },
  );
  assert(adminDrafts.length === 2, "an admin opting into drafts sees both the published and the draft report");

  section("H. Malformed ids are refused before they reach the database");
  await assertDenied(() => requireWorkspaceAccess(clientA.user, "not-a-uuid"), "a non-uuid workspace id is refused as not_found, not a 500");
  await assertDenied(() => requireReportAccess(clientA.user, "'; drop table weekly_reports; --"), "a SQL-shaped report id is refused as not_found");

  section("I. Audit credits: spent only after the weekly allowance, refunded on failure");
  const credited = await makeUser(db, { auditEntitlement: "free", auditCredits: 1, label: "credited" });
  const first = await reserveAuditSlot(credited.user, "p1", "h1", "");
  assert(first.creditSpent === false, "the first audit of the week uses the free weekly allowance, not a credit");
  await db.update(profileAudits).set({ status: "completed" }).where(eq(profileAudits.id, first.auditId));

  const second = await reserveAuditSlot(credited.user, "p2", "h2", "");
  assert(second.creditSpent === true, "the second audit in the same week spends one admin-granted credit");
  const [afterSpend] = await db.select().from(profiles).where(eq(profiles.id, credited.user.id));
  assert(afterSpend.auditCreditsUsed === 1, "credits_used incremented to 1");

  // A failed generation must not cost the credit.
  await releaseReservation(second.auditId, second.leaseToken);
  const [afterRefund] = await db.select().from(profiles).where(eq(profiles.id, credited.user.id));
  assert(afterRefund.auditCreditsUsed === 0, "releasing the failed reservation REFUNDED the credit");

  // A second release of the same reservation must not refund twice.
  await releaseReservation(second.auditId, second.leaseToken);
  const [afterDoubleRelease] = await db.select().from(profiles).where(eq(profiles.id, credited.user.id));
  assert(afterDoubleRelease.auditCreditsUsed === 0, "a repeated release does not refund the same credit twice");

  // With the credit refunded it can be spent again; once genuinely used up, the limit bites.
  const third = await reserveAuditSlot(credited.user, "p3", "h3", "");
  assert(third.creditSpent === true, "the refunded credit is spendable again");
  await db.update(profileAudits).set({ status: "completed" }).where(eq(profileAudits.id, third.auditId));
  let limitHit = false;
  try { await reserveAuditSlot(credited.user, "p4", "h4", ""); }
  catch (error) { limitHit = error instanceof WeeklyLimitError; }
  assert(limitHit, "with the weekly allowance spent and no credits left, a further audit is refused");
  let precheckHit = false;
  try { await precheckWeeklyLimit(credited.user); }
  catch (error) { precheckHit = error instanceof WeeklyLimitError; }
  assert(precheckHit, "the cheap pre-check agrees with the authoritative reservation check");

  section("J. A free user with no credits is limited to one audit per rolling 7 days (unchanged)");
  const plainFree = await makeUser(db, { auditEntitlement: "free", label: "plainfree" });
  const only = await reserveAuditSlot(plainFree.user, "p1", "h1", "");
  await db.update(profileAudits).set({ status: "completed" }).where(eq(profileAudits.id, only.auditId));
  let freeLimited = false;
  try { await reserveAuditSlot(plainFree.user, "p2", "h2", ""); }
  catch (error) { freeLimited = error instanceof WeeklyLimitError; }
  assert(freeLimited, "the existing free restriction of one successful audit per 7 days is preserved");

  section("K. Admin keeps an unlimited product allowance (unchanged)");
  for (let i = 0; i < 3; i++) {
    const r = await reserveAuditSlot(admin.user, `admin-p${i}`, `admin-h${i}`, "");
    await db.update(profileAudits).set({ status: "completed" }).where(eq(profileAudits.id, r.auditId));
  }
  assert(true, "admin reserved 3 audits back to back with no limit error");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(error => { console.error(error); process.exit(1); });
