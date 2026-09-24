-- Rolls back 0007 on an otherwise-untouched database. The managed-client tables are recreated in
-- their OLD (0004_cloudy_unicorn) shape, empty — only run this before any client data exists.
DROP TRIGGER IF EXISTS trg_delivery_jobs_fill_subject_id ON delivery_jobs;
DROP FUNCTION IF EXISTS public.delivery_jobs_fill_subject_id();
DROP INDEX IF EXISTS uq_delivery_jobs_subject_kind;
ALTER TABLE delivery_jobs DROP COLUMN IF EXISTS subject_id;
ALTER TABLE delivery_jobs DROP COLUMN IF EXISTS subject_type;
ALTER TABLE profile_audits DROP COLUMN IF EXISTS credit_spent;
ALTER TABLE profiles DROP COLUMN IF EXISTS audit_entitlement, DROP COLUMN IF EXISTS audit_credits,
  DROP COLUMN IF EXISTS audit_credits_used, DROP COLUMN IF EXISTS marketing_opt_in;
DROP TABLE IF EXISTS announcement_deliveries, client_invites, management_enquiries, report_updates, workspace_notes,
  announcements, client_workspaces, notifications, report_attachments, report_metrics, weekly_reports,
  workspace_members, workspace_profiles;
-- then re-run the CREATE TABLE / CREATE INDEX statements for those eight tables from
-- drizzle/0004_cloudy_unicorn.sql.
