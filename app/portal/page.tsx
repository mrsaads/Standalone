import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { weeklyReports, workspaceProfiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getShellNav } from "@/lib/shell-data";
import { listWorkspaceProfiles, requireWorkspaceAccess, WorkspaceAccessError } from "@/lib/workspace-access";
import { AppShell, PageHead } from "../app-shell";

export const dynamic = "force-dynamic";

// The managed-client portal.
//
// No entitlement check and no checkout anywhere on this path: a managed client reads and downloads
// their reports on the strength of their assignment alone, which is the brief's explicit
// requirement. What IS checked, on every request, is the assignment itself — via
// requireWorkspaceAccess, the single chokepoint in lib/workspace-access.ts.
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; profile?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { nav, workspaces } = await getShellNav(user);
  const params = await searchParams;

  // Not assigned to anything: explain the lock and how to get access, rather than 404ing or
  // showing an empty shell that looks broken.
  if (workspaces.length === 0) {
    return (
      <AppShell nav={nav}>
        <PageHead title="Client portal" />
        <div className="ix-empty">
          <h3><Lock size={16} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />You are not enrolled in profile management</h3>
          <p>
            The client portal is available to clients enrolled in our profile management service.
            Enrolment is set up by an Improvexus account manager — there is no checkout, and no
            subscription unlocks it.
          </p>
          <Link href="/" className="ix-btn ix-btn--secondary">Request management services</Link>
        </div>
      </AppShell>
    );
  }

  // Which workspace. An id in the query string is NOT trusted: it is authorized below exactly like
  // any other request, so pasting someone else's workspace id here fails the same way it would at
  // the API.
  const requestedWorkspace = params.workspace && workspaces.some(w => w.id === params.workspace)
    ? params.workspace
    : workspaces[0].id;

  let access;
  try {
    access = await requireWorkspaceAccess(user, requestedWorkspace);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) redirect("/portal");
    throw error;
  }

  const profiles = await listWorkspaceProfiles(access);
  const activeProfileId = params.profile && profiles.some(p => p.id === params.profile)
    ? params.profile
    : profiles[0]?.id ?? null;

  const db = getDb();
  const reports = activeProfileId
    ? await db.select({
        id: weeklyReports.id,
        title: weeklyReports.title,
        periodStart: weeklyReports.periodStart,
        periodEnd: weeklyReports.periodEnd,
        publishedAt: weeklyReports.publishedAt,
      })
        .from(weeklyReports)
        .where(and(
          eq(weeklyReports.workspaceId, access.workspace.id),
          eq(weeklyReports.workspaceProfileId, activeProfileId),
          // Published only, filtered in SQL — a draft is never selected for a client, not merely
          // hidden from them.
          eq(weeklyReports.status, "published"),
        ))
        .orderBy(desc(weeklyReports.periodEnd))
        .limit(50)
    : [];

  const [latest, ...previous] = reports;

  return (
    <AppShell nav={nav}>
      <PageHead
        title={access.workspace.name}
        description={access.workspace.objectives || "Your weekly reports and updates from the Improvexus team."}
        actions={access.workspace.accountManager
          ? <span className="ix-badge">Account manager: {access.workspace.accountManager}</span>
          : undefined}
      />

      {/* Workspace switcher, shown only when there is genuinely more than one. */}
      {workspaces.length > 1 && (
        <nav className="ix-row" aria-label="Your workspaces" style={{ marginBottom: "var(--ix-gap-lg)" }}>
          {workspaces.map(w => (
            <Link
              key={w.id}
              href={`/portal?workspace=${w.id}`}
              className={`ix-btn ${w.id === access.workspace.id ? "ix-btn--primary" : "ix-btn--secondary"}`}
            >
              {w.name}
            </Link>
          ))}
        </nav>
      )}

      {/* Profile selector — the brief asks for one whenever a client manages more than one
          profile, and each profile carries its own separate history. */}
      {profiles.length > 1 && (
        <nav className="ix-row" aria-label="Managed profiles" style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <span className="ix-section-title" style={{ marginRight: 8 }}>Profile</span>
          {profiles.map(p => (
            <Link
              key={p.id}
              href={`/portal?workspace=${access.workspace.id}&profile=${p.id}`}
              className={`ix-btn ${p.id === activeProfileId ? "ix-btn--primary" : "ix-btn--secondary"}`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {profiles.length === 0 ? (
        <div className="ix-empty">
          <h3>No profiles added yet</h3>
          <p>
            Your Improvexus account manager has not added an Upwork profile to this workspace yet.
            Weekly reports will appear here once they do.
          </p>
        </div>
      ) : reports.length === 0 ? (
        <div className="ix-empty">
          <h3>No published reports yet</h3>
          <p>
            Your first weekly report for this profile has not been published. You will get a
            notification here as soon as it is.
          </p>
        </div>
      ) : (
        <div className="ix-stack ix-stack--lg">
          <section className="ix-stack" aria-labelledby="ix-latest">
            <h2 id="ix-latest" className="ix-section-title">Latest report</h2>
            <Link href={`/portal/reports/${latest.id}`} className="ix-card" style={{ textDecoration: "none", display: "block" }}>
              <p className="ix-title" style={{ fontSize: 18 }}>
                {latest.title || `Week of ${latest.periodStart}`}
              </p>
              <p className="ix-subtitle" style={{ marginTop: 6 }}>
                {latest.periodStart} → {latest.periodEnd}
                {latest.publishedAt && ` · published ${new Date(latest.publishedAt).toLocaleDateString()}`}
              </p>
              <span className="ix-link" style={{ display: "inline-block", marginTop: 14 }}>Open report →</span>
            </Link>
          </section>

          {previous.length > 0 && (
            <section className="ix-stack" aria-labelledby="ix-previous">
              <h2 id="ix-previous" className="ix-section-title">Previous reports</h2>
              <div className="ix-list">
                {previous.map(report => (
                  <Link key={report.id} href={`/portal/reports/${report.id}`} className="ix-list__item">
                    <div className="ix-list__main">
                      <span className="ix-list__title">{report.title || `Week of ${report.periodStart}`}</span>
                      <span className="ix-list__sub">{report.periodStart} → {report.periodEnd}</span>
                    </div>
                    <span className="ix-badge">Published</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
