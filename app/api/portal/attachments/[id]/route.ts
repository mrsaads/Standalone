import { getCurrentUser } from "@/lib/auth";
import { accessErrorResponse, requireAttachmentAccess } from "@/lib/workspace-access";
import { streamDriveFile } from "@/lib/drive";

// Download of one report attachment.
//
// requireAttachmentAccess enforces all three conditions server-side — the caller has an active
// assignment to the attachment's OWN workspace, the report it hangs off is published, and the
// attachment is marked client-visible. An internal attachment on a published report is refused,
// and every refusal is an identical 404 so this route cannot be used to enumerate what exists.
//
// STATUS: attachment storage is Google Drive (chosen deliberately, to reuse the Drive pipeline the
// audit product already has). Google OAuth is not configured on this project yet, so the fetch
// below has never run against real Drive. When it is unconfigured this returns an explicit 503
// saying so — it never returns a placeholder file, and never pretends an attachment is missing when
// the real problem is that the integration is not set up.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
  try {
    const { attachment } = await requireAttachmentAccess(user, id);

    if (attachment.storageProvider !== "drive" || !attachment.driveFileId) {
      return Response.json(
        { error: "This attachment is not available for download yet." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const file = await streamDriveFile(attachment.driveFileId);
    if (!file.ok) {
      return Response.json(
        {
          error: file.reason === "not_configured"
            ? "File downloads are not available yet: the Google Drive connection has not been set up."
            : "This attachment could not be retrieved.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    // The stored filename is quoted and stripped of anything that could terminate the header value
    // or inject a second directive.
    const safeName = attachment.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment";
    return new Response(file.body, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store",
        // These files are private client material; make sure nothing downstream treats the body as
        // something to sniff and render inline.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Attachment download failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "This attachment could not be retrieved." }, { status: 500 });
  }
}
