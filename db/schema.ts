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
  // Manually managed by an admin from the admin panel only (see app/api/admin/users/[id]/plan) —
  // there is no payment provider integration, so this is never set by a webhook or a checkout flow.
  // "free" = preview-only (no PDF/Word download, no AI optimization section); "subscriber" =
  // full access. Admin accounts get full access regardless of this value (see lib/entitlements.ts).
  plan: text("plan").notNull().default("free"), // "free" | "subscriber"
  planUpdatedAt: timestamp("plan_updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  // Admin-configurable, one-off audit credits on top of the standard free weekly allowance — the
  // "keep audit allowances configurable rather than inventing a paid plan" requirement. Consumed
  // before the weekly-limit check in lib/audit-limit.ts; irrelevant for subscriber/admin accounts,
  // which already bypass the weekly limit entirely.
  bonusAuditCredits: integer("bonus_audit_credits").notNull().default(0),
  // Whether this account opted out of promotional/marketing email. Service notifications (managed-
  // client updates, audit-ready, admin service announcements) are never suppressed by this — only
  // announcements sent with kind "promotional" respect it. Set by the account itself, never inferred.
  marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
  // Per-user default landing destination after a plain "Log in"/"Sign up" (no workspace card
  // selected) — set from whichever card the visitor picked at signup. Purely a routing hint: it
  // never grants client-portal access on its own (see workspaceMembers for the actual grant), and
  // a card click at login time always overrides it for that one visit. See lib/destination.ts.
  preferredDestination: text("preferred_destination").notNull().default(""), // "" | "audit" | "client_portal"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_profiles_email").on(table.email)]).enableRLS();

// One row per manual plan change an admin makes from the admin panel. This is the entire "payment
// details" record for this build: no payment provider is configured, so nothing here is a real
// card/account number — just what the admin was told and typed in (method/reference/note), kept as
// a history so a plan change is auditable. See db/schema.ts's paymentRecords comment history and
// app/api/admin/users/[id]/plan/route.ts.
export const paymentRecords = pgTable("payment_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  recordedByEmail: text("recorded_by_email").notNull(), // the admin who entered this
  plan: text("plan").notNull(), // the plan this record set the user to
  amount: real("amount").notNull().default(0),
  currency: text("currency").notNull().default(""),
  method: text("method").notNull().default(""), // e.g. "bank_transfer" | "easypaisa" | "cash" | "other"
  reference: text("reference").notNull().default(""), // transaction id / receipt note, admin-typed
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_payment_records_user_created").on(table.userId, table.createdAt)]).enableRLS();

// A user's request for a human ("by person") to do the profile optimization instead of relying on
// the AI-generated suggestedHeadline/suggestedOverview. Available to any signed-in user regardless
// of plan — surfaced next to the report's Optimization section either as an alternative (subscriber)
// or as the only optimization path offered (free tier, where the AI optimization content is locked).
export const optimizationRequests = pgTable("optimization_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  auditId: uuid("audit_id"), // nullable: the report this request was raised from, when there is one
  profileUrl: text("profile_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("new"), // "new" | "in_progress" | "done"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_optimization_requests_status_created").on(table.status, table.createdAt)]).enableRLS();

// Append-only log of admin actions taken from the admin panel (plan changes, optimization-request
// status changes, and any future admin action). Required so an elevated action is always
// attributable, never a bare, unauditable write. Never holds credentials or secret values.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(), // e.g. "set_plan" | "optimization_request_status"
  targetType: text("target_type").notNull(), // e.g. "user" | "optimization_request"
  targetId: text("target_id").notNull(),
  detail: text("detail").notNull().default(""), // short human-readable summary, never a secret value
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_admin_audit_log_created").on(table.createdAt)]).enableRLS();

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
  // True only when this reservation was admitted by spending one of the user's admin-granted
  // bonusAuditCredits (see lib/audit-limit.ts) rather than the standard weekly free slot — set once,
  // at reservation time, so releaseReservation() knows whether a failed generation must refund a
  // bonus credit (it must never touch the weekly slot itself, which was never "spent" in that case).
  usedBonusCredit: boolean("used_bonus_credit").notNull().default(false),
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

// Lightweight marketing leads: the public landing page's general enquiry CTA, plus a signed-in
// but unassigned user's "request managed-client access" submission from /client-portal.
// Deliberately separate from `enquiries` above (tied to the in-workspace profile self-assessment
// quiz, which requires a scored answer set a landing-page visitor never has). Creating a lead
// never creates a workspaceMembers row — only an admin doing that manually does.
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  profileLink: text("profile_link").notNull().default(""),
  goals: text("goals").notNull().default(""),
  source: text("source").notNull(), // "landing_audit" | "landing_client_portal" | "landing_general" | "client_portal_access_request"
  userId: uuid("user_id"), // set only for a signed-in user's access-request submission
  status: text("status").notNull().default("new"), // "new" | "reviewed" | "actioned"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_leads_email_created").on(table.email, table.createdAt),
  index("idx_leads_status").on(table.status),
]).enableRLS();

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

