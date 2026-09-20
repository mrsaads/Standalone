// LOCAL-ONLY test for reliability check #2 ("Drive or Resend accepts the request but the worker
// crashes before recording success") on the Drive side specifically. Unlike the other local tests,
// this can't run against the real Google Drive API (no credentials in this sandbox — see the
// restart-recovery test's own disclaimer for the same constraint), so the googleapis transport
// layer (`google.drive(...)`) is stubbed with an in-memory fake that speaks just enough of the real
// Drive v3 query language to serve the two call sites in lib/drive.ts: ensureFolder()'s
// name+parent folder lookup, and findExistingUpload()'s auditId+artifactKind property lookup.
// Everything else — fileAuditToDrive() itself, ensureFolder(), findExistingUpload(), the DB
// read/write around driveUploads — is the real, unmodified production code. Only the network edge
// is faked, which is the standard way to test code that calls an external SDK without hitting it.
//
// The scenario under test: a first attempt genuinely uploads the PDF to Drive (the stub records a
// real file), but — simulating a crash between Drive accepting the upload and our own
// driveUploads.pdfStatus write landing — the DB is rolled back to "pending" by hand afterward
// (the same "construct the precondition directly" technique reservation-and-delivery.local-test.mts's
// Test F uses to simulate a crash via a backdated timestamp, rather than actually killing a
// process). A second call to the real fileAuditToDrive() must then find the file Drive already has
// (via findExistingUpload()) and reuse it — never call files.create() for the PDF a second time.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { google } from "googleapis";
import { getDb } from "../../db";
import { driveConnections, driveUploads, profileAudits, profiles } from "../../db/schema";
import { encryptToken } from "../../lib/crypto";

let pass = 0, fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}

// ---- Minimal fake Drive v3 transport -------------------------------------------------------
// Two independent stores: folders (name/parent-keyed, for ensureFolder) and files (properties-
// keyed, for findExistingUpload). `q` is parsed with the same small, deliberate vocabulary
// lib/drive.ts actually emits — not a general Drive query-language parser.
const folders = new Map<string, { name: string; parent: string }>();
const files = new Map<string, { name: string; parents: string[]; properties: Record<string, string> }>();
let folderCreateCalls = 0;
let pdfCreateCalls = 0;
let docxCreateCalls = 0;

function fakeDrive() {
  return {
    files: {
      list: async ({ q }: { q: string }) => {
        if (q.includes("mimeType='application/vnd.google-apps.folder'")) {
          const name = /name='([^']*)'/.exec(q)?.[1] ?? "";
          const parent = /'([^']*)' in parents/.exec(q)?.[1] ?? "";
          const hit = [...folders.entries()].find(([, f]) => f.name === name && f.parent === parent);
          return { data: { files: hit ? [{ id: hit[0], name }] : [] } };
        }
        const auditId = /key='auditId' and value='([^']*)'/.exec(q)?.[1] ?? "";
        const kind = /key='artifactKind' and value='([^']*)'/.exec(q)?.[1] ?? "";
        const parent = /'([^']*)' in parents/.exec(q)?.[1] ?? "";
        const hit = [...files.entries()].find(([, f]) =>
          f.parents.includes(parent) && f.properties.auditId === auditId && f.properties.artifactKind === kind);
        return { data: { files: hit ? [{ id: hit[0], name: hit[1].name }] : [] } };
      },
      create: async ({ requestBody }: { requestBody: { name: string; mimeType?: string; parents?: string[]; properties?: Record<string, string> } }) => {
        if (requestBody.mimeType === "application/vnd.google-apps.folder") {
          folderCreateCalls++;
          const id = `folder-${folderCreateCalls}`;
          folders.set(id, { name: requestBody.name, parent: requestBody.parents?.[0] ?? "" });
          return { data: { id } };
        }
        if (requestBody.properties?.artifactKind === "pdf") pdfCreateCalls++;
        if (requestBody.properties?.artifactKind === "docx") docxCreateCalls++;
        const id = `file-${randomUUID()}`;
        files.set(id, { name: requestBody.name, parents: requestBody.parents ?? [], properties: requestBody.properties ?? {} });
        return { data: { id } };
      },
    },
  };
}

