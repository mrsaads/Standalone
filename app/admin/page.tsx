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
    createdAt: profiles.createdAt,
    lastSeenAt: profiles.lastSeenAt,
    auditCount: sql<number>`(select count(*) from ${profileAudits} where ${profileAudits.userId} = ${profiles.id})::int`,
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
      users={userRows.map(u => ({ ...u, createdAt: u.createdAt.toISOString(), lastSeenAt: u.lastSeenAt.toISOString() }))}
      audits={auditRows.map(a => ({ ...a, createdAt: a.createdAt.toISOString() }))}
    />
  );
}
