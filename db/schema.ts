import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  // AXIS 1 of 3 — ACCOUNT ROLE. What this person is inside the product's own administration.
  // Completely independent of what they can do with audits (axis 2) and of whether they are a
  // managed client (axis 3). An admin is not automatically a managed client, and a managed client
  // is never made an admin by being assigned to a workspace.
  role: text("role").notNull().default("base"), // "base" | "admin"

  // AXIS 2 of 3 — AUDIT ENTITLEMENT. What this person may do with the AI profile-audit product.
  // Manually managed by an admin from the admin panel only (see app/api/admin/users/[id]/plan) —
  // there is no payment provider integration, so this is never set by a webhook or a checkout flow.
  //   "free"          = one successful audit per rolling 7 days, on-screen preview only, no PDF/
  //                     Word export and no AI optimization section.
  //   "subscribed"    = full audit access.
  //   "admin_granted" = full audit access that an admin granted directly, tracked separately from
  //                     "subscribed" so "who is actually paying" stays answerable. Functionally the
  //                     same permissions; the distinction is a record, not a capability.
  // Admin accounts get full audit access regardless of this value (see lib/entitlements.ts).
  // IMPORTANT: this is deliberately NOT derived from managed-client membership. A managed client
  // with no audit entitlement is still "free" here; their included audit allowance is granted
  // separately, as `auditCredits` below.
  auditEntitlement: text("audit_entitlement").notNull().default("free"),

  // Configurable audit allowance, granted by an admin — NOT a purchased plan and not tied to any
  // checkout. This is the "keep audit allowances configurable rather than inventing a paid plan"
  // requirement, and it is also how a managed client's *included* audits are granted: the admin
  // sets a number here, separately from the workspace assignment itself.
  // These credits are spent only after the free weekly allowance is exhausted — see
  // lib/audit-limit.ts. `auditCreditsUsed` never decreases; remaining = granted - used.
  auditCredits: integer("audit_credits").notNull().default(0),
  auditCreditsUsed: integer("audit_credits_used").notNull().default(0),

  // LEGACY. Superseded by `auditEntitlement` above, which migration 0004 backfills from this
  // column. Nothing in the application reads or writes `plan` any more. Left in place (rather than
  // dropped in the same migration that stops using it) so 0004 stays reversible against live data;
  // safe to drop in a later migration once 0004 has been verified in production.
  plan: text("plan").notNull().default("free"),
  planUpdatedAt: timestamp("plan_updated_at", { withTimezone: true }).notNull().default(sql`now()`),

  // Marketing preference, honoured by promotional broadcasts only. Service notifications (a report
  // was published, your audit finished, your access changed) are NOT marketing and are never
  // suppressed by this flag — see lib/announcements.ts.
  marketingOptIn: boolean("marketing_opt_in").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_profiles_email").on(table.email)]).enableRLS();

// ---------------------------------------------------------------------------------------------
// AXIS 3 of 3 — MANAGED-CLIENT MEMBERSHIP
//
// A workspace is one managed client of the Improvexus profile-management service. Membership in
// one is granted ONLY by an admin, from the admin panel — there is no checkout, no subscription
// check, and no self-service path into one. Submitting the "request management services" enquiry
// creates a row in `managementEnquiries` and nothing else; it never grants access.
//
// Access to everything under a workspace (reports, attachments, notifications, downloads) is
// decided by an *active* `workspaceMembers` row for that exact (workspace, user) pair, and by
// nothing else. In particular it is never granted by `profiles.role`, by `profiles.auditEntitlement`,
// or by holding a link to a report id — see lib/workspace-access.ts, which is the single function
// every workspace-scoped route calls.
// ---------------------------------------------------------------------------------------------

export const clientWorkspaces = pgTable("client_workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Human-friendly stable identifier, used in URLs and in admin search. Unique so two workspaces
  // can never collide in a URL.
  slug: text("slug").notNull(),
  // "active" = members may open the portal. "suspended" = access is withdrawn without deleting any
  // history, so a suspension is reversible and auditable. Checked on every request, not just at
  // assignment time.
  status: text("status").notNull().default("active"), // active | suspended
  serviceStartDate: date("service_start_date"),
  objectives: text("objectives").notNull().default(""),
  accountManager: text("account_manager").notNull().default(""),
  createdByEmail: text("created_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_client_workspaces_slug").on(table.slug),
  index("idx_client_workspaces_status").on(table.status),
]).enableRLS();

