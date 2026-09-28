import { Suspense } from "react";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profileAudits, profiles } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin-guard";
import { AdminShell } from "../admin-shell";
import { AccountsAdmin } from "./accounts-admin";

export const dynamic = "force-dynamic";

// Accounts, audit plans (the "memberships" half of the panel) and every generated audit.
export default async function AdminAccountsPage() {
  const { user, navCounts } = await requireAdminPage();
  const db = getDb();

  const userRows = await db.select({
    id: profiles.id,
    email: profiles.email,
    fullName: profiles.fullName,
    mobile: profiles.mobile,
    upworkLink: profiles.upworkLink,
    role: profiles.role,
    auditEntitlement: profiles.auditEntitlement,
    auditCredits: profiles.auditCredits,
    auditCreditsUsed: profiles.auditCreditsUsed,
    planUpdatedAt: profiles.planUpdatedAt,
    createdAt: profiles.createdAt,
    lastSeenAt: profiles.lastSeenAt,
    // EVERY correlated subquery below writes "profiles"."id" in full, and aliases its own table.
    // That is not style — it is the fix for a bug that took this page down.
    //
    // Drizzle renders an interpolated column inside a sql`` fragment UNQUALIFIED (`"id"`, not
    // `"profiles"."id"`). Inside a subquery whose own table also has an `id` column, Postgres binds
    // that bare `"id"` to the INNER table — the inner scope wins — so the correlation to the outer
    // row silently disappeared:
    //
    //   `where pa.user_id = "id"`  became  `where profile_audits.user_id = profile_audits.id`
    //      -> matched almost nothing, so every account showed an audit count of 0.
    //   `where au.id = "id"`       became  `where auth.users.id = auth.users.id`
    //      -> true for every row. Harmless inside EXISTS (every account read as verified), but
    //         FATAL in the scalar subquery below, which must return at most one row: Postgres
    //         raised 21000 "more than one row returned by a subquery used as an expression" and the
    //         whole page 500'd.
    //
    // It only became fatal once a SECOND account existed. Latent from the day it was written.
    auditCount: sql<number>`(select count(*)::int from ${profileAudits} pa where pa.user_id = "profiles"."id")`,
    // Deliberately the *only* fields read from Supabase's own auth.users table: whether the email is
    // verified and when the account last actually signed in. Never the password hash, never a
    // session or refresh token — the admin panel shows verification status and a reset action
    // instead of any credential.
    emailVerified: sql<boolean>`exists (select 1 from auth.users au where au.id = "profiles"."id" and au.email_confirmed_at is not null)`,
    lastSignInAt: sql<string | null>`(select au.last_sign_in_at::text from auth.users au where au.id = "profiles"."id")`,
  }).from(profiles).orderBy(desc(profiles.createdAt)).limit(200);

  const auditRows = await db.select({
    id: profileAudits.id,
    userEmail: profileAudits.userEmail,
    profileName: profileAudits.profileName,
    score: profileAudits.score,
    passCount: profileAudits.passCount,
    weakCount: profileAudits.weakCount,
    failCount: profileAudits.failCount,
    provider: profileAudits.provider,
    billable: profileAudits.billable,
    status: profileAudits.status,
    createdAt: profileAudits.createdAt,
  }).from(profileAudits).orderBy(desc(profileAudits.createdAt)).limit(100);

  return (
    <AdminShell
      adminEmail={user.email}
      counts={navCounts}
      title="Audits & memberships"
      description="Every account and the audit plan it holds, plus every audit the product has generated. An audit plan is separate from managed-client access — that lives in Client portals."
    >
      {/* useSearchParams (for the ?drive= result banner) needs a Suspense boundary above it. */}
      <Suspense fallback={<p className="ix-none">Loading…</p>}>
        <AccountsAdmin
          users={userRows.map(u => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
            lastSeenAt: u.lastSeenAt.toISOString(),
            planUpdatedAt: u.planUpdatedAt.toISOString(),
          }))}
          audits={auditRows.map(a => ({ ...a, createdAt: a.createdAt.toISOString() }))}
        />
      </Suspense>
    </AdminShell>
  );
}
