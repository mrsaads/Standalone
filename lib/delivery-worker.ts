import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { deliveryJobs, profileAudits } from "@/db/schema";
import { createAuditPdf, createAuditDocxBuffer } from "@/lib/sample-report";
import { fileAuditToDrive } from "@/lib/drive";
import { sendAuditReadyEmail } from "@/lib/email";
import { RESERVATION_STALE_MINUTES } from "@/lib/audit-limit";
import type { AuditReport } from "@/lib/audit-report";

// Persisted delivery queue + in-process worker. Replaces the earlier design where Drive filing and
// the "audit ready" email were kicked off as a fire-and-forget promise living only in the Node
// process's memory: if that process restarted before the promise settled, the work was simply
// gone — nothing on disk recorded that it still needed to happen. Every unit of work is now a row
// in `delivery_jobs` (db/schema.ts), and the worker below is a plain polling loop that claims,
// processes, and marks rows done. A restart just means the next tick picks the row back up from
// the database; nothing is lost, and nothing is redone that already succeeded (see idempotency
// notes below).
const POLL_INTERVAL_MS = 5000;
// How long a job may sit "processing" before it's assumed to belong to a worker that crashed or
// was killed mid-job, and becomes claimable again. Generous relative to how long one delivery
// attempt (a Drive upload + an email send) actually takes, so a live, healthy worker's own job is
// never reclaimed out from under it. Overridable via env only so the restart-recovery local test
// (scripts/local-tests/) can use a short window instead of waiting 10 real minutes — production
// deploys should leave this unset and get the 10-minute default.
const CLAIM_STALE_MINUTES = process.env.DELIVERY_CLAIM_STALE_MINUTES !== undefined
  ? Number(process.env.DELIVERY_CLAIM_STALE_MINUTES) // `|| 10` would be wrong here: "0" is a legitimate override and `0 || 10` evaluates to 10, silently ignoring it
  : 10;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 1800; // 30 minutes

type DeliveryJobRow = typeof deliveryJobs.$inferSelect;

// Idempotent: the unique (audit_id, kind) index means calling this twice for the same audit
// (automatic enqueue after generation, then later an admin manual retry) creates at most one job
// per kind — the second call is a no-op via ON CONFLICT DO NOTHING.
export async function enqueueDelivery(auditId: string) {
  const db = getDb();
  await db.insert(deliveryJobs).values([
    { auditId, kind: "drive" },
    { auditId, kind: "email" },
  ]).onConflictDoNothing({ target: [deliveryJobs.auditId, deliveryJobs.kind] });
}

// Used by the admin panel's manual "retry delivery" action: makes sure jobs exist (in case this is
// the very first attempt) and forces any failed/stuck job back to pending, claimable immediately —
// so "retry" always means "try again now," even for a job that already exhausted its automatic
// attempts.
export async function requeueDelivery(auditId: string) {
  await enqueueDelivery(auditId);
  const db = getDb();
  await db.update(deliveryJobs).set({ status: "pending", nextAttemptAt: new Date(), lastError: null, attempts: 0 })
    .where(and(eq(deliveryJobs.auditId, auditId), inArray(deliveryJobs.status, ["failed", "processing"])));
}

// Atomically claims exactly one job: either a due pending job, or one stuck "processing" past
// CLAIM_STALE_MINUTES (its worker died mid-job — this is the restart-recovery path). The
// UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) shape is what makes this safe under
// concurrent claimers: two workers (or the same worker racing its own restart) running this at the
// same instant can never both come back with the same row — one gets it, the other's subquery
// skips the locked row and finds the next one (or none).
export async function claimNextJob(): Promise<DeliveryJobRow | undefined> {
  const db = getDb();
  const rows = await db.execute<DeliveryJobRow>(sql`
    update delivery_jobs
    set status = 'processing', locked_at = now(), lock_token = gen_random_uuid(),
        attempts = attempts + 1, updated_at = now()
    where id = (
      select id from delivery_jobs
      where attempts < max_attempts
        and (
          (status = 'pending' and next_attempt_at <= now())
          or (status = 'processing' and locked_at < now() - interval '${sql.raw(String(CLAIM_STALE_MINUTES))} minutes')
        )
      order by next_attempt_at asc
      limit 1
      for update skip locked
    )
    returning *;
  `);
  return rows[0];
}

async function markSucceeded(jobId: string) {
  const db = getDb();
  await db.update(deliveryJobs).set({ status: "succeeded", lastError: null, updatedAt: new Date() }).where(eq(deliveryJobs.id, jobId));
}

async function markFailed(job: DeliveryJobRow, error: unknown) {
  const db = getDb();
  const message = error instanceof Error ? error.message : "Delivery failed.";
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffSeconds = Math.min(BACKOFF_BASE_SECONDS * 2 ** (job.attempts - 1), BACKOFF_MAX_SECONDS);
  await db.update(deliveryJobs).set({
    status: exhausted ? "failed" : "pending",
    nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
    lastError: message,
    updatedAt: new Date(),
  }).where(eq(deliveryJobs.id, job.id));
}

