import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/http";
import { logAdminAction } from "@/lib/admin-log";
import { AdminClientError, publishReport, setReportMetric, unpublishReport, updateReport } from "@/lib/admin-clients";
import { isMetricKey } from "@/lib/report-metrics";
import { isUuid } from "@/lib/workspace-access";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    title: z.string().trim().max(160).optional(),
    overview: z.string().trim().max(4000).optional(),
    goals: z.string().trim().max(4000).optional(),
    workCompleted: z.string().trim().max(6000).optional(),
    nextActions: z.string().trim().max(4000).optional(),
    clientActions: z.string().trim().max(4000).optional(),
  }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("unpublish") }).strict(),
  z.object({
    action: z.literal("set_metric"),
    metricKey: z.string(),
    // `null` is a first-class value here, not an absence: it clears the metric back to
    // "Not provided". It is NOT the same as 0, which is a real measurement — see
    // lib/report-metrics.ts and the reportMetrics comment in db/schema.ts.
    value: z.number().finite().nullable(),
    note: z.string().trim().max(300).optional().default(""),
  }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Admin access required." }, 403);
  if (!isTrustedOrigin(request)) return json({ error: "Start this action from the admin panel." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Invalid request." }, 415);

  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Report not found." }, 404);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "The request could not be read." }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Check the details you entered." }, 400);
  const data = parsed.data;

  try {
    if (data.action === "update") {
      const { action: _action, ...patch } = data;
      if (Object.keys(patch).length === 0) return json({ error: "Nothing to change." }, 400);
      await updateReport(id, patch);
      await logAdminAction(user.email, "weekly_report_updated", "weekly_report", id, Object.keys(patch).join(", "));
      return json({ ok: true }, 200);
    }

    if (data.action === "publish") {
      const result = await publishReport(id, user.email);
      await logAdminAction(user.email, "weekly_report_published", "weekly_report", id, `${result.notified} notified of ${result.activeMembers} active members`);
      // `notified` is rows actually inserted, so a re-publish honestly reports 0 rather than
      // claiming to have told people who already knew.
      return json({
        ok: true,
        notified: result.notified,
        activeMembers: result.activeMembers,
        workspaceSuspended: result.workspaceSuspended,
      }, 200);
    }

    if (data.action === "unpublish") {
      await unpublishReport(id);
      await logAdminAction(user.email, "weekly_report_unpublished", "weekly_report", id);
      return json({ ok: true }, 200);
    }

    if (!isMetricKey(data.metricKey)) return json({ error: "Unknown metric." }, 400);
    await setReportMetric(id, data.metricKey, data.value, data.note);
    await logAdminAction(user.email, "weekly_report_metric", "weekly_report", id, `${data.metricKey} = ${data.value === null ? "Not provided" : data.value}`);
    return json({ ok: true }, 200);
  } catch (cause) {
    if (cause instanceof AdminClientError) return json({ error: cause.message }, cause.status);
    throw cause;
  }
}
