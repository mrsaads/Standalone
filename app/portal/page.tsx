import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reportMetrics, weeklyReports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getShellNav } from "@/lib/shell-data";
import { buildMetricRows } from "@/lib/report-metrics";
import { listWorkspaceProfiles, requireWorkspaceAccess, WorkspaceAccessError } from "@/lib/workspace-access";
import { AppShell, Def, Defs, PageHead, Panel, StatCard, Stats, Tab, Tabs } from "../app-shell";

export const dynamic = "force-dynamic";

// The managed-client portal.
//
// No entitlement check and no checkout anywhere on this path: a managed client reads and downloads
// their reports on the strength of their assignment alone, which is the brief's explicit
// requirement. What IS checked, on every request, is the assignment itself — via
// requireWorkspaceAccess, the single chokepoint in lib/workspace-access.ts.
//
// Layout note: the workspace and profile switchers used to be rows of filled primary buttons. A row
// of primary buttons reads as "pick an action", so a client with three managed profiles saw three
// equally loud calls to action rather than a statement of which one they were looking at. They are
// tabs now, and each tab is a real URL, so a particular profile's history can be bookmarked.
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; profile?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { nav, workspaces } = await getShellNav(user);
  const params = await searchParams;

  // Not assigned to anything: explain the lock and how to get access, rather than 404ing or showing
  // an empty shell that looks broken.
  if (workspaces.length === 0) {
    return (
      <AppShell nav={nav}>
        <PageHead title="Client portal" />
        <Panel
          title={<><Lock size={15} aria-hidden="true" /> You are not enrolled in profile management</>}
          description="The client portal is for clients whose Upwork profile the Improvexus team manages."
        >
          <div className="ix-stack">
            <p className="ix-none">
              Enrolment is set up by an Improvexus account manager. There is no checkout and no
              subscription unlocks it. It is also completely separate from your audit plan.
            </p>
            <div><Link href="/" className="ix-btn ix-btn--secondary">Request management services</Link></div>
          </div>
        </Panel>
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
        clientActions: weeklyReports.clientActions,
        overview: weeklyReports.overview,
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

  // The headline figures from the newest report, shown on this page so the client sees where they
  // stand without opening anything. A metric nobody entered is NULL and renders as "Not provided" —
  // never as 0, which is a real measurement.
  const latestMetrics = latest
    ? buildMetricRows(
        (await db.select().from(reportMetrics).where(eq(reportMetrics.reportId, latest.id))).map(m => ({
          metricKey: m.metricKey, value: m.value, source: m.source,
          periodStart: m.periodStart, periodEnd: m.periodEnd, note: m.note,
        })),
        [],
      ).filter(r => r.provided)
    : [];

  const activeProfile = profiles.find(p => p.id === activeProfileId);

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
        <div style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <Tabs label="Your clients">
            {workspaces.map(w => (
              <Tab key={w.id} href={`/portal?workspace=${w.id}`} current={w.id === access.workspace.id}>
                {w.name}
              </Tab>
            ))}
          </Tabs>
        </div>
      )}

      {/* Profile selector — the brief asks for one whenever a client manages more than one profile,
          and each profile carries its own separate history. */}
      {profiles.length > 1 && (
        <div style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <Tabs label="Managed profiles">
            {profiles.map(p => (
              <Tab
                key={p.id}
                href={`/portal?workspace=${access.workspace.id}&profile=${p.id}`}
                current={p.id === activeProfileId}
              >
                {p.name}
              </Tab>
            ))}
          </Tabs>
        </div>
      )}

      {profiles.length === 0 ? (
        <Panel title="No profiles added yet" description="Weekly reports appear here once a profile is added.">
          <p className="ix-none">
            Your Improvexus account manager has not added an Upwork profile to this client yet.
          </p>
        </Panel>
      ) : reports.length === 0 ? (
        <Panel
          title="No published reports yet"
          description={activeProfile ? `Nothing has been published for ${activeProfile.name}.` : undefined}
        >
          <p className="ix-none">
            Your first weekly report has not been published yet. As soon as it is, you will get a
            notification here and a count in the header.
          </p>
        </Panel>
      ) : (
        <>
          {latestMetrics.length > 0 && (
            <div style={{ marginBottom: "var(--ix-gap-lg)" }}>
              <Stats>
                {latestMetrics.slice(0, 5).map(row => (
                  <StatCard
                    key={row.key}
                    label={row.label}
                    value={row.display}
                    note={`Week ending ${latest.periodEnd}`}
                  />
                ))}
              </Stats>
            </div>
          )}

          <Panel
            title="Latest report"
            description={`${latest.periodStart} → ${latest.periodEnd}${latest.publishedAt ? ` · published ${new Date(latest.publishedAt).toLocaleDateString()}` : ""}`}
            actions={<Link href={`/portal/reports/${latest.id}`} className="ix-btn ix-btn--primary">Open report</Link>}
          >
            <div className="ix-stack">
              <p className="ix-title" style={{ fontSize: 18 }}>
                {latest.title || `Week of ${latest.periodStart}`}
              </p>
              {latest.overview && <p className="ix-prose ix-prose--clamp">{latest.overview}</p>}
              {/* Anything that needs the client to act is surfaced before they open anything —
                  burying it inside the report is how it gets missed. */}
              {latest.clientActions && (
                <div className="ix-notice ix-notice--warning">
                  <div>
                    <strong>Needs your input</strong>
                    <p className="ix-prose" style={{ marginTop: 6 }}>{latest.clientActions}</p>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {previous.length > 0 && (
            <Panel
              title={<>Previous reports <span className="ix-muted-inline">({previous.length})</span></>}
              description={activeProfile ? `Every published report for ${activeProfile.name}.` : undefined}
              flush
            >
              <div className="ix-list">
                {previous.map(report => (
                  <Link key={report.id} href={`/portal/reports/${report.id}`} className="ix-list__item">
                    <div className="ix-list__main">
                      <span className="ix-list__title">{report.title || `Week of ${report.periodStart}`}</span>
                      <span className="ix-list__sub">{report.periodStart} → {report.periodEnd}</span>
                    </div>
                    {report.clientActions && <span className="ix-badge ix-badge--warning">Needs your input</span>}
                    <span className="ix-link">Open</span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="About this service" description="What the Improvexus team is doing for you, and on what terms.">
            <Defs>
              <Def label="Client" value={access.workspace.name} />
              {access.workspace.accountManager && <Def label="Account manager" value={access.workspace.accountManager} />}
              {access.workspace.serviceStartDate && <Def label="Service started" value={access.workspace.serviceStartDate} />}
              <Def label="Managed profiles" value={profiles.map(p => p.name).join(", ") || "None yet"} />
              <Def
                label="Cost to read your reports"
                value="Nothing. Your reports are part of the management service and never require an audit plan."
              />
            </Defs>
          </Panel>
        </>
      )}
    </AppShell>
  );
}
