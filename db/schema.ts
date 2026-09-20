import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Every table below is reached ONLY through this app's own server, over the direct Postgres
// connection (SUPABASE_DB_URL) — never through Supabase's PostgREST/anon-key API (confirmed: no
// code anywhere calls the Supabase JS client's `.from(...)` against these tables; every read/write
// goes through drizzle). That connection authenticates as a role RLS does not apply to, so
// `.enableRLS()` on every table below changes nothing about how the app itself works. What it does
// do is close the tables off to Supabase's PostgREST/anon-key API entirely (RLS defaults to
// deny-all once enabled with zero policies defined) in case that API is ever exposed against this
// project for another purpose — pure defense-in-depth, and also what clears Supabase's own "RLS
// disabled on public table" security advisor for every table here.

// `profiles` extends Supabase's own `auth.users` table with the application-specific fields the
// dev brief asks for (mobile number, Upwork link) plus the role used for the weekly-limit /
// admin-unlimited split. `id` is the same uuid as `auth.users.id` — Supabase Auth owns email,
// password, and email-verification state; this table never duplicates those.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // == auth.users.id
  email: text("email").notNull(),
  fullName: text("full_name").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  upworkLink: text("upwork_link").notNull().default(""),
  role: text("role").notNull().default("base"), // "base" | "admin"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_profiles_email").on(table.email)]).enableRLS();

export const profileAudits = pgTable("profile_audits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  profileKey: text("profile_key").notNull(),
  profileUrl: text("profile_url").notNull().default(""),
  profileName: text("profile_name").notNull().default(""),
  contentHash: text("content_hash").notNull(),
  // Empty/zero defaults exist ONLY so a "reserved" row (see `status` below) can be inserted before
  // the AI call has produced a report — every row that reaches status "completed" always has real
  // values here, filled in by the same update that flips status to "completed".
  reportJson: text("report_json").notNull().default(""),
  score: real("score").notNull().default(0),
  passCount: integer("pass_count").notNull().default(0),
  weakCount: integer("weak_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  provider: text("provider").notNull().default(""),
  rubricVersion: text("rubric_version").notNull().default("23-point-v1"),
  // Set once a generation attempt actually counts against the weekly allowance. A row that failed
  // before this was set (schema-invalid AI output, storage error) is never counted — see the
  // "failed generation must not consume an allowance" requirement.
  billable: boolean("billable").notNull().default(true),
  // The allowance lifecycle, in order: "reserved" (the slot is held, AI call in flight, no report
  // yet) -> "completed" (AI succeeded, report saved, slot correctly spent) or "failed" (AI/storage
  // failed, `billable` flipped to false in the same update so the slot is released immediately).
  // A row can get stuck at "reserved" only if the server process dies mid-request; see
  // `RESERVATION_STALE_INTERVAL` in lib/audit-limit.ts for how that's both treated as non-blocking
  // by the limit check itself, and eventually swept to "failed" by the delivery worker's reaper —
  // this is the "release failed reservations and recover abandoned jobs" requirement.
  status: text("status").notNull().default("completed"), // reserved | completed | failed
  // The fencing token for this reservation, minted once at reserveAuditSlot() and never reused.
  // completeReservation()/releaseReservation()/renewReservationLease() all guard their UPDATE with
  // `WHERE id = ? AND lease_token = ? AND status = 'reserved'` — so a request whose reservation was
  // already reaped as abandoned (see the reaper in lib/delivery-worker.ts) or otherwise resolved by
  // the time its slow AI call finally returns cannot go on to finalize a row it no longer owns. This
  // is the fix for "an older, still-running generation must not complete after a replacement
  // reservation starts": the guard is a per-row ownership check, not a global "only one in flight"
  // assumption, so it doesn't need to know anything about a possible replacement row at all.
  leaseToken: uuid("lease_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  // Bumped by renewReservationLease() at each real checkpoint during a live AI call (see
  // app/api/audits/route.ts), which is what makes RESERVATION_STALE_MINUTES a "the request appears
  // to have genuinely died" signal rather than a hard ceiling on how long a legitimate generation is
  // allowed to run — a still-alive, still-renewing request is never reaped out from under itself.
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_profile_audits_user_created").on(table.userId, table.createdAt),
  index("idx_profile_audits_user_profile").on(table.userId, table.profileKey, table.createdAt),
  index("idx_profile_audits_status").on(table.status, table.updatedAt),
]).enableRLS();

export const enquiries = pgTable("enquiries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  platform: text("platform").notNull(),
  service: text("service").notNull(),
  buyer: text("buyer").notNull(),
  budget: text("budget").notNull().default(""),
  intent: text("intent").notNull(),
  challenge: text("challenge").notNull().default(""),
  profileJson: text("profile_json").notNull(),
  score: real("score").notNull(),
  unknownPoints: real("unknown_points").notNull(),
  recommendation: text("recommendation").notNull(),
  rubricVersion: text("rubric_version").notNull().default("1"),
  consent: boolean("consent").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_enquiries_email_created").on(table.email, table.createdAt)]).enableRLS();

// One row: the single owner Google Drive connection made from the admin panel. Not per-user —
// customers never connect their own Drive. Tokens are stored encrypted (see lib/crypto.ts);
// this table only ever holds ciphertext.
export const driveConnections = pgTable("drive_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  googleEmail: text("google_email").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  rootFolderId: text("root_folder_id").notNull(),
  connectedByEmail: text("connected_by_email").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().default(sql`now()`),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}).enableRLS();

// Tracks Drive filing per audit so a retry can be issued safely: a retry only re-attempts
// whichever of PDF/DOCX is not yet "succeeded", and never re-runs the whole audit or touches the
// weekly allowance. See "make uploads retryable without generating another audit or charging
// another allowance."
export const driveUploads = pgTable("drive_uploads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: uuid("audit_id").notNull(),
  pdfStatus: text("pdf_status").notNull().default("pending"), // pending | succeeded | failed
  docxStatus: text("docx_status").notNull().default("pending"),
  pdfFileId: text("pdf_file_id"),
  docxFileId: text("docx_file_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_drive_uploads_audit").on(table.auditId)]).enableRLS();

