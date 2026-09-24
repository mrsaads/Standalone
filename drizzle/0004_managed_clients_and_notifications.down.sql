-- Rollback for 0004_managed_clients_and_notifications.
--
-- Safe to run as long as the application code has been rolled back to a build that does not read
-- the dropped columns/tables. Dropping the managed-client tables destroys workspaces, memberships,
-- weekly reports, metrics, attachments, notifications and announcements — take a backup first if
-- any real client data exists. Nothing here touches `profiles.plan`, which 0004 deliberately left
-- populated, so audit entitlement survives the round trip.

-- 1. Restore delivery_jobs to its pre-0004 shape. Audit jobs keep working throughout: for those
--    rows subject_id was only ever a copy of audit_id, so no information is lost. Announcement
--    jobs, if any exist, cannot be represented in the old shape and are deleted first — they have
--    no audit_id, so leaving them would fail the NOT NULL below.
DELETE FROM "delivery_jobs" WHERE "subject_type" <> 'audit';--> statement-breakpoint
DROP INDEX IF EXISTS "uq_delivery_jobs_subject_kind";--> statement-breakpoint
ALTER TABLE "delivery_jobs" DROP COLUMN IF EXISTS "subject_id";--> statement-breakpoint
ALTER TABLE "delivery_jobs" DROP COLUMN IF EXISTS "subject_type";--> statement-breakpoint
ALTER TABLE "delivery_jobs" ALTER COLUMN "audit_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_jobs_audit_kind" ON "delivery_jobs" USING btree ("audit_id","kind");--> statement-breakpoint

-- 2. Remove the audit-entitlement axis. `plan` was never stopped being written by 0004's own
--    backfill, so the pre-0004 code reads correct values again immediately.
ALTER TABLE "profile_audits" DROP COLUMN IF EXISTS "credit_spent";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "marketing_opt_in";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "audit_credits_used";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "audit_credits";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "audit_entitlement";--> statement-breakpoint

-- 3. Drop the managed-client, reporting, notification and broadcast tables. Ordered so that a
--    table is dropped before anything that refers to it by id, even though these are application-
--    level references rather than declared foreign keys.
DROP TABLE IF EXISTS "announcement_deliveries";--> statement-breakpoint
DROP TABLE IF EXISTS "announcements";--> statement-breakpoint
DROP TABLE IF EXISTS "notifications";--> statement-breakpoint
DROP TABLE IF EXISTS "report_attachments";--> statement-breakpoint
DROP TABLE IF EXISTS "report_updates";--> statement-breakpoint
DROP TABLE IF EXISTS "report_metrics";--> statement-breakpoint
DROP TABLE IF EXISTS "weekly_reports";--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_notes";--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_profiles";--> statement-breakpoint
DROP TABLE IF EXISTS "client_invites";--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_members";--> statement-breakpoint
DROP TABLE IF EXISTS "client_workspaces";--> statement-breakpoint
DROP TABLE IF EXISTS "management_enquiries";
