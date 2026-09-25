import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { requireCurrentUser, AuthRequiredError } from "@/lib/auth";
import { getDb } from "@/db";
import { profiles, profileAudits } from "@/db/schema";
import { AdminDashboard } from "./admin-dashboard";

// Server component: authorizes (admin only — a base account is bounced to "/") and loads the two
// listings the dev brief asks for (user details, reports) directly via Drizzle. Interactive parts
// (Drive connect/status, per-audit retry) live in the client component below, since those need to
// call API routes and show loading state.
export default async function AdminPage() {
  let user;
  try { user = await requireCurrentUser(); }
  catch (error) { if (error instanceof AuthRequiredError) redirect("/login"); throw error; }
  if (user.role !== "admin") redirect("/");

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
    //   `where u.id = "id"`        became  `where auth.users.id = auth.users.id`
    //      -> true for every row. Harmless inside EXISTS (it just returned true for everyone, so
    //         every account read as email-verified), but FATAL in the scalar subquery below, which
    //         must return at most one row: Postgres raised 21000 "more than one row returned by a
    //         subquery used as an expression" and the whole page 500'd.
    //
    // It only became fatal once a SECOND account existed — with one user in auth.users the broken
    // subquery still returned exactly one row and looked fine. Latent from the day this was written.
    auditCount: sql<number>`(select count(*)::int from ${profileAudits} pa where pa.user_id = "profiles"."id")`,
    // Deliberately the *only* fields read from Supabase's own auth.users table: whether the email is
    // verified and when the account last actually signed in. Never the password hash, never a
    // session/refresh token — see lib/auth.ts and the standing rule that the admin panel shows
    // verification status and a reset action instead of any credential.
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
    // "reserved" here (rather than completed/failed) means the AI call is still in flight, or the
    // server died before it could complete/release the reservation — see lib/audit-limit.ts and
    // the reaper in lib/delivery-worker.ts, which sweeps a reserved row this old to "failed"
    // automatically. Surfaced so an admin can see a stuck reservation rather than just an empty
    // profile name with no explanation.
    status: profileAudits.status,
    createdAt: profileAudits.createdAt,
  }).from(profileAudits).orderBy(desc(profileAudits.createdAt)).limit(100);

  return (
    <AdminDashboard
      adminEmail={user.email}
      users={userRows.map(u => ({ ...u, createdAt: u.createdAt.toISOString(), lastSeenAt: u.lastSeenAt.toISOString(), planUpdatedAt: u.planUpdatedAt.toISOString() }))}
      audits={auditRows.map(a => ({ ...a, createdAt: a.createdAt.toISOString() }))}
    />
  );
}
