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
    plan: profiles.plan,
    planUpdatedAt: profiles.planUpdatedAt,
    createdAt: profiles.createdAt,
    lastSeenAt: profiles.lastSeenAt,
    // These three correlated subqueries all reference the outer "profiles" row by id. That
    // reference MUST be fully table-qualified (sql.raw('"profiles"."id"'), not the bare
    // ${profiles.id} column interpolation Drizzle would otherwise emit) — Postgres resolves an
    // unqualified "id" against the *innermost* FROM first, and both profile_audits and auth.users
    // have their own "id" column, so a bare reference silently shadows the outer row and binds to
    // the subquery's own table instead. That's not hypothetical: it shipped this way and (1) made
    // auditCount silently always 0 (verified directly against the database — the shadowed version
    // compares profile_audits.user_id to profile_audits.id, which is never true) and (2) crashes
    // this whole page with Postgres error 21000 "more than one row returned by a subquery used as
    // an expression" as soon as auth.users has 2+ rows, because the shadowed emailVerified/
    // lastSignInAt subqueries degrade to "where u.id = u.id" and match every auth.users row
    // instead of just the correlated one. Confirmed both failure modes directly against the
    // database before writing this fix, and confirmed the qualified form resolves correctly.
    auditCount: sql<number>`(select count(*) from ${profileAudits} where ${profileAudits.userId} = ${sql.raw('"profiles"."id"')})::int`,
    // Deliberately the *only* fields read from Supabase's own auth.users table: whether the email is
    // verified and when the account last actually signed in. Never the password hash, never a
    // session/refresh token — see lib/auth.ts and the standing rule that the admin panel shows
    // verification status and a reset action instead of any credential.
    emailVerified: sql<boolean>`exists (select 1 from auth.users u where u.id = ${sql.raw('"profiles"."id"')} and u.email_confirmed_at is not null)`,
    lastSignInAt: sql<string | null>`(select u.last_sign_in_at::text from auth.users u where u.id = ${sql.raw('"profiles"."id"')})`,
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
