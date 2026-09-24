import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reportMetrics, reportUpdates, workspaceProfiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { accessErrorResponse, requireReportAccess } from "@/lib/workspace-access";
import { buildMetricRows, NOT_PROVIDED } from "@/lib/report-metrics";

// Download of a published weekly report.
//
// TWO things this route deliberately does NOT do:
//   1. It does not check any audit entitlement, plan, subscription or credit balance. A managed
//      client downloads their own report on the strength of their assignment alone — the brief's
//      "never require payment to view their assigned management reports" requirement, enforced by
//      the absence of a check rather than by a check that happens to pass.
//   2. It does not accept a workspace id from the caller. requireReportAccess resolves the report's
//      own workspace and authorizes that, so a valid member of workspace A cannot pull a report
//      from workspace B by pairing ids.
//
// FORMAT NOTE: this returns a self-contained, printable HTML document rather than a PDF. The audit
// product's PDF pipeline (lib/sample-report.ts, pdf-lib + embedded DejaVu fonts) is built around
// the 23-point audit template and reusing it here would mean either distorting that template or
// writing a second renderer; neither is a five-minute job. HTML downloads cleanly, opens in any
// browser, and prints to PDF. A native PDF export is a known, named gap — not a silent one.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
  try {
    const { access, report } = await requireReportAccess(user, id);
    const db = getDb();

    const [profile] = await db.select().from(workspaceProfiles)
      .where(eq(workspaceProfiles.id, report.workspaceProfileId)).limit(1);
    const [metrics, updates] = await Promise.all([
      db.select().from(reportMetrics).where(eq(reportMetrics.reportId, report.id)),
      db.select().from(reportUpdates)
        .where(eq(reportUpdates.reportId, report.id))
        .orderBy(asc(reportUpdates.createdAt)),
    ]);

    const rows = buildMetricRows(metrics.map(m => ({
      metricKey: m.metricKey, value: m.value, source: m.source,
      periodStart: m.periodStart, periodEnd: m.periodEnd, note: m.note,
    })));

    const html = renderReportHtml({
      workspaceName: access.workspace.name,
      profileName: profile?.name ?? "",
      report,
      rows,
      updates: updates.map(u => ({ body: u.body, requiresClientAction: u.requiresClientAction, createdAt: u.createdAt })),
    });

    const safeName = `${access.workspace.name}-${report.periodStart}-to-${report.periodEnd}`
      .replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").toLowerCase();

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // The filename is built from our own data and then stripped to [a-z0-9-], so nothing a
        // client-supplied value could contain can break out of the header.
        "Content-Disposition": `attachment; filename="improvexus-report-${safeName}.html"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Report export failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "The report could not be exported." }, { status: 500 });
  }
}

// Escapes every interpolation. The report body is admin-authored plain text, and this document is
// handed to a client's browser — so it is escaped on the way out rather than trusted because of
// where it came from.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderReportHtml(data: {
  workspaceName: string;
  profileName: string;
  report: { title: string; periodStart: string; periodEnd: string; overview: string; goals: string; workCompleted: string; nextActions: string; clientActions: string; publishedAt: Date | null };
  rows: ReturnType<typeof buildMetricRows>;
  updates: { body: string; requiresClientAction: boolean; createdAt: Date }[];
}): string {
  const { report } = data;
  const section = (title: string, body: string) =>
    body ? `<section><h2>${esc(title)}</h2><p class="pre">${esc(body)}</p></section>` : "";

  const metricRows = data.rows.map(row => `
    <tr>
      <th scope="row">${esc(row.label)}</th>
      <td class="${row.provided ? "" : "missing"}">${esc(row.display)}</td>
      <td class="meta">${row.provided ? esc(row.sourceLabel ?? "") : ""}</td>
      <td class="meta">${row.provided && row.periodStart ? `${esc(row.periodStart)} → ${esc(row.periodEnd)}` : ""}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(report.title || `Weekly report ${report.periodStart}`)} — Improvexus</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         color: #16181d; background: #fff; margin: 0; padding: 48px 32px; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .brand { font-size: 13px; letter-spacing: .18em; text-transform: uppercase; font-weight: 600; color: #6b21ff; }
  h1 { font-size: 26px; font-weight: 600; margin: 12px 0 4px; }
  h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #6a6f7a;
       margin: 32px 0 8px; font-weight: 600; }
  .sub { color: #6a6f7a; font-size: 14px; margin: 0; }
  .pre { white-space: pre-wrap; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6e8ec; vertical-align: top; }
  th[scope=row] { font-weight: 500; width: 34%; }
  td.missing { color: #8b909a; font-style: italic; }
  td.meta { color: #8b909a; font-size: 13px; }
  .callout { border-left: 3px solid #e0a300; background: #fff9ec; padding: 12px 16px; margin-top: 8px; }
  ul { margin: 8px 0 0; padding-left: 20px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e6e8ec; color: #8b909a; font-size: 12px; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="wrap">
  <p class="brand">Improvexus</p>
  <h1>${esc(report.title || `Week of ${report.periodStart}`)}</h1>
  <p class="sub">${esc(data.workspaceName)}${data.profileName ? ` · ${esc(data.profileName)}` : ""}</p>
  <p class="sub">${esc(report.periodStart)} → ${esc(report.periodEnd)}${
    report.publishedAt ? ` · published ${esc(new Date(report.publishedAt).toLocaleDateString())}` : ""
  }</p>

  ${report.clientActions ? `<h2>Questions for you</h2><div class="callout"><p class="pre">${esc(report.clientActions)}</p></div>` : ""}
  ${section("Profile overview", report.overview)}
  ${section("Current goals", report.goals)}

  <h2>Metrics for this period</h2>
  <table><tbody>${metricRows}</tbody></table>
  <p class="sub" style="margin-top:8px">
    &ldquo;${esc(NOT_PROVIDED)}&rdquo; means no figure was recorded for that metric in this period.
    It does not mean zero.
  </p>

  ${section("Work completed this period", report.workCompleted)}
  ${section("Planned for next week", report.nextActions)}

  ${data.updates.length ? `<h2>Updates</h2><ul>${data.updates.map(u =>
    `<li>${esc(u.body)}${u.requiresClientAction ? " <strong>(action needed)</strong>" : ""}</li>`).join("")}</ul>` : ""}

  <footer>
    Generated by Improvexus for ${esc(data.workspaceName)}. Figures are those recorded by the
    Improvexus team for the stated period.
  </footer>
</div></body></html>`;
}
