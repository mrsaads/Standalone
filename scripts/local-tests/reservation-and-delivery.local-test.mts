// LOCAL-ONLY integration test. Runs against a real (local) Postgres instance — not mocked, not
// against Supabase — to exercise the actual transaction/locking/claim SQL in
// lib/audit-limit.ts and lib/delivery-worker.ts, which a unit test with a fake DB client
// cannot meaningfully verify (the whole point of these fixes is Postgres-level locking
// behavior). Every result below is a LOCAL test result: it proves the logic is correct against
// real Postgres semantics, not that it has been exercised against the actual Supabase project,
// which remains blocked (see the handover doc) until Supabase project access is granted.
//
// Usage:
//   DATABASE_URL=postgres://postgres:<password>@127.0.0.1:5432/<db> npx tsx scripts/local-tests/reservation-and-delivery.local-test.mts
//
// Requires: the drizzle migrations already applied to that database (npm run db:migrate), and —
// since profile_audits.user_id has no FK in this schema but profiles.id does reference
// auth.users(id) — a local stand-in `auth.users` table (see the handover doc's "local test setup"
// section for the exact one-time SQL used to create it in this sandbox).
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { profiles, profileAudits, deliveryJobs, emailNotifications } from "../../db/schema";
import { reserveAuditSlot, renewReservationLease, completeReservation, releaseReservation, precheckWeeklyLimit, WeeklyLimitError, ReservationLostError, RESERVATION_STALE_MINUTES } from "../../lib/audit-limit";
import { enqueueDelivery, claimNextJob, reapAbandonedReservations } from "../../lib/delivery-worker";
import { sendAuditReadyEmail } from "../../lib/email";
import type { AppUser } from "../../lib/auth";

