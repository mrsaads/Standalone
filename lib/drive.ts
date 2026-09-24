import { google } from "googleapis";
import { Readable } from "node:stream";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { driveConnections, driveUploads } from "@/db/schema";
import { encryptToken, decryptToken } from "@/lib/crypto";

// This is the website's own Google Drive integration — a single owner-account OAuth connection
// made once from the admin panel, independent of anything a customer might connect inside
// ChatGPT. Customers never see or trigger Google auth; every audit is filed into the owner's
// Drive automatically after generation. Scope is drive.file (minimum necessary): the app can only
// see and manage files/folders it itself creates, never the rest of the owner's Drive.
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const ROOT_FOLDER_NAME = "Improvexus Audits";

function oauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Drive is not configured (missing GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI).");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getConnectUrl(state: string) {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force a refresh_token even on a re-connect from the same Google account
    scope: SCOPES,
    state,
  });
}

async function activeConnection() {
  const db = getDb();
  const [row] = await db.select().from(driveConnections).where(isNull(driveConnections.revokedAt)).limit(1);
  return row ?? null;
}

// Exchanges the OAuth callback code for tokens, creates (or reuses) the root "Improvexus Audits"
// folder, and stores the encrypted refresh token as the single owner connection. Any previous
// connection row is marked revoked rather than deleted, keeping a connection history.
export async function completeConnection(code: string, connectedByEmail: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove Improvexus's access at myaccount.google.com/permissions and reconnect so Google issues a fresh one.");
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data: profile } = await oauth2.userinfo.get();

  const drive = google.drive({ version: "v3", auth: client });
  const existing = await drive.files.list({
    q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  const rootFolderId = existing.data.files?.[0]?.id
    ?? (await drive.files.create({ requestBody: { name: ROOT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }, fields: "id" })).data.id;
  if (!rootFolderId) throw new Error("The Improvexus Audits root folder could not be created in Google Drive.");

  const db = getDb();
  await db.update(driveConnections).set({ revokedAt: new Date() }).where(isNull(driveConnections.revokedAt));
  await db.insert(driveConnections).values({
    googleEmail: profile.email || "unknown",
    refreshTokenEncrypted: encryptToken(tokens.refresh_token),
    rootFolderId,
    connectedByEmail,
  });
  return { googleEmail: profile.email || "unknown" };
}

async function driveClient() {
  const connection = await activeConnection();
  if (!connection) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptToken(connection.refreshTokenEncrypted) });
  // googleapis transparently calls the token endpoint with this refresh_token whenever the access
  // token is missing/expired — no manual refresh bookkeeping needed here.
  return { drive: google.drive({ version: "v3", auth: client }), connection };
}

export async function getDriveConnectionStatus() {
  const connection = await activeConnection();
  if (!connection) return { connected: false as const };
  // A cheap call that exercises the stored refresh token, so a revoked/expired grant surfaces here
  // (as an error we catch) rather than only failing later during an actual upload.
  try {
    const client = oauthClient();
    client.setCredentials({ refresh_token: decryptToken(connection.refreshTokenEncrypted) });
    await client.getAccessToken();
    return { connected: true as const, googleEmail: connection.googleEmail, connectedAt: connection.connectedAt };
  } catch {
    return { connected: false as const, expired: true as const, googleEmail: connection.googleEmail };
  }
}

async function ensureFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string) {
  const escaped = name.replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });
  const found = existing.data.files?.[0]?.id;
  if (found) return found;
  const created = await drive.files.create({ requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id" });
  if (!created.data.id) throw new Error(`The "${name}" Drive folder could not be created.`);
  return created.data.id;
}

function sanitizeSegment(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 100) || "Unnamed";
}

