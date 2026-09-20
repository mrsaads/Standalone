import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profileAudits } from "@/db/schema";
import type { AppUser } from "@/lib/auth";

// How long a "reserved" row (AI call in flight, no report yet) is still treated as holding the
// weekly slot. Must comfortably exceed the worst-case AI call: two attempts (the schema-retry in
// app/api/audits/route.ts) x a 150s provider timeout each, plus request overhead. 10 minutes gives
// real headroom without leaving a crashed request's user blocked anywhere near the full 7-day
// window. The delivery worker's reaper (lib/delivery-worker.ts) uses the same constant to flip a
// row this old from "reserved" to "failed" so it doesn't linger ambiguous forever — but the limit
// check below is correct on its own even before the reaper gets around to that.
export const RESERVATION_STALE_MINUTES = 10;

export class WeeklyLimitError extends Error {
  constructor() {
    super("WEEKLY_AUDIT_LIMIT");
    this.name = "WeeklyLimitError";
  }
}

// Thrown by completeReservation()/releaseReservation()/renewReservationLease() when the row is no
// longer this caller's to finalize — it was reaped as abandoned (see the reaper in
// lib/delivery-worker.ts) or already resolved by someone/something else. This is the direct fix
// for "an older, still-running generation must not complete after a replacement reservation
// starts": once a reservation stops being live under ITS OWN lease token, nothing it does later
// can write to that row again, regardless of what else has happened to the user's account since.
export class ReservationLostError extends Error {
  constructor() {
    super("RESERVATION_LOST");
    this.name = "ReservationLostError";
  }
}

// A row counts against the weekly allowance if it's billable AND either genuinely completed, or
// still a live (non-stale) reservation. A "reserved" row older than RESERVATION_STALE_MINUTES is
// treated as abandoned here — not blocking — independent of whether the reaper has swept it yet.
function activeReservationSql() {
  return sql`(status = 'completed' or (status = 'reserved' and updated_at > now() - interval '${sql.raw(String(RESERVATION_STALE_MINUTES))} minutes'))`;
}

function recentAllowanceCondition(userId: string) {
  return and(
    eq(profileAudits.userId, userId),
    eq(profileAudits.billable, true),
    gte(profileAudits.createdAt, sql`now() - interval '7 days'`),
    activeReservationSql(),
  );
}

// Fast-fail pre-check only, run before we even try to read/import the submitted profile. This is
// NOT the race-safe enforcement — see reserveAuditSlot() below — it exists purely so an
// already-over-limit customer gets an immediate, cheap rejection instead of waiting on profile
// import first.
export async function precheckWeeklyLimit(user: AppUser) {
  if (user.role === "admin") return;
  const db = getDb();
  const [recent] = await db.select({ id: profileAudits.id }).from(profileAudits)
    .where(recentAllowanceCondition(user.id))
    .limit(1);
  if (recent) throw new WeeklyLimitError();
}

// The real enforcement, and the fix for "reserve the allowance before AI generation starts":
// this inserts a "reserved" placeholder row inside one short transaction, guarded by a per-user
// Postgres advisory lock, BEFORE the caller makes the (slow, 1-3 minute) AI call. The lock is held
// only across this check+insert — typically low single-digit milliseconds — never across the AI
// call, which the caller runs after this function has already returned and committed.
//
// A second concurrent request for the same user blocks on the advisory lock until the first
// commits, then re-reads the allowance check and correctly sees the row the first request just
// reserved — this is what actually closes the race a plain "SELECT then INSERT" has. Two
// different users never contend with each other (the lock key is hashed per-user-id).
// Returns { auditId, leaseToken } rather than just an id — leaseToken is this reservation's fencing
// token (see the `leaseToken` column comment in db/schema.ts), and the caller MUST carry it through
// to every later call (renewReservationLease/completeReservation/releaseReservation) for this same
// audit. Two different reservations for the same user always get different, unguessable tokens, so
// there's no way for one request to accidentally (or maliciously) finalize a reservation it didn't
// itself create.
export async function reserveAuditSlot(user: AppUser, profileKey: string, contentHash: string, profileUrl: string) {
  const db = getDb();
  const leaseToken = randomUUID();
  const auditId = await db.transaction(async tx => {
    if (user.role !== "admin") {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
      const [recent] = await tx.select({ id: profileAudits.id }).from(profileAudits)
        .where(recentAllowanceCondition(user.id))
        .limit(1);
      if (recent) throw new WeeklyLimitError();
    }
    const [inserted] = await tx.insert(profileAudits).values({
      userId: user.id,
      userEmail: user.email,
      profileKey,
      profileUrl,
      contentHash,
      billable: true,
      status: "reserved",
      leaseToken,
    }).returning({ id: profileAudits.id });
    return inserted.id;
  });
  return { auditId, leaseToken };
}