// The actual delivery work for one job. Both branches call functions (fileAuditToDrive,
// sendAuditReadyEmail) that are themselves idempotent against their own status tables
// (drive_uploads' per-format status, email_notifications' sent/failed status) — so even in the
// unlikely case that the same job is processed twice (e.g. a claim's UPDATE commits but the
// worker crashes before recording the outcome, and the job is later reclaimed as stale), a
// half-finished Drive upload only re-attempts the format that didn't already succeed, and an
// already-sent email is a silent no-op rather than a second send. The job-level unique index and
// atomic claim are the first layer of duplicate protection; this per-artifact idempotency is the
// second, independent layer.
async function processJob(job: DeliveryJobRow) {
  const db = getDb();
  const [audit] = await db.select().from(profileAudits).where(eq(profileAudits.id, job.auditId)).limit(1);
  if (!audit || audit.status !== "completed") throw new Error("Audit not found or not completed yet.");

  const report = JSON.parse(audit.reportJson) as AuditReport;
  const auditDate = audit.createdAt.toISOString().slice(0, 10);

  if (job.kind === "drive") {
    let pdfBytes: Uint8Array | undefined;
    let docxBytes: Buffer | undefined;
    try {
      pdfBytes = await createAuditPdf(report);
      docxBytes = await createAuditDocxBuffer(report);
    } catch (error) {
      throw new Error(`Report file generation failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    const result = await fileAuditToDrive({
      auditId: job.auditId,
      userEmail: audit.userEmail,
      profileName: audit.profileName,
      upworkLink: audit.profileUrl,
      auditDate,
      pdfBytes,
      docxBytes,
    });
    if (!result.filed) throw new Error(result.lastError || `Drive filing incomplete (${result.pdfStatus ?? "?"}/${result.docxStatus ?? "?"}).`);
    return;
  }

  if (job.kind === "email") {
    // The worker has no incoming HTTP request to read an origin from (unlike the old inline call,
    // which used `new URL(request.url).origin`), so the report link needs the app's public URL
    // from configuration instead. RENDER_EXTERNAL_URL is set automatically by Render on every
    // service — no manual entry needed there; APP_ORIGIN is the explicit override for any other
    // host or a custom domain.
    const appOrigin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_ORIGIN;
    if (!appOrigin) throw new Error("APP_ORIGIN is not configured; cannot build the report link.");
    const result = await sendAuditReadyEmail({
      auditId: job.auditId,
      userEmail: audit.userEmail,
      profileName: audit.profileName,
      reportUrl: `${appOrigin}/?openAudit=${job.auditId}`,
    });
    if (!result.sent) throw new Error(result.error || "Email send failed.");
    return;
  }

  throw new Error(`Unknown delivery job kind: ${job.kind}`);
}

// Runs at most one claim+process cycle. Returns true if a job was found and attempted (whether it
// then succeeded or failed), false if the queue was empty — the caller (the poller below, or a
// test) uses that to know whether to keep draining immediately or wait for the next tick.
export async function runDeliveryWorkerOnce(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    await processJob(job);
    await markSucceeded(job.id);
  } catch (error) {
    await markFailed(job, error);
  }
  return true;
}

// Sweeps profile_audits rows stuck at status="reserved" past the same staleness window the
// allowance check itself already treats as non-blocking (RESERVATION_STALE_MINUTES) — this is the
// "recover abandoned jobs" half of the reservation requirement: a request that reserved a slot and
// then the process died before completing or releasing it (crash, deploy, OOM) would otherwise
// leave that row ambiguous forever. This makes it permanent and explicit (status="failed",
// billable=false) instead, matching what releaseReservation() does on a normal in-request failure.
export async function reapAbandonedReservations() {
  const db = getDb();
  await db.execute(sql`
    update profile_audits
    set status = 'failed', billable = false, updated_at = now()
    where status = 'reserved' and updated_at < now() - interval '${sql.raw(String(RESERVATION_STALE_MINUTES))} minutes';
  `);
}

let started = false;

// Starts the in-process poller exactly once per server process. Call from instrumentation.ts's
// register() hook, which Next.js runs once when the server process starts (including every
// restart) — that's what makes this "restart recovery" rather than something that needs a
// separate always-on worker dyno: on Render's persistent Node process, the same process that
// serves HTTP requests also runs this interval, and every restart re-registers it and immediately
// resumes any pending/stuck work.
//
// Guarded by a module-level flag (not just relying on register() being called once) because
// Next.js dev mode can re-execute instrumentation on hot reload; `globalThis` additionally survives
// that reload in a way a plain module-level `let` might not, depending on how the module graph is
// invalidated.
export function startDeliveryWorker() {
  const globalFlag = globalThis as typeof globalThis & { __improvexusDeliveryWorkerStarted?: boolean };
  if (started || globalFlag.__improvexusDeliveryWorkerStarted) return;
  started = true;
  globalFlag.__improvexusDeliveryWorkerStarted = true;

  let ticking = false;
  const tick = async () => {
    if (ticking) return; // don't overlap ticks if one is still draining a backlog
    ticking = true;
    try {
      await reapAbandonedReservations();
      // Drain everything currently claimable in this tick, not just one job, so a backlog built up
      // while the worker was down (e.g. after a restart) is worked off promptly rather than one
      // job per POLL_INTERVAL_MS.
      let more = true;
      while (more) more = await runDeliveryWorkerOnce();
    } catch (error) {
      console.error("Delivery worker tick failed", error instanceof Error ? error.name : "UnknownError");
    } finally {
      ticking = false;
    }
  };

  void tick(); // resume any pending/stuck work immediately on startup, don't wait for the first interval
  setInterval(tick, POLL_INTERVAL_MS);
}