// Every notification send attempt, keyed so a retry never double-sends the same email for the
// same audit (see "retry handling, duplicate prevention and delivery-status tracking").
export const emailNotifications = pgTable("email_notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: uuid("audit_id"),
  userEmail: text("user_email").notNull(),
  kind: text("kind").notNull(), // "audit_ready" | "promotional" (never mixed in one send path)
  status: text("status").notNull().default("pending"), // pending | sent | failed
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_email_notifications_audit_kind").on(table.auditId, table.kind)]).enableRLS();

// The persisted delivery queue. Replaces the earlier fire-and-forget `deliverAuditArtifacts()`
// call: instead of a promise that only exists in the Node process's memory (and is lost entirely
// if the process restarts mid-flight), every unit of delivery work is a row here that a worker
// claims, processes, and marks done — so a restart just means the worker picks the row back up
// from the database, not that the work vanishes.
//
// One row per (audit, kind) — the unique index makes enqueuing idempotent: calling enqueue() again
// for an audit that already has a "drive" job (e.g. from the admin panel's manual retry button)
// does nothing, it never creates a second competing job for the same work.
//
// Claiming is done with a single atomic UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)
// (see lib/delivery-worker.ts), which is what makes this safe under concurrent workers and safe
// across restarts: two workers (or a worker started twice) can run the claim query at the same
// instant and will never both come back with the same row, and a job left "processing" by a
// worker that crashed is recognized as abandoned once `locked_at` is older than the claim
// timeout and becomes claimable again — no separate "did the old worker die" check is needed.
export const deliveryJobs = pgTable("delivery_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: uuid("audit_id").notNull(),
  kind: text("kind").notNull(), // "drive" | "email"
  status: text("status").notNull().default("pending"), // pending | processing | succeeded | failed
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  // Exponential backoff moves this forward on every failed attempt; the claim query only picks up
  // rows where nextAttemptAt has already passed, so a failing job doesn't get hammered in a tight
  // loop.
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().default(sql`now()`),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockToken: uuid("lock_token"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_delivery_jobs_audit_kind").on(table.auditId, table.kind),
  index("idx_delivery_jobs_claimable").on(table.status, table.nextAttemptAt),
]).enableRLS();