// Call at natural checkpoints during the live AI call (this route retries the provider at most
// once, so "before each attempt" is enough — a single attempt is capped at 150s via
// AbortSignal.timeout, well under RESERVATION_STALE_MINUTES, so no renewal gap can itself go stale)
// to prove to the reaper that this reservation is still genuinely alive, not abandoned. Guarded by
// the same `status = 'reserved' AND lease_token = ?` check as completeReservation/
// releaseReservation: if the reaper already won the race and reaped this row, the renewal is
// correctly rejected rather than resurrecting a row that's already moved on.
export async function renewReservationLease(auditId: string, leaseToken: string) {
  const db = getDb();
  const [row] = await db.update(profileAudits).set({ updatedAt: new Date() })
    .where(and(eq(profileAudits.id, auditId), eq(profileAudits.leaseToken, leaseToken), eq(profileAudits.status, "reserved")))
    .returning({ id: profileAudits.id });
  if (!row) throw new ReservationLostError();
}

// Called once the AI call has actually produced a valid report: fills in the real content and
// flips the reservation to "completed", which is what makes it count as a spent allowance for
// real (activeReservationSql() already treated it as spent while it was a live "reserved" row, so
// this doesn't change whether it blocks the next request — it just makes that permanent instead of
// time-limited).
//
// Guarded by `status = 'reserved' AND lease_token = ?`: if this row was already reaped (the
// generation ran long enough that the reaper decided it was abandoned and flipped it to "failed"
// before this call arrived) or already finalized some other way, the UPDATE matches zero rows and
// this throws ReservationLostError instead of silently overwriting whatever the row is now — this
// is what stops an old, slow generation from completing after its reservation has been superseded.
export async function completeReservation(auditId: string, leaseToken: string, params: {
  profileName: string;
  reportJson: string;
  score: number;
  passCount: number;
  weakCount: number;
  failCount: number;
  provider: string;
}) {
  const db = getDb();
  const [row] = await db.update(profileAudits).set({
    profileName: params.profileName,
    reportJson: params.reportJson,
    score: params.score,
    passCount: params.passCount,
    weakCount: params.weakCount,
    failCount: params.failCount,
    provider: params.provider,
    status: "completed",
    updatedAt: new Date(),
  }).where(and(eq(profileAudits.id, auditId), eq(profileAudits.leaseToken, leaseToken), eq(profileAudits.status, "reserved")))
    .returning({ id: profileAudits.id });
  if (!row) throw new ReservationLostError();
}

// Called when the AI call or the write itself fails after a slot was reserved: releases the
// reservation immediately (billable=false takes it out of every future allowance check, status
// "failed" makes that permanent and self-explanatory in the admin panel) rather than making the
// customer wait out RESERVATION_STALE_MINUTES or the reaper's next sweep.
//
// Same ownership guard as completeReservation. If the row was already reaped or resolved, this is
// a harmless no-op (it's already in the state this function was trying to put it in) rather than
// an error — unlike completeReservation, there's nothing unsafe about "releasing" a slot that
// turns out to already be released.
export async function releaseReservation(auditId: string, leaseToken: string) {
  const db = getDb();
  await db.update(profileAudits).set({ status: "failed", billable: false, updatedAt: new Date() })
    .where(and(eq(profileAudits.id, auditId), eq(profileAudits.leaseToken, leaseToken), eq(profileAudits.status, "reserved")));
}