// ---------------------------------------------------------------------------------------------
// Managed Client Portal — a permission dimension entirely separate from `profiles.plan` (audit
// entitlement). A workspace is one client engagement (one or more Upwork profiles, one account
// manager); membership in it is manual-admin-only, never granted by checkout, and never implies
// anything about `profiles.plan` or vice versa — a person can be both a paying audit subscriber
// and a managed client, or either alone, or neither. See lib/permissions.ts.
// ---------------------------------------------------------------------------------------------

export const clientWorkspaces = pgTable("client_workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  accountManagerEmail: text("account_manager_email").notNull().default(""),
  serviceStartDate: timestamp("service_start_date", { withTimezone: true }),
  objectives: text("objectives").notNull().default(""),
  // "active" = at least intended to be visible; a member's own status (below) further gates
  // whether a specific person can currently see it. "suspended"/"removed" hide the workspace for
  // every member regardless of their individual status — the workspace-level kill switch.
  status: text("status").notNull().default("active"), // "active" | "suspended" | "removed"
  createdByEmail: text("created_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_client_workspaces_status").on(table.status)]).enableRLS();

// Links a verified account id (never an email typed by hand at grant time) to a workspace. One
// row per (workspace, user) — a user could in principle belong to more than one workspace.
export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  status: text("status").notNull().default("active"), // "active" | "suspended" | "removed"
  addedByEmail: text("added_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_workspace_members_workspace_user").on(table.workspaceId, table.userId),
  index("idx_workspace_members_user").on(table.userId, table.status),
]).enableRLS();

// One or more Upwork profiles per workspace, each with its own reports/history/attachments —
// "each profile must have its own data" requirement. A workspace with multiple profiles is what
// drives the client portal's profile selector.
export const workspaceProfiles = pgTable("workspace_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  upworkUrl: text("upwork_url").notNull().default(""),
  goals: text("goals").notNull().default(""),
  status: text("status").notNull().default("active"), // "active" | "archived"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_workspace_profiles_workspace").on(table.workspaceId)]).enableRLS();

export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceProfileId: uuid("workspace_profile_id").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  title: text("title").notNull().default(""),
  workCompleted: text("work_completed").notNull().default(""),
  nextActions: text("next_actions").notNull().default(""),
  clientActionNeeded: text("client_action_needed").notNull().default(""),
  // "draft" is never visible to the client; "preview" is admin/account-manager-only proofing;
  // "published" is the only state the client-facing portal or download endpoint will ever serve.
  status: text("status").notNull().default("draft"), // "draft" | "preview" | "published"
  authorEmail: text("author_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [
  index("idx_weekly_reports_profile_period").on(table.workspaceProfileId, table.periodStart),
  index("idx_weekly_reports_status").on(table.status),
]).enableRLS();

