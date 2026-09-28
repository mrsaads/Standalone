import { notFound, redirect } from "next/navigation";
import { asc, desc, eq, and, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { reportAttachments, reportMetrics, reportUpdates, weeklyReports, workspaceProfiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getShellNav } from "@/lib/shell-data";
import { requireReportAccess, WorkspaceAccessError } from "@/lib/workspace-access";
import { buildMetricRows, NOT_PROVIDED } from "@/lib/report-metrics";
import { AppShell, PageHead, Panel, StatCard, Stats } from "../../../app-shell";

export const dynamic = "force-dynamic";

// One published weekly report.
//
// `requireReportAccess` resolves the report's OWN workspace and authorizes that — the caller never
// gets to say which workspace this report belongs to. A draft, or a report in someone else's
// workspace, is refused identically (as not-found), so this page cannot be used to probe for what
// exists.
//
// Read on a narrow measure: this is a document, and a paragraph set across 1080px is uncomfortable
// to read. The metrics get the full width because they are scanned, not read.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  let resolved;
  try {
    resolved = await requireReportAccess(user, id);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) notFound();
    throw error;
  }
  const { access, report } = resolved;
  const { nav } = await getShellNav(user);

  const db = getDb();
  const [profile] = await db.select().from(workspaceProfiles)
    .where(eq(workspaceProfiles.id, report.workspaceProfileId)).limit(1);

  // The immediately preceding PUBLISHED report for the same profile, used for period-over-period
  // comparison. Drafts are excluded so an unpublished week cannot become a client-visible baseline.
  const [priorReport] = await db.select({ id: weeklyReports.id })
    .from(weeklyReports)
    .where(and(
      eq(weeklyReports.workspaceProfileId, report.workspaceProfileId),
      eq(weeklyReports.status, "published"),
      lt(weeklyReports.periodEnd, report.periodEnd),
    ))
    .orderBy(desc(weeklyReports.periodEnd))
    .limit(1);

  const [metrics, priorMetrics, updates, attachments] = await Promise.all([
    db.select().from(reportMetrics).where(eq(reportMetrics.reportId, report.id)),
    priorReport
      ? db.select({ metricKey: reportMetrics.metricKey, value: reportMetrics.value })
          .from(reportMetrics).where(eq(reportMetrics.reportId, priorReport.id))
      : Promise.resolve([]),
    db.select().from(reportUpdates)
      .where(eq(reportUpdates.reportId, report.id)).orderBy(asc(reportUpdates.createdAt)),
    db.select().from(reportAttachments)
      .where(and(
        eq(reportAttachments.reportId, report.id),
        // Client-visible only, filtered in SQL. An internal attachment is never selected here.
        eq(reportAttachments.visibleToClient, true),
      )),
  ]);

  const rows = buildMetricRows(
    metrics.map(m => ({
      metricKey: m.metricKey, value: m.value, source: m.source,
      periodStart: m.periodStart, periodEnd: m.periodEnd, note: m.note,
    })),
    priorMetrics,
  );
  const provided = rows.filter(r => r.provided);
  const missing = rows.filter(r => !r.provided);
  const actionItems = updates.filter(u => u.requiresClientAction);
  const plainUpdates = updates.filter(u => !u.requiresClientAction);

  return (
    <AppShell nav={nav} narrow>
      <PageHead
        back={{
          href: `/portal?workspace=${access.workspace.id}&profile=${report.workspaceProfileId}`,
          label: access.workspace.name,
        }}
        title={report.title || `Week of ${report.periodStart}`}
        description={<>
          {profile?.name && <>{profile.name} · </>}
          {report.periodStart} → {report.periodEnd}
          {report.publishedAt && <> · published {new Date(report.publishedAt).toLocaleDateString()}</>}
        </>}
        actions={
          // Downloadable by the assigned client with no entitlement check whatsoever.
          <a href={`/api/portal/reports/${report.id}/export`} className="ix-btn ix-btn--secondary">
            Download report
          </a>
        }
      />

      {/* Things the client needs to do are hoisted above everything else — burying them under the
          numbers is how they get missed. */}
      {(actionItems.length > 0 || report.clientActions) && (
        <div className="ix-notice ix-notice--warning" style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <div>
            <strong>Needs your input</strong>
            {report.clientActions && <p className="ix-prose" style={{ marginTop: 6 }}>{report.clientActions}</p>}
            {actionItems.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {actionItems.map(item => <li key={item.id} style={{ marginBottom: 4 }}>{item.body}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {provided.length > 0 && (
        <div style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <Stats>
            {provided.map(row => (
              <StatCard
                key={row.key}
                label={row.label}
                value={row.display}
                // A comparison is rendered only when one is genuinely meaningful — never against a
                // missing previous value, and never as a percentage of zero.
                note={row.comparison.kind !== "incomparable"
                  ? `${row.comparison.label} vs previous period`
                  : row.sourceLabel || undefined}
                tone={row.comparison.kind !== "incomparable"
                  ? (row.comparison.direction === "up" ? "positive" : row.comparison.direction === "down" ? "attention" : undefined)
                  : undefined}
              />
            ))}
          </Stats>
        </div>
      )}

      {report.overview && <Section title="Profile overview" body={report.overview} />}
      {report.goals && <Section title="Goals for this period" body={report.goals} />}
      {report.workCompleted && <Section title="Work completed" body={report.workCompleted} />}
      {report.nextActions && <Section title="Planned for next period" body={report.nextActions} />}

      {plainUpdates.length > 0 && (
        <Panel title="Updates" description="Notes from your account manager on this period." flush>
          <div className="ix-list">
            {plainUpdates.map(update => (
              <div key={update.id} className="ix-list__item">
                <div className="ix-list__main">
                  <span className="ix-prose" style={{ fontSize: 14 }}>{update.body}</span>
                  <span className="ix-list__sub">{new Date(update.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        title="Attachments"
        description={attachments.length > 0 ? "Files your account manager shared on this report." : undefined}
        flush={attachments.length > 0}
      >
        {attachments.length === 0 ? (
          <p className="ix-none">No attachments were shared on this report.</p>
        ) : (
          <div className="ix-list">
            {attachments.map(file => (
              <a key={file.id} href={`/api/portal/attachments/${file.id}`} className="ix-list__item">
                <div className="ix-list__main">
                  <span className="ix-list__title">{file.fileName}</span>
                  <span className="ix-list__sub">
                    {file.sizeBytes > 0 ? `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB` : "File"}
                  </span>
                </div>
                <span className="ix-link">Download</span>
              </a>
            ))}
          </div>
        )}
      </Panel>

      {/* What was NOT measured is stated rather than left as a gap the reader has to notice. A
          metric nobody entered is not a measurement of zero, and this page never lets the two blur. */}
      {missing.length > 0 && (
        <Panel title="Not measured this period" description={`These were left blank on this report, which is different from a measurement of zero.`}>
          <p className="ix-none">
            {missing.map(r => r.label).join(" · ")} — each would read &ldquo;{NOT_PROVIDED}&rdquo;.
          </p>
        </Panel>
      )}
    </AppShell>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <Panel title={title}>
      {/* Stored as plain text and rendered as a text node — React escapes it, so nothing an admin
          types can become markup in a client's browser. */}
      <p className="ix-prose">{body}</p>
    </Panel>
  );
}
