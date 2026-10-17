import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { profileAudits } from "@/db/schema";
import type { AuditReport } from "@/lib/audit-report";
import { entitlementFor } from "@/lib/entitlements";
import { entitlementForAudit } from "@/lib/audit-payments";
import { createAuditPdf, createAuditDocxBuffer } from "@/lib/sample-report";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
const safeFilename = (value: string) => (value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "Upwork-Profile-Audit");

// Server-side PDF/Word export for a saved audit. Split out from GET /api/audits/[id] (which returns
// the redacted report JSON for on-screen review) so downloading can be gated independently: a
// free-tier account can review its full audit on-screen but cannot download the file — see
// lib/entitlements.ts. Reuses the exact same createAuditPdf/createAuditDocxBuffer builders the
// Google Drive filing path already uses (lib/delivery-worker.ts), so the downloaded file is
// byte-for-byte the same document either path produces.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "pdf" && format !== "docx") return json({ error: "Add ?format=pdf or ?format=docx." }, 400);

  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(profileAudits).where(eq(profileAudits.id, id)).limit(1);
  if (!row) return json({ error: "Audit not found." }, 404);
  if (row.userId !== user.id && user.role !== "admin") return json({ error: "Audit not found." }, 404);
  if (row.status !== "completed") return json({ error: "This audit has not finished generating." }, 409);

  const entitlement = await entitlementForAudit(entitlementFor(user), row.id);
  if (!entitlement.canDownload) {
    return json({
      error: "Unlock this report to download the PDF or Word file.",
      code: "UPGRADE_REQUIRED",
    }, 403);
  }

  const report = JSON.parse(row.reportJson) as AuditReport;
  const filename = safeFilename(report.reportName || row.profileName || "Upwork-Profile-Audit");

  if (format === "pdf") {
    const bytes = await createAuditPdf(report);
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` },
    });
  }
  const buffer = await createAuditDocxBuffer(report);
  return new Response(new Uint8Array(buffer), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}.docx"`,
    },
  });
}