// The assignment itself. `userId` is always a verified Supabase `auth.users.id` — the admin API
// refuses to create one of these for an unconfirmed or non-existent account, which is the "link
// assignments to verified account IDs" requirement. Revoking sets status to "inactive" and stamps
// `revokedAt` rather than deleting the row, so the history of who had access when survives.
export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  status: text("status").notNull().default("active"), // active | inactive
  grantedByEmail: text("granted_by_email").notNull().default(""),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().default(sql`now()`),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  // One membership row per (workspace, user) — re-granting access to someone who was revoked
  // reactivates the existing row instead of stacking duplicates.
  uniqueIndex("uq_workspace_members_workspace_user").on(table.workspaceId, table.userId),
  index("idx_workspace_members_user_status").on(table.userId, table.status),
]).enableRLS();

// An Upwork profile managed under a workspace. A client can have several; each one carries its own
// reports, metrics and attachments, which is why every report is keyed to a profile and not just
// to a workspace.
export const workspaceProfiles = pgTable("workspace_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  upworkUrl: text("upwork_url").notNull().default(""),
  status: text("status").notNull().default("active"), // active | archived
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_workspace_profiles_workspace").on(table.workspaceId, table.sortOrder),
]).enableRLS();

// An admin inviting somebody who does not have an account yet. Only a SHA-256 hash of the invite
// token is stored, never the token itself, so a database read cannot be replayed as an invite
// acceptance. The invited person sets their own password through Supabase's own signup flow — this
// app never creates, stores, or displays a password for anyone.
export const clientInvites = pgTable("client_invites", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedByEmail: text("invited_by_email").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedUserId: uuid("accepted_user_id"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_client_invites_token").on(table.tokenHash),
  index("idx_client_invites_workspace_email").on(table.workspaceId, table.email),
]).enableRLS();

// Internal notes about a managed client. NEVER returned by any client-facing route — the portal
// API does not select from this table at all, which is a stronger guarantee than a visibility flag
// on a shared table would be. Client-visible commentary goes in `reportUpdates` instead.
export const workspaceNotes = pgTable("workspace_notes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  authorEmail: text("author_email").notNull().default(""),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_workspace_notes_workspace_created").on(table.workspaceId, table.createdAt),
]).enableRLS();

// A weekly management report for one managed profile. This is NOT an AI profile audit — different
// table, different product, different permission. A managed client reads these without any audit
// entitlement whatsoever.
//
// Draft vs published is the whole safety mechanism here: a client-facing query filters on
// `status = 'published'` in SQL, so an unfinished report is not merely hidden in the UI — it is
// never selected for a client in the first place.
export const weeklyReports = pgTable("weekly_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  workspaceProfileId: uuid("workspace_profile_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("draft"), // draft | published
  title: text("title").notNull().default(""),
  // Profile overview and the goals as they stand for this period.
  overview: text("overview").notNull().default(""),
  goals: text("goals").notNull().default(""),
  workCompleted: text("work_completed").notNull().default(""),
  nextActions: text("next_actions").notNull().default(""),
  // Questions or actions that need the client to do something.
  clientActions: text("client_actions").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedByEmail: text("published_by_email").notNull().default(""),
  createdByEmail: text("created_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  // One report per profile per period — re-entering the same week edits the existing report rather
  // than creating a second, competing one.
  uniqueIndex("uq_weekly_reports_profile_period").on(table.workspaceProfileId, table.periodStart, table.periodEnd),
  index("idx_weekly_reports_workspace_status").on(table.workspaceId, table.status, table.periodEnd),
]).enableRLS();

// One measured value on a weekly report.
//
// `value` is deliberately NULLABLE and there is no default. A metric nobody entered has value NULL
// and renders as "Not provided" — it must never render as 0, because 0 is a real measurement
// ("you sent no proposals this week") and conflating the two would silently invent data. Every
// period-over-period comparison also has to skip NULLs on either side rather than treating them as
// zero, and must not divide by a previous value of 0 — see lib/report-metrics.ts.
//
// `source` and the per-metric period are stored per row because different metrics on one report
// can legitimately come from different places and cover different windows (a screenshot of
// last month's earnings next to this week's hand-counted invitations).
export const reportMetrics = pgTable("report_metrics", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull(),
  metricKey: text("metric_key").notNull(), // see METRIC_KEYS in lib/report-metrics.ts
  value: real("value"), // NULL means "Not provided". Never coalesce this to 0.
  source: text("source").notNull().default("admin_entered"), // admin_entered | upwork_export | screenshot | other
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_report_metrics_report_key").on(table.reportId, table.metricKey),
]).enableRLS();

