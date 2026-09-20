import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profileAudits } from "@/db/schema";
import { createAuditPdf, createAuditDocxBuffer } from "@/lib/sample-report";
import { fileAuditToDrive } from "@/lib/drive";
import { sendAuditReadyEmail } from "@/lib/email";
import type { AuditReport } from "@/lib/audit-report";

// Runs the two post-generation delivery steps for one saved audit — filing the PDF/DOCX to the
// owner's Google Drive and emailing the customer that their report is ready — and is safe to call
// more than once for the same auditId: fileAuditToDrive() only re-uploads whichever of PDF/DOCX
// hasn't already succeeded (driveUploads' per-format status), and sendAuditReadyEmail() is a
// no-op once emailNotifications already shows "sent" for that audit. Neither ever touches the
// weekly allowance or re-runs AI generation, and neither failing changes the customer's own
// PDF/DOCX download, which is generated client-side straight from the report already in hand.
export async function deliverAuditArtifacts(auditId: string, appOrigin: string) {
  const db = getDb();
  const [row] = await db.select().from(profileAudits).where(eq(profileAudits.id, auditId)).limit(1);
  if (!row) return { ok: false, error: "Audit not found." };

  const report = JSON.parse(row.reportJson) as AuditReport;
  const auditDate = row.createdAt.toISOString().slice(0, 10);

  let pdfBytes: Uint8Array | undefined;
  let docxBytes: Buffer | undefined;
  try {
    pdfBytes = await createAuditPdf(report);
    docxBytes = await createAuditDocxBuffer(report);
  } catch (error) {
    console.error("Report file generation for delivery failed", error instanceof Error ? error.name : "UnknownError");
  }

  const drive = await fileAuditToDrive({
    auditId,
    userEmail: row.userEmail,
    profileName: row.profileName,
    upworkLink: row.profileUrl,
    auditDate,
    pdfBytes,
    docxBytes,
  });

  const email = await sendAuditReadyEmail({
    auditId,
    userEmail: row.userEmail,
    profileName: row.profileName,
    reportUrl: `${appOrigin}/?openAudit=${auditId}`,
  });

  return { ok: true, drive, email };
}