// Drive has no client-supplied idempotency-key concept the way Resend does (see lib/email.ts's
// comment on sendAuditReadyEmail for that mechanism) — there is no header that makes a second
// files.create() call for the same logical upload collapse into the first. So the guard has to be
// a pre-check against Drive's own actual state instead: before creating a file, ask Drive whether
// a file tagged with this exact auditId + artifactKind already exists in the target folder. This
// is what closes "Drive accepts the create but the worker crashes before driveUploads is updated":
// on retry, fileAuditToDrive() re-runs with pdfStatus/docxStatus still "pending" (our own row never
// recorded the success), so without this check it would blindly create a second PDF/DOCX. With it,
// the retry finds the first upload still sitting in Drive (tagged by the properties set atomically
// at creation time — see fileAuditToDrive below) and reuses its file id instead of uploading again.
async function findExistingUpload(drive: ReturnType<typeof google.drive>, auditFolder: string, auditId: string, kind: "pdf" | "docx") {
  const existing = await drive.files.list({
    q: `'${auditFolder}' in parents and trashed=false and properties has { key='auditId' and value='${auditId}' } and properties has { key='artifactKind' and value='${kind}' }`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  return existing.data.files?.[0]?.id ?? undefined;
}

// Uploads one audit's PDF and DOCX into a Drive path shaped
// "Improvexus Audits / <user email> / <profile name> / <audit date> — <audit id short>/",
// tagged with the Upwork link and audit date as file properties (Drive's key/value custom
// metadata). Only the not-yet-succeeded half of a pair is re-uploaded on retry — see
// driveUploads' per-format status columns — so a retry can never create a duplicate file for a
// format that already succeeded, and a Drive outage never blocks the customer's own PDF/DOCX
// download, which happens client-side and does not depend on this function at all.
export async function fileAuditToDrive(params: {
  auditId: string;
  userEmail: string;
  profileName: string;
  upworkLink: string;
  auditDate: string;
  pdfBytes?: Uint8Array;
  docxBytes?: Buffer;
}) {
  const db = getDb();
  const client = await driveClient();
  const [existingRow] = await db.select().from(driveUploads).where(eq(driveUploads.auditId, params.auditId)).limit(1);
  const row = existingRow ?? (await db.insert(driveUploads).values({ auditId: params.auditId }).returning())[0];

  if (!client) {
    await db.update(driveUploads).set({ lastError: "Google Drive is not connected.", attempts: row.attempts + 1, updatedAt: new Date() }).where(eq(driveUploads.id, row.id));
    return { filed: false, reason: "not_connected" as const };
  }

  const { drive, connection } = client;
  const properties = { upworkLink: params.upworkLink || "not supplied", auditDate: params.auditDate, auditId: params.auditId };
  let pdfFileId = row.pdfFileId ?? undefined;
  let docxFileId = row.docxFileId ?? undefined;
  let pdfStatus = row.pdfStatus;
  let docxStatus = row.docxStatus;
  let lastError: string | null = null;

  try {
    const userFolder = await ensureFolder(drive, connection.rootFolderId, sanitizeSegment(params.userEmail));
    const profileFolder = await ensureFolder(drive, userFolder, sanitizeSegment(params.profileName || "Upwork profile"));
    const auditFolder = await ensureFolder(drive, profileFolder, `${params.auditDate} — ${params.auditId.slice(0, 8)}`);

    if (params.pdfBytes && pdfStatus !== "succeeded") {
      try {
        const already = await findExistingUpload(drive, auditFolder, params.auditId, "pdf");
        if (already) {
          pdfFileId = already;
          pdfStatus = "succeeded";
        } else {
          const uploaded = await drive.files.create({
            requestBody: { name: "Improvexus Audit Report.pdf", parents: [auditFolder], properties: { ...properties, artifactKind: "pdf" } },
            media: { mimeType: "application/pdf", body: bufferToStream(Buffer.from(params.pdfBytes)) },
            fields: "id",
          });
          pdfFileId = uploaded.data.id ?? undefined;
          pdfStatus = "succeeded";
        }
      } catch (error) {
        pdfStatus = "failed";
        lastError = error instanceof Error ? error.message : "PDF upload failed.";
      }
    }

    if (params.docxBytes && docxStatus !== "succeeded") {
      try {
        const already = await findExistingUpload(drive, auditFolder, params.auditId, "docx");
        if (already) {
          docxFileId = already;
          docxStatus = "succeeded";
        } else {
          const uploaded = await drive.files.create({
            requestBody: { name: "Improvexus Audit Report.docx", parents: [auditFolder], properties: { ...properties, artifactKind: "docx" } },
            media: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: bufferToStream(params.docxBytes) },
            fields: "id",
          });
          docxFileId = uploaded.data.id ?? undefined;
          docxStatus = "succeeded";
        }
      } catch (error) {
        docxStatus = "failed";
        lastError = error instanceof Error ? error.message : "DOCX upload failed.";
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "The Drive folder structure could not be prepared.";
  }

  await db.update(driveUploads).set({
    pdfStatus, docxStatus, pdfFileId, docxFileId,
    attempts: row.attempts + 1, lastError, updatedAt: new Date(),
  }).where(eq(driveUploads.id, row.id));

  return { filed: pdfStatus === "succeeded" && docxStatus === "succeeded", pdfStatus, docxStatus, lastError };
}

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}

// Streams one Drive file back to the caller, for the managed-client portal's attachment download
// (app/api/portal/attachments/[id]/route.ts). Authorization is NOT done here — it has already
// happened, in lib/workspace-access.ts, before this is called; this function only knows how to
// fetch bytes.
//
// Returns a discriminated result rather than throwing, so the route can tell "Drive is not set up
// on this deployment" (a configuration problem the user should be told about plainly) apart from
// "that file is gone" (a data problem), and never reports one as the other.
export async function streamDriveFile(fileId: string): Promise<
  | { ok: true; body: ReadableStream<Uint8Array> }
  | { ok: false; reason: "not_configured" | "unavailable" }
> {
  let client: Awaited<ReturnType<typeof driveClient>>;
  try {
    client = await driveClient();
  } catch {
    // oauthClient() throws when GOOGLE_OAUTH_* is unset — i.e. Drive was never configured on this
    // deployment at all, which is the current state of this project.
    return { ok: false, reason: "not_configured" };
  }
  if (!client) return { ok: false, reason: "not_configured" };

  try {
    const response = await client.drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    );
    const nodeStream = response.data as unknown as NodeJS.ReadableStream;
    // Node stream -> web ReadableStream, which is what a Response body wants. Streamed rather than
    // buffered so a large attachment never has to sit in the server's memory in one piece.
    const { Readable } = await import("node:stream");
    return { ok: true, body: Readable.toWeb(nodeStream as never) as ReadableStream<Uint8Array> };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