// One row per metric per report. `value` is nullable ON PURPOSE — missing data must render as
// "Not provided", never as 0 (a real, meaningfully different value). `source` records where the
// number came from, since nothing here is pulled from a live Upwork sync unless/until that is
// actually built and verified.
export const reportMetrics = pgTable("report_metrics", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull(),
  // "profile_views" | "invitations" | "proposals_sent" | "replies" | "interviews" | "hires" |
  // "earnings" | "connects_spent"
  metricKey: text("metric_key").notNull(),
  value: real("value"), // null == "Not provided", never coerced to 0
  source: text("source").notNull().default("admin_entered"), // "admin_entered" | "uploaded_evidence"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [uniqueIndex("uq_report_metrics_report_key").on(table.reportId, table.metricKey)]).enableRLS();

export const reportAttachments = pgTable("report_attachments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull(),
  filename: text("filename").notNull(),
  // Populated once the actual upload/storage path is built (Phase 5) — reusing the existing
  // owner-Drive connection (lib/drive.ts) rather than standing up separate storage infra.
  driveFileId: text("drive_file_id"),
  uploadedByEmail: text("uploaded_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_report_attachments_report").on(table.reportId)]).enableRLS();

// Client-visible updates and internal-only notes for a workspace, kept in ONE table with a
// `visibility` flag rather than two tables, specifically so a bug can never leak an internal note
// by querying the wrong table — every read site must filter on `visibility` explicitly, and the
// client-facing endpoint only ever queries `visibility = 'client'`.
export const clientUpdates = pgTable("client_updates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  workspaceProfileId: uuid("workspace_profile_id"), // null = workspace-wide, not profile-specific
  message: text("message").notNull(),
  visibility: text("visibility").notNull(), // "client" | "internal"
  authorEmail: text("author_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_client_updates_workspace_visibility").on(table.workspaceId, table.visibility, table.createdAt)]).enableRLS();

// ---------------------------------------------------------------------------------------------
// Notifications & admin broadcasts
// ---------------------------------------------------------------------------------------------

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  // "managed_access_granted" | "weekly_report_published" | "audit_completed" |
  // "client_action_needed" | "admin_announcement"
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  linkUrl: text("link_url").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_notifications_user_created").on(table.userId, table.createdAt)]).enableRLS();

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  message: text("message").notNull(), // plain text; escaped/rendered into the template at send time
  audience: text("audience").notNull(), // "everyone" | "audit_users" | "subscribers" | "managed_clients" | "selected"
  channel: text("channel").notNull().default("in_app"), // "in_app" | "email" | "both"
  // "promotional" respects profiles.marketingOptOut and any suppression list; "service" never does
  // (access/report/audit notifications are not marketing). Kept separate from `type` on
  // `notifications` because one announcement fans out into many per-user notification rows.
  kind: text("kind").notNull().default("service"), // "service" | "promotional"
  actionLabel: text("action_label").notNull().default(""),
  actionUrl: text("action_url").notNull().default(""),
  createdByEmail: text("created_by_email").notNull().default(""),
  status: text("status").notNull().default("draft"), // "draft" | "sent"
  recipientCount: integer("recipient_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [index("idx_announcements_status_created").on(table.status, table.createdAt)]).enableRLS();

// Only populated when audience = "selected" — the explicit recipient list chosen for that send.
export const announcementTargets = pgTable("announcement_targets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: uuid("announcement_id").notNull(),
  userId: uuid("user_id").notNull(),
}, (table) => [uniqueIndex("uq_announcement_targets_announcement_user").on(table.announcementId, table.userId)]).enableRLS();

// Per-recipient delivery record — this is what makes a retry idempotent (never double-deliver)
// and what lets the admin panel show real queued/provider-accepted/delivered/failed status
// instead of reporting "delivered" just because an API call returned 200. Mirrors the same
// discipline `deliveryJobs`/`emailNotifications` already established for audit-ready emails.
export const announcementRecipients = pgTable("announcement_recipients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: uuid("announcement_id").notNull(),
  userId: uuid("user_id").notNull(),
  inAppStatus: text("in_app_status").notNull().default("queued"), // "queued" | "delivered" | "failed"
  emailStatus: text("email_status").notNull().default("skipped"), // "skipped" | "queued" | "provider_accepted" | "delivered" | "failed" | "suppressed"
  emailProviderMessageId: text("email_provider_message_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_announcement_recipients_announcement_user").on(table.announcementId, table.userId),
  index("idx_announcement_recipients_email_status").on(table.emailStatus),
]).enableRLS();
