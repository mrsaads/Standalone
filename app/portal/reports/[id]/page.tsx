import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq, and, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { reportAttachments, reportMetrics, reportUpdates, weeklyReports, workspaceProfiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getShellNav } from "@/lib/shell-data";
import { requireReportAccess, WorkspaceAccessError } from "@/lib/workspace-access";
import { buildMetricRows, NOT_PROVIDED } from "@/lib/report-metrics";
import { AppShell, PageHead } from "../../../app-shell";

export const dynamic = "force-dynamic";

// One published weekly report.
//
// `requireReportAccess` resolves the report's OWN workspace and authorizes that — the caller never
// gets to say which workspace this report belongs to. A draft, or a report in someone else's
// workspace, is refused identically (as not-found), so this page cannot be used to probe for what
// exists.
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
  const anyProvided = rows.some(r => r.provided);
  const actionItems = updates.filter(u => u.requiresClientAction);

  return (
    <AppShell nav={nav}>
      <p style={{ marginBottom: 12 }}>
        <Link href={`/portal?workspace=${access.workspace.id}&profile=${report.workspaceProfileId}`} className="ix-link">
          ← {access.workspace.name}
        </Link>
      </p>

      <PageHead
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
      {actionItems.length > 0 && (
        <div className="ix-notice ix-notice--warning" style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <div>
            <strong>Needs your input</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {actionItems.map(item => <li key={item.id} style={{ marginBottom: 4 }}>{item.body}</li>)}
            </ul>
          </div>
        </div>
      )}
      {report.clientActions && (
        <div className="ix-notice ix-notice--warning" style={{ marginBottom: "var(--ix-gap-lg)" }}>
          <div><strong>Questions for you</strong><p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{report.clientActions}</p></div>
        </div>
      )}

      <div className="ix-stack ix-stack--lg">
        {report.overview && <Section title="Profile overview" body={report.overview} />}
        {report.goals && <Section title="Current goals" body={report.goals} />}

        <section className="ix-stack" aria-labelledby="ix-metrics">
          <h2 id="ix-metrics" className="ix-section-title">Metrics for this period</h2>
          {!anyProvided ? (
            <div className="ix-empty">
              <h3>No metrics recorded for this period</h3>
              <p>
                Nothing was entered for this report. That is different from a measurement of zero —
                every metric below would say &ldquo;{NOT_PROVIDED}&rdquo;, so none are shown.
              </p>
            </div>
          ) : (
            <div className="ix-grid-3">
              {rows.map(row => (
                <div key={row.key} className="ix-tile">
                  <div className="ix-stat">
                    <span className="ix-stat__label">{row.label}</span>
                    <span className="ix-stat__value" style={!row.provided ? { color: "var(--ix-muted)", fontSize: 15 } : undefined}>
                      {row.display}
                    </span>
                    {/* A comparison is rendered only when one is genuinely meaningful. */}
                    {row.provided && row.comparison.kind !== "incomparable" && (
                      <span
                        className="ix-stat__note"
                        style={{
                          color: row.comparison.direction === "up" ? "var(--ix-positive)"
                            : row.comparison.direction === "down" ? "var(--ix-danger)"
                            : "var(--ix-muted)",
                        }}
                      >
                        {row.comparison.label} vs previous period
                      </span>
                    )}
                    {row.provided && row.sourceLabel && (
                      <span className="ix-stat__note">{row.sourceLabel}</span>
                    )}
                    {row.provided && (row.periodStart || row.periodEnd) && (
                      <span className="ix-stat__note">{row.periodStart} → {row.periodEnd}</span>
                    )}
                    {row.note && <span className="ix-stat__note">{row.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {report.workCompleted && <Section title="Work completed this period" body={report.workCompleted} />}
        {report.nextActions && <Section title="Planned for next week" body={report.nextActions} />}

        {updates.length > 0 && (
          <section className="ix-stack" aria-labelledby="ix-updates">
            <h2 id="ix-updates" className="ix-section-title">Updates</h2>
            <div className="ix-list">
              {updates.map(update => (
                <div key={update.id} className="ix-list__item">
                  <div className="ix-list__main">
                    <span style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{update.body}</span>
                    <span className="ix-list__sub">{new Date(update.createdAt).toLocaleDateString()}</span>
                  </div>
                  {update.requiresClientAction && <span className="ix-badge ix-badge--warning">Action needed</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="ix-stack" aria-labelledby="ix-attachments">
          <h2 id="ix-attachments" className="ix-section-title">Attachments</h2>
          {attachments.length === 0 ? (
            <div className="ix-empty"><p>No attachments were shared on this report.</p></div>
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
        </section>
      </div>
    </AppShell>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  const id = `ix-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="ix-stack" aria-labelledby={id}>
      <h2 id={id} className="ix-section-title">{title}</h2>
      {/* Stored as plain text and rendered as a text node — React escapes it, so nothing an admin
          types can become markup in a client's browser. */}
      <div className="ix-card" style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.65 }}>{body}</div>
    </section>
  );
}
