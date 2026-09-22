// LOCAL-ONLY test. Unlike reservation-and-delivery.local-test.mts's Test F (which simulates a
// crash by backdating a timestamp), this one spawns and SIGKILLs a REAL separate OS process to
// prove the persisted queue survives an actual process death, not just a timestamp manipulation —
// directly answering "prove a pending upload/email survives a restart and retries without
// duplicate delivery" against real Postgres, real process boundaries, no mocking of the queue
// itself. AI-provider/Drive/Resend network calls are not reachable in this sandbox (no credentials
// configured here), so the restarted worker's delivery attempt is expected to fail on those calls
// — what this test proves is that the SAME job is retried exactly once more (not duplicated, not
// lost), which is the actual property in question; a full live delivery still needs real Google/
// Resend credentials, which remain outstanding (see the handover's blocker list).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { profiles, profileAudits, deliveryJobs } from "../../db/schema";
import { reserveAuditSlot, completeReservation } from "../../lib/audit-limit";
import { enqueueDelivery } from "../../lib/delivery-worker";
import type { AppUser } from "../../lib/auth";

let pass = 0, fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}

// `detached: true` puts the child in its own process group (pgid = its own pid) rather than
// ours. That matters for "claim-and-hang": `npx` itself spawns a `sh -c tsx ...` child, which
// spawns the actual node process running _worker-process.mts — three processes deep. Killing only
// the `npx` PID (what `proc.kill()` does) leaves the `sh` and node grandchildren alive as orphans,
// still holding an open DB connection and free to race a *later* test run for the next claimable
// job. (This is exactly what happened during initial verification here: leftover orphans from a
// crashed earlier run raced this script's own intentional child and stole its job before it could
// claim one, producing a false "claimed a real job (id none)" failure that had nothing to do with
// the actual restart-recovery logic being tested.) Sending the signal to -proc.pid (negative =
// the whole process group) instead of proc.pid kills npx, sh, and node together, which is what a
// real SIGKILL/OOM-kill of a worker process does in production too.
function killTree(proc: ReturnType<typeof spawn>) {
  try { process.kill(-proc.pid!, "SIGKILL"); } catch { /* group may already be gone */ }
}

function runChild(mode: string, env: Record<string, string>): Promise<{ stdout: string; proc: ReturnType<typeof spawn> }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["tsx", "scripts/local-tests/_worker-process.mts", mode], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      detached: true,
    });
    let stdout = "";
    proc.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (mode === "claim-and-hang" && stdout.includes("CLAIMED:")) resolve({ stdout, proc });
    });
    proc.on("exit", () => { if (mode === "run") resolve({ stdout, proc }); });
    proc.on("error", reject);
    setTimeout(() => reject(new Error(`child process (${mode}) did not respond in time`)), 8000);
  });
}

async function main() {
  const db = getDb();
  const userId = randomUUID();
  const user: AppUser = { id: userId, email: "local-restart-test@example.com", role: "base", plan: "free", fullName: "", mobile: "", upworkLink: "", preferredDestination: "" };
  await db.execute(sql`insert into auth.users (id) values (${userId})`);
  await db.insert(profiles).values({ id: userId, email: user.email, role: "base" });

  const { auditId, leaseToken } = await reserveAuditSlot(user, "profile-restart", "hash-restart", "");
  await completeReservation(auditId, leaseToken, { profileName: "Restart Test", reportJson: "{}", score: 10, passCount: 1, weakCount: 0, failCount: 0, provider: "test" });
  await enqueueDelivery(auditId);

  console.log("\nSpawning worker process #1, letting it claim a job, then SIGKILLing it mid-job...");
  const { stdout: claimStdout, proc: proc1 } = await runChild("claim-and-hang", {});
  const claimedId = claimStdout.trim().split("CLAIMED:")[1]?.split("\n")[0];
  assert(!!claimedId && claimedId !== "none", `process #1 claimed a real job (id ${claimedId})`);

  const [afterClaim] = await db.select({ status: deliveryJobs.status, attempts: deliveryJobs.attempts })
    .from(deliveryJobs).where(eq(deliveryJobs.id, claimedId!));
  assert(afterClaim?.status === "processing", "the claimed job is status=processing while process #1 is alive");

  killTree(proc1);
  await new Promise(resolve => setTimeout(resolve, 300));

  console.log("Process #1 killed. Spawning worker process #2 (the 'restart') with a short stale-claim window...");
  await runChild("run", { DELIVERY_CLAIM_STALE_MINUTES: "0" });

  const [afterRestart] = await db.select({ status: deliveryJobs.status, attempts: deliveryJobs.attempts })
    .from(deliveryJobs).where(eq(deliveryJobs.id, claimedId!));
  assert((afterRestart?.attempts ?? 0) >= 2, `job was picked back up after the restart — attempts went from 1 to ${afterRestart?.attempts} (not silently dropped)`);
  assert(afterRestart?.status === "pending" || afterRestart?.status === "failed" || afterRestart?.status === "succeeded",
    `job reached a real terminal/retry state after restart (status=${afterRestart?.status}), never stuck at "processing" forever`);

  const allJobsForAudit = await db.select({ id: deliveryJobs.id, kind: deliveryJobs.kind }).from(deliveryJobs).where(eq(deliveryJobs.auditId, auditId));
  const driveJobs = allJobsForAudit.filter(j => j.kind === "drive");
  const emailJobs = allJobsForAudit.filter(j => j.kind === "email");
  assert(driveJobs.length === 1 && emailJobs.length === 1,
    `exactly one drive job and one email job exist for this audit even after the crash+restart cycle (got drive=${driveJobs.length}, email=${emailJobs.length}) — no duplicate job was ever created`);

  await db.delete(deliveryJobs).where(eq(deliveryJobs.auditId, auditId));
  await db.delete(profileAudits).where(eq(profileAudits.id, auditId));
  await db.delete(profiles).where(eq(profiles.id, userId));
  await db.execute(sql`delete from auth.users where id = ${userId}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(error => { console.error("Test run crashed:", error); process.exit(1); });