// Evidence and deliverables attached to a report. `workspaceId` is denormalized from the report on
// purpose: the download route can then authorize an attachment with one indexed lookup against the
// caller's memberships, without trusting anything the caller sent.
export const reportAttachments = pgTable("report_attachments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storageProvider: text("storage_provider").notNull().default("drive"),
  driveFileId: text("drive_file_id"),
  // An attachment is internal until an admin marks it client-visible, and a client-facing query
  // filters on this in SQL — same reasoning as the draft/published split above.
  visibleToClient: boolean("visible_to_client").notNull().default(false),
  uploadedByEmail: text("uploaded_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_report_attachments_report").on(table.reportId),
  index("idx_report_attachments_workspace").on(table.workspaceId),
]).enableRLS();

// Client-visible commentary on a report, kept separate from `workspaceNotes` so an internal note
// and a client update can never be confused for one another by a query mistake.
export const reportUpdates = pgTable("report_updates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  body: text("body").notNull().default(""),
  authorEmail: text("author_email").notNull().default(""),
  // Whether this update needs the client to act — drives the "action required" notification and
  // the portal's own call-out.
  requiresClientAction: boolean("requires_client_action").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_report_updates_report_created").on(table.reportId, table.createdAt),
]).enableRLS();

// A signed-in user asking to be considered for the profile-management service. Creating one of
// these grants NOTHING — it is a lead, and an admin still has to create the assignment by hand.
export const managementEnquiries = pgTable("management_enquiries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("new"), // new | contacted | converted | declined
  handledByEmail: text("handled_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_management_enquiries_status_created").on(table.status, table.createdAt),
  index("idx_management_enquiries_user").on(table.userId),
]).enableRLS();

// ---------------------------------------------------------------------------------------------
// NOTIFICATIONS AND ADMIN BROADCASTS
// ---------------------------------------------------------------------------------------------

// One in-app notification for one user. `dedupeKey` plus the unique index below is what makes
// notification creation idempotent: publishing the same report twice, or a retried request, cannot
// produce two "weekly report published" rows for the same user and the same report.
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(), // managed_access_granted | weekly_report_published | audit_completed | action_required | announcement
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  // Where this notification takes you. Always an app-relative path produced by our own server
  // code, never a URL supplied by a form — see lib/notifications.ts.
  link: text("link").notNull().default(""),
  // The thing this notification is about (a report id, a workspace id, an announcement id).
  dedupeKey: text("dedupe_key").notNull(),
  announcementId: uuid("announcement_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_notifications_user_kind_dedupe").on(table.userId, table.kind, table.dedupeKey),
  index("idx_notifications_user_created").on(table.userId, table.createdAt),
  index("idx_notifications_user_unread").on(table.userId, table.readAt),
]).enableRLS();

// An admin announcement. The admin's own wording is stored verbatim in `body` as plain text and is
// escaped at render time — no AI call is involved in composing or formatting one, so announcements
// keep working when AI credits are unavailable.
//
// `category` separates a promotional announcement from a service notification. Promotional sends
// honour `profiles.marketingOptIn` and the provider suppression list; service notifications do not,
// because a client must not be able to opt out of being told their access changed.
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  audience: text("audience").notNull().default("everyone"), // everyone | audit_users | subscribers | managed_clients | selected
  // JSON array of user ids, used only when audience = "selected".
  audienceUserIds: text("audience_user_ids").notNull().default("[]"),
  channel: text("channel").notNull().default("in_app"), // in_app | email | both
  category: text("category").notNull().default("service"), // service | promotional
  actionLabel: text("action_label").notNull().default(""),
  // Validated against an allow-list of shapes before it is stored — see lib/announcements.ts.
  actionUrl: text("action_url").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | sending | sent | failed
  // Snapshot of how many recipients the audience resolved to at send time, shown in the confirm
  // step before sending and kept afterwards as part of the record.
  recipientCount: integer("recipient_count").notNull().default(0),
  createdByEmail: text("created_by_email").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  index("idx_announcements_status_created").on(table.status, table.createdAt),
]).enableRLS();