async function main() {
  // Monkey-patch the googleapis factory before any real production code calls it. `google.drive`
  // is a plain writable/configurable own property (verified before writing this test), and
  // lib/drive.ts only ever calls it lazily inside functions — never at module load — so patching
  // it here, before importing lib/drive.ts, is sufficient for every call for the rest of this
  // process's lifetime.
  (google as unknown as { drive: () => unknown }).drive = fakeDrive as unknown as () => unknown;
  process.env.GOOGLE_OAUTH_CLIENT_ID ||= "test-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= "test-client-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||= "http://localhost:3000/api/admin/drive/callback";
  const { fileAuditToDrive } = await import("../../lib/drive");

  const db = getDb();
  const userId = randomUUID();
  await db.execute(sql`insert into auth.users (id) values (${userId})`);
  await db.insert(profiles).values({ id: userId, email: "local-drive-test@example.com", role: "base" });
  const [audit] = await db.insert(profileAudits).values({
    userId, userEmail: "local-drive-test@example.com", profileKey: "profile-drive", contentHash: "hash-drive",
    profileName: "Drive Dedup Test", status: "completed",
  }).returning({ id: profileAudits.id });
  const auditId = audit.id;

  await db.insert(driveConnections).values({
    googleEmail: "owner@example.com",
    refreshTokenEncrypted: encryptToken("fake-refresh-token"),
    rootFolderId: "root",
    connectedByEmail: "owner@example.com",
  });
  // Seed the root folder itself so ensureFolder's first call (userFolder under root) has a stable
  // parent to look under — mirrors what completeConnection() would have created for real.
  folders.set("root", { name: "Improvexus Audits", parent: "" });

  console.log("\nAttempt #1: a normal PDF-only upload succeeds for real (against the fake Drive).");
  const pdfBytes = new Uint8Array(Buffer.from("fake pdf bytes"));
  const first = await fileAuditToDrive({
    auditId, userEmail: "local-drive-test@example.com", profileName: "Drive Dedup Test",
    upworkLink: "", auditDate: "2026-09-20", pdfBytes,
  });
  assert(first.pdfStatus === "succeeded", `first attempt: pdf uploaded (got pdfStatus=${first.pdfStatus})`);
  assert(pdfCreateCalls === 1, `files.create() was called exactly once for the pdf so far (got ${pdfCreateCalls})`);
  const [rowAfterFirst] = await db.select().from(driveUploads).where(eq(driveUploads.auditId, auditId));
  const originalPdfFileId = rowAfterFirst.pdfFileId;
  assert(!!originalPdfFileId, "driveUploads row recorded a real pdf_file_id after the first attempt");

  console.log("Simulating the crash: rolling driveUploads.pdf_status back to 'pending' by hand,");
  console.log("as if the worker died after Drive accepted the upload but before this row was written.");
  await db.update(driveUploads).set({ pdfStatus: "pending" }).where(eq(driveUploads.auditId, auditId));

  console.log("Attempt #2 (the 'retry after crash'): now includes the docx too.");
  const docxBytes = Buffer.from("fake docx bytes");
  const second = await fileAuditToDrive({
    auditId, userEmail: "local-drive-test@example.com", profileName: "Drive Dedup Test",
    upworkLink: "", auditDate: "2026-09-20", pdfBytes, docxBytes,
  });
  assert(pdfCreateCalls === 1, `files.create() for the pdf was NOT called again on retry (still ${pdfCreateCalls} total) — no duplicate file`);
  assert(second.pdfStatus === "succeeded", `retry: pdf ended up succeeded again (got ${second.pdfStatus})`);
  assert(docxCreateCalls === 1, `files.create() for the docx was called exactly once (got ${docxCreateCalls}) — the genuinely-new artifact still uploads`);
  assert(second.filed === true, "retry: fileAuditToDrive() reports the audit as fully filed");

  const [rowAfterRetry] = await db.select().from(driveUploads).where(eq(driveUploads.auditId, auditId));
  assert(rowAfterRetry.pdfFileId === originalPdfFileId,
    `driveUploads.pdf_file_id after retry is the SAME file id as attempt #1 (${rowAfterRetry.pdfFileId} === ${originalPdfFileId}) — reused, not duplicated`);
  assert(rowAfterRetry.pdfStatus === "succeeded" && rowAfterRetry.docxStatus === "succeeded",
    `driveUploads row correctly shows both formats succeeded after retry (got pdf=${rowAfterRetry.pdfStatus}, docx=${rowAfterRetry.docxStatus})`);

  // Cross-check against the fake Drive's own file store: exactly one pdf and one docx file exist
  // for this auditId, no matter how many times fileAuditToDrive() was called.
  const filesForAudit = [...files.values()].filter(f => f.properties.auditId === auditId);
  const pdfFiles = filesForAudit.filter(f => f.properties.artifactKind === "pdf");
  const docxFiles = filesForAudit.filter(f => f.properties.artifactKind === "docx");
  assert(pdfFiles.length === 1 && docxFiles.length === 1,
    `exactly one pdf and one docx file exist in Drive for this audit after the crash+retry cycle (got pdf=${pdfFiles.length}, docx=${docxFiles.length})`);

  await db.delete(driveUploads).where(eq(driveUploads.auditId, auditId));
  await db.delete(profileAudits).where(eq(profileAudits.id, auditId));
  await db.delete(driveConnections);
  await db.delete(profiles).where(eq(profiles.id, userId));
  await db.execute(sql`delete from auth.users where id = ${userId}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(error => { console.error("Test run crashed:", error); process.exit(1); });