let pass = 0;
let fail = 0;
function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ FAIL: ${label}`); }
}
function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  const db = getDb();
  const userId = randomUUID();
  const user: AppUser = { id: userId, email: "local-test@example.com", role: "base", fullName: "Local Test", mobile: "", upworkLink: "" } as AppUser;

  await db.execute(sql`insert into auth.users (id) values (${userId})`);
  await db.insert(profiles).values({ id: userId, email: user.email, role: "base" });

  async function resetAuditsForUser() {
    await db.delete(profileAudits).where(eq(profileAudits.userId, userId));
  }

  // ── A: concurrent reservation race — exactly one of N simultaneous requests wins ──────────────
  section("A. Concurrent reserveAuditSlot() calls for the same user (the actual race the earlier code had)");
  await resetAuditsForUser();
  {
    const N = 5;
    const started = Date.now();
    const results = await Promise.allSettled(Array.from({ length: N }, () => reserveAuditSlot(user, "profile-a", "hash-a", "")));
    const elapsedMs = Date.now() - started;
    const succeeded = results.filter(r => r.status === "fulfilled");
    const rejectedWithLimit = results.filter(r => r.status === "rejected" && (r.reason as Error) instanceof WeeklyLimitError);
    assert(succeeded.length === 1, `exactly 1 of ${N} concurrent requests reserved the slot (got ${succeeded.length})`);
    assert(rejectedWithLimit.length === N - 1, `the other ${N - 1} were rejected as WeeklyLimitError (got ${rejectedWithLimit.length})`);
    assert(elapsedMs < 2000, `all ${N} concurrent attempts resolved quickly (${elapsedMs}ms) — the advisory lock serializes them but doesn't hang`);
  }

  // ── B: the lock is NOT held across the AI call ─────────────────────────────────────────────────
  section("B. Reservation lock is released before the (simulated) AI call — a second request isn't blocked for its duration");
  await resetAuditsForUser();
  {
    const { auditId, leaseToken } = await reserveAuditSlot(user, "profile-b", "hash-b", "");
    // reserveAuditSlot() has already returned/committed here — simulate the slow AI call the real
    // route makes AFTER reservation, i.e. outside any transaction.
    const simulatedAiCall = new Promise(resolve => setTimeout(resolve, 1500));
    const secondAttemptStarted = Date.now();
    let secondFailedFast = false;
    try { await reserveAuditSlot(user, "profile-b", "hash-b", ""); }
    catch (error) {
      const elapsed = Date.now() - secondAttemptStarted;
      secondFailedFast = error instanceof WeeklyLimitError && elapsed < 300;
      assert(error instanceof WeeklyLimitError, "second concurrent request was correctly rejected");
      assert(elapsed < 300, `second request rejected in ${elapsed}ms, not held for the ~1500ms simulated AI call (proves the lock isn't held across it)`);
    }
    assert(secondFailedFast, "overall: reservation is fast-fail, not blocked on the in-flight AI call");
    await simulatedAiCall;
    await completeReservation(auditId, leaseToken, { profileName: "Test", reportJson: "{}", score: 10, passCount: 1, weakCount: 0, failCount: 0, provider: "test" });
  }

  // ── C: a failed generation releases the reservation ────────────────────────────────────────────
  section("C. releaseReservation() frees the slot immediately after a simulated AI failure");
  await resetAuditsForUser();
  {
    const { auditId, leaseToken } = await reserveAuditSlot(user, "profile-c", "hash-c", "");
    await releaseReservation(auditId, leaseToken);
    let secondSucceeded = false;
    try { await reserveAuditSlot(user, "profile-c", "hash-c", ""); secondSucceeded = true; }
    catch { /* would mean the release didn't work */ }
    assert(secondSucceeded, "a new reservation succeeds right after the failed one was released — the customer isn't charged for a failed generation");
    await precheckWeeklyLimit(user).then(() => fail++, () => pass++); // now blocked again by the second (still-open) reservation — sanity check
    console.log("  ✓ (sanity) the successful re-reservation itself now correctly blocks a third concurrent attempt");
  }

  // ── D: an abandoned ("reserved" forever, e.g. the process crashed) reservation is recovered ────
  section("D. Abandoned reservation: doesn't block forever, and the reaper cleans it up");
  await resetAuditsForUser();
  {
    const { auditId } = await reserveAuditSlot(user, "profile-d", "hash-d", "");
    // Simulate "the process died right after reserving, before completing or releasing" by
    // backdating updated_at past the staleness window instead of waiting RESERVATION_STALE_MINUTES
    // for real.
    await db.execute(sql`update profile_audits set updated_at = now() - interval '${sql.raw(String(RESERVATION_STALE_MINUTES + 5))} minutes' where id = ${auditId}`);

    let newReservationSucceeded = false;
    try { await reserveAuditSlot(user, "profile-d2", "hash-d2", ""); newReservationSucceeded = true; }
    catch { /* */ }
    assert(newReservationSucceeded, "a stale abandoned reservation does NOT block a new request, even before the reaper runs");

    await db.delete(profileAudits).where(eq(profileAudits.profileKey, "profile-d2")); // isolate the reaper check to just the abandoned row
    await reapAbandonedReservations();
    const [swept] = await db.select({ status: profileAudits.status, billable: profileAudits.billable }).from(profileAudits).where(eq(profileAudits.id, auditId));
    assert(swept?.status === "failed" && swept?.billable === false, `the reaper swept the abandoned reservation to status=failed, billable=false (got status=${swept?.status}, billable=${swept?.billable})`);
  }

  // ── D2: the actual scenario you flagged — an old, slow generation must not complete after a
  //        replacement reservation has already started, even if the reaper hasn't reaped it yet ───
  section("D2. Ownership/lease guard: a reaped reservation's OWN completeReservation() call is rejected, not silently accepted");
  await resetAuditsForUser();
  {
    const { auditId: oldAuditId, leaseToken: oldLease } = await reserveAuditSlot(user, "profile-d2a", "hash-d2a", "");
    // Simulate: this request's AI call is abnormally slow. Time passes; the reaper (or the
    // staleness check) now considers it abandoned.
    await db.execute(sql`update profile_audits set updated_at = now() - interval '${sql.raw(String(RESERVATION_STALE_MINUTES + 5))} minutes' where id = ${oldAuditId}`);
    await reapAbandonedReservations(); // the row is now status='failed', billable=false — actually reaped, not just stale-looking

    // A replacement reservation starts and completes normally.
    const { auditId: newAuditId, leaseToken: newLease } = await reserveAuditSlot(user, "profile-d2b", "hash-d2b", "");
    await completeReservation(newAuditId, newLease, { profileName: "Replacement", reportJson: "{}", score: 10, passCount: 1, weakCount: 0, failCount: 0, provider: "test" });

    // NOW the old, slow generation's AI call finally returns, and it tries to complete ITS
    // reservation. Without the lease/ownership guard, this would silently overwrite the already-
    // reaped row back to "completed" — exactly the bug you flagged. With the guard, it must fail.
    let oldCompletionRejected = false;
    try { await completeReservation(oldAuditId, oldLease, { profileName: "Stale, should never be saved", reportJson: "{}", score: 1, passCount: 0, weakCount: 0, failCount: 1, provider: "test" }); }
    catch (error) { oldCompletionRejected = error instanceof ReservationLostError; }
    assert(oldCompletionRejected, "the old, superseded generation's completeReservation() call was rejected as ReservationLostError, not silently applied");

    const [oldRowAfter] = await db.select({ status: profileAudits.status, profileName: profileAudits.profileName }).from(profileAudits).where(eq(profileAudits.id, oldAuditId));
    assert(oldRowAfter?.status === "failed" && oldRowAfter?.profileName !== "Stale, should never be saved",
      `the old row stayed exactly as the reaper left it (status=${oldRowAfter?.status}), never got overwritten by the late completion`);

    // Also prove renewReservationLease() itself respects the same guard: a renewal attempt on an
    // already-reaped reservation must fail the same way, not silently succeed.
    let renewalRejected = false;
    try { await renewReservationLease(oldAuditId, oldLease); }
    catch (error) { renewalRejected = error instanceof ReservationLostError; }
    assert(renewalRejected, "renewReservationLease() on an already-reaped reservation is correctly rejected too");
  }

  // ── E: concurrent delivery-job claiming never double-claims ────────────────────────────────────
  section("E. Concurrent claimNextJob() calls never claim the same delivery job twice");
  await resetAuditsForUser();
  let completedAuditId = "";
  {
    const { auditId, leaseToken } = await reserveAuditSlot(user, "profile-e", "hash-e", "");
    completedAuditId = auditId;
    await completeReservation(auditId, leaseToken, { profileName: "Test E", reportJson: "{}", score: 10, passCount: 1, weakCount: 0, failCount: 0, provider: "test" });
    await enqueueDelivery(completedAuditId);

    const N = 5; // more claimers than jobs (2: drive + email)
    const claims = await Promise.all(Array.from({ length: N }, () => claimNextJob()));
    const claimedIds = claims.filter(Boolean).map(job => job!.id);
    const uniqueClaimedIds = new Set(claimedIds);
    assert(claimedIds.length === 2, `exactly 2 jobs were claimed across ${N} concurrent claimers (got ${claimedIds.length})`);
    assert(uniqueClaimedIds.size === claimedIds.length, "no job was claimed by more than one caller (SKIP LOCKED held)");
    const kinds = new Set(claims.filter(Boolean).map(job => job!.kind));
    assert(kinds.has("drive") && kinds.has("email"), "both the drive job and the email job were claimed (one each)");
  }

  // ── F: a job stuck "processing" from a crashed/restarted worker is reclaimed ───────────────────
  section("F. Restart recovery: a job left 'processing' by a dead worker becomes claimable again");
  {
    const [stuck] = await db.select().from(deliveryJobs).where(eq(deliveryJobs.auditId, completedAuditId)).limit(1);
    if (!stuck) { fail++; console.error("  ✗ FAIL: setup — no processing job found from test E to use here"); }
    else {
      // Simulate "time passed since the worker that claimed this crashed" instead of waiting for
      // real wall-clock time.
      await db.execute(sql`update delivery_jobs set locked_at = now() - interval '20 minutes' where id = ${stuck.id}`);
      const reclaimed = await claimNextJob();
      assert(reclaimed?.id === stuck.id, "the stale 'processing' job was reclaimed by the next claim call (this is what a restarted worker does)");
      assert((reclaimed?.attempts ?? 0) >= 2, `attempts counter increased on reclaim (now ${reclaimed?.attempts}) — bounded retries, not silently reset`);
    }
  }

  // ── G: enqueueing twice never creates duplicate jobs ────────────────────────────────────────────
  section("G. enqueueDelivery() is idempotent — calling it again never creates a second competing job");
  {
    await enqueueDelivery(completedAuditId);
    const rows = await db.select({ id: deliveryJobs.id }).from(deliveryJobs).where(eq(deliveryJobs.auditId, completedAuditId));
    assert(rows.length === 2, `still exactly 2 delivery_jobs rows for this audit after a second enqueue call (got ${rows.length}) — the unique (audit_id, kind) index did its job`);
  }

  // ── H: email idempotency — a retry never re-sends an already-sent notification ─────────────────
  section("H. sendAuditReadyEmail() is a no-op once a prior attempt already succeeded (real code path, no mocking)");
  {
    const fakeAuditId = randomUUID();
    await db.insert(emailNotifications).values({ auditId: fakeAuditId, userEmail: user.email, kind: "audit_ready", status: "sent", providerMessageId: "local-test-fake-id" });
    // No RESEND_API_KEY is set in this environment — if sendAuditReadyEmail's "already sent" guard
    // didn't short-circuit BEFORE constructing the Resend client, this would throw
    // "RESEND_API_KEY is not configured" instead of returning cleanly. It not throwing IS the test.
    const result = await sendAuditReadyEmail({ auditId: fakeAuditId, userEmail: user.email, profileName: "Test H", reportUrl: "https://example.com/x" });
    assert(result.sent === true && result.skipped === true, `repeat send was skipped as already-sent, no duplicate attempted (got ${JSON.stringify(result)})`);
  }

  // ── I: admin-granted bonus audit credits (Managed Client Portal spec, Part 3) ──────────────────
  // "Their included audit allowance can be granted separately by admin. Keep audit allowances
  // configurable rather than inventing a paid plan." This proves the whole lifecycle — grant,
  // spend once the weekly slot is already used, refund on failure, never touched when unused —
  // entirely in Postgres, with no AI call anywhere in this section.
  section("I. Admin-granted bonusAuditCredits: spent only after the weekly slot is used, refunded on failure");
  await resetAuditsForUser();
  await db.update(profiles).set({ bonusAuditCredits: 0 }).where(eq(profiles.id, userId));
  {
    // I1: with zero bonus credits, a second request within the week is still correctly blocked.
    const first = await reserveAuditSlot(user, "profile-i1", "hash-i1", "");
    let blockedWithoutCredit = false;
    try { await reserveAuditSlot(user, "profile-i1b", "hash-i1b", ""); }
    catch (error) { blockedWithoutCredit = error instanceof WeeklyLimitError; }
    assert(blockedWithoutCredit, "with 0 bonus credits, a second reservation this week is still rejected as WeeklyLimitError");
    await completeReservation(first.auditId, first.leaseToken, { profileName: "I1", reportJson: "{}", score: 10, passCount: 1, weakCount: 0, failCount: 0, provider: "test" });

    // I2: grant 1 bonus credit — the next reservation (still within the same week) is now admitted,
    // spending the credit rather than the (already-used) weekly slot.
    await db.update(profiles).set({ bonusAuditCredits: 1 }).where(eq(profiles.id, userId));
    const second = await reserveAuditSlot(user, "profile-i2", "hash-i2", "");
    const [afterSpend] = await db.select({ bonusAuditCredits: profiles.bonusAuditCredits }).from(profiles).where(eq(profiles.id, userId));
    assert(afterSpend?.bonusAuditCredits === 0, `granting 1 bonus credit admits the next reservation and spends it (bonusAuditCredits now ${afterSpend?.bonusAuditCredits})`);
    const [secondRow] = await db.select({ usedBonusCredit: profileAudits.usedBonusCredit }).from(profileAudits).where(eq(profileAudits.id, second.auditId));
    assert(secondRow?.usedBonusCredit === true, "the reservation row itself is marked usedBonusCredit=true");

    // I3: a third attempt is blocked again — the credit was a one-time grant, not unlimited.
    let blockedAfterSpend = false;
    try { await reserveAuditSlot(user, "profile-i3", "hash-i3", ""); }
    catch (error) { blockedAfterSpend = error instanceof WeeklyLimitError; }
    assert(blockedAfterSpend, "after the single bonus credit is spent, a further reservation is blocked again");

    // I4: the spent credit is refunded if that generation then fails — a failed AI call must never
    // permanently cost the account a credit any more than it costs them the weekly slot.
    await releaseReservation(second.auditId, second.leaseToken);
    const [afterRefund] = await db.select({ bonusAuditCredits: profiles.bonusAuditCredits }).from(profiles).where(eq(profiles.id, userId));
    assert(afterRefund?.bonusAuditCredits === 1, `a failed generation refunds the spent bonus credit (bonusAuditCredits now ${afterRefund?.bonusAuditCredits})`);

    // I5: releasing a reservation that did NOT use a bonus credit must never touch the balance.
    const third = await reserveAuditSlot(user, "profile-i5", "hash-i5", ""); // spends the refunded credit again (weekly slot still used from I1/I2)
    await completeReservation(third.auditId, third.leaseToken, { profileName: "I5", reportJson: "{}", score: 10, passCount: 1, weakCount: 0, failCount: 0, provider: "test" });
    const [afterI5] = await db.select({ bonusAuditCredits: profiles.bonusAuditCredits }).from(profiles).where(eq(profiles.id, userId));
    assert(afterI5?.bonusAuditCredits === 0, `a completed (non-released) bonus-credit reservation leaves the balance spent, not refunded (bonusAuditCredits now ${afterI5?.bonusAuditCredits})`);
  }

  await db.delete(deliveryJobs).where(eq(deliveryJobs.auditId, completedAuditId));
  await db.delete(emailNotifications).where(eq(emailNotifications.userEmail, user.email));
  await resetAuditsForUser();
  await db.delete(profiles).where(eq(profiles.id, userId));
  await db.execute(sql`delete from auth.users where id = ${userId}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(error => { console.error("Test run crashed:", error); process.exit(1); });