// One delivery attempt record per (announcement, user, channel). The unique index is the duplicate-
// delivery guard: retrying a partially-failed broadcast re-processes only rows that are not already
// terminal, and can never insert a second row for a recipient who was already reached.
//
// The status ladder is deliberately finer than "sent": "queued" (we have a row, nothing attempted),
// "accepted" (the email provider's API accepted the request — this is NOT proof of delivery),
// "delivered" (the provider told us, via webhook, that it reached the mailbox), "failed", and
// "suppressed" (we deliberately did not send: opted out of marketing, or on the suppression list).
// Nothing in the UI reports "delivered" on the strength of an accepted API call alone.
export const announcementDeliveries = pgTable("announcement_deliveries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: uuid("announcement_id").notNull(),
  userId: uuid("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  channel: text("channel").notNull(), // in_app | email
  status: text("status").notNull().default("queued"), // queued | accepted | delivered | failed | suppressed
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  suppressionReason: text("suppression_reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uq_announcement_deliveries_ann_user_channel").on(table.announcementId, table.userId, table.channel),
  index("idx_announcement_deliveries_ann_status").on(table.announcementId, table.status),
]).enableRLS();

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
  // True when this reservation was admitted by spending one of the account's admin-granted audit
  // credits rather than by the rolling weekly allowance. Stored per audit (rather than inferred)
  // so releasing a failed reservation can refund exactly the credit it spent and nothing else —
  // see releaseReservation() in lib/audit-limit.ts. An AI failure must never cost a credit.
  creditSpent: boolean("credit_spent").notNull().default(false),
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
// Generalized in migration 0004 so admin broadcasts reuse this same queue rather than growing a
// second, parallel one: `subjectType` says what kind of thing the job is about and `subjectId` is
// that thing's id. `auditId` is kept (and still populated for audit jobs) so the existing audit
// delivery code paths and their tests are unchanged; it is nullable now because an announcement job
// has no audit. The uniqueness guarantee moved with it — see the index list below.
export const deliveryJobs = pgTable("delivery_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: uuid("audit_id"),
  subjectType: text("subject_type").notNull().default("audit"), // audit | announcement
  subjectId: uuid("subject_id").notNull(),
  kind: text("kind").notNull(), // "drive" | "email" | "announcement_email"
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
  // The idempotency guarantee, moved from (audit_id, kind) to (subject_type, subject_id, kind) in
  // migration 0004. For an audit job subject_id IS the audit id, so this is exactly as strict as
  // the index it replaces — enqueuing "drive" twice for one audit is still a no-op — while also
  // covering announcement jobs, which have no audit id at all.
  uniqueIndex("uq_delivery_jobs_subject_kind").on(table.subjectType, table.subjectId, table.kind),
  index("idx_delivery_jobs_claimable").on(table.status, table.nextAttemptAt),
]).enableRLS();

// Public landing-page / access-request leads (app/api/leads, lib/leads.ts). Restored after the
// managed-clients rewrite dropped it from this file while the live table (with real rows) and the
// code that writes to it both still exist.
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  profileLink: text("profile_link").notNull().default(""),
  goals: text("goals").notNull().default(""),
  // Contact numbers, stored as "+<country code> <number>" (see normalizePhone in lib/leads.ts).
  // Blank only on rows that predate the fields becoming mandatory.
  mobile: text("mobile").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  // ISO 3166-1 alpha-2 of the country picked for the mobile number — where the person actually is,
  // which a shared calling code like +1 cannot tell you.
  country: text("country").notNull().default(""),
  // Path of the page the form was submitted from (e.g. /services/upwork-proposal-support).
  sourcePage: text("source_page").notNull().default(""),
  source: text("source").notNull(), // see LEAD_SOURCES in lib/leads.ts
  userId: uuid("user_id"), // set only for a signed-in user's access-request submission
  status: text("status").notNull().default("new"), // "new" | "reviewed" | "actioned"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_leads_email_created").on(table.email, table.createdAt),
  index("idx_leads_status").on(table.status),
  index("idx_leads_country").on(table.country),
]).enableRLS();

// Abuse limits for auth emails (signup verification, resend, password reset) and failed logins —
// see lib/security/email-throttle.ts. One row per bucket, e.g. `email:browser:<browser id>`,
// `email:ip:<hash>`, `email:recipient:<hash>`, `login:account:<hash>`. IPs and email addresses are
// only ever stored as keyed hashes. Rows are tiny and self-cleaning (idle rows are deleted).
export const authEmailThrottle = pgTable("auth_email_throttle", {
  bucket: text("bucket").primaryKey(),
  hits: integer("hits").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().default(sql`now()`),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [index("idx_auth_email_throttle_updated").on(table.updatedAt)]).enableRLS();
