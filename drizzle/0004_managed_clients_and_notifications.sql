CREATE TABLE "announcement_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"suppression_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT 'everyone' NOT NULL,
	"audience_user_ids" text DEFAULT '[]' NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"category" text DEFAULT 'service' NOT NULL,
	"action_label" text DEFAULT '' NOT NULL,
	"action_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_email" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"service_start_date" date,
	"objectives" text DEFAULT '' NOT NULL,
	"account_manager" text DEFAULT '' NOT NULL,
	"created_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "management_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"handled_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "management_enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"dedupe_key" text NOT NULL,
	"announcement_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_provider" text DEFAULT 'drive' NOT NULL,
	"drive_file_id" text,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"uploaded_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"value" real,
	"source" text DEFAULT 'admin_entered' NOT NULL,
	"period_start" date,
	"period_end" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"requires_client_action" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workspace_profile_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"overview" text DEFAULT '' NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"work_completed" text DEFAULT '' NOT NULL,
	"next_actions" text DEFAULT '' NOT NULL,
	"client_actions" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_email" text DEFAULT '' NOT NULL,
	"created_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by_email" text DEFAULT '' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"upwork_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "uq_delivery_jobs_audit_kind";--> statement-breakpoint
ALTER TABLE "delivery_jobs" ALTER COLUMN "audit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD COLUMN "subject_type" text DEFAULT 'audit' NOT NULL;--> statement-breakpoint
-- HAND-EDITED, do not regenerate over this block.
-- drizzle-kit emitted `ADD COLUMN "subject_id" uuid NOT NULL` in one statement. That form only
-- succeeds on an empty table: with any row present Postgres cannot satisfy NOT NULL and the whole
-- migration aborts. delivery_jobs happens to be empty right now, but a single audit enqueued
-- between writing this and running it would break the deploy. Split into add-nullable, backfill
-- from the audit id the row already has, then enforce NOT NULL -- correct either way.
ALTER TABLE "delivery_jobs" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
UPDATE "delivery_jobs" SET "subject_id" = "audit_id" WHERE "subject_id" IS NULL;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_audits" ADD COLUMN "credit_spent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "audit_entitlement" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
-- HAND-EDITED, do not regenerate over this block.
-- drizzle-kit only knows the new column's default, so every existing profile would land on 'free'
-- and anyone currently marked 'subscriber' would silently lose their audit entitlement the moment
-- this deployed. Carry the legacy `plan` value across explicitly. `plan` itself is deliberately
-- left untouched so this migration stays reversible against live data.
UPDATE "profiles" SET "audit_entitlement" = 'subscribed' WHERE "plan" = 'subscriber';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "audit_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "audit_credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "marketing_opt_in" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_announcement_deliveries_ann_user_channel" ON "announcement_deliveries" USING btree ("announcement_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "idx_announcement_deliveries_ann_status" ON "announcement_deliveries" USING btree ("announcement_id","status");--> statement-breakpoint
CREATE INDEX "idx_announcements_status_created" ON "announcements" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_invites_token" ON "client_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_client_invites_workspace_email" ON "client_invites" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_workspaces_slug" ON "client_workspaces" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_client_workspaces_status" ON "client_workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_management_enquiries_status_created" ON "management_enquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_management_enquiries_user" ON "management_enquiries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_user_kind_dedupe" ON "notifications" USING btree ("user_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_unread" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_report_attachments_report" ON "report_attachments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "idx_report_attachments_workspace" ON "report_attachments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_metrics_report_key" ON "report_metrics" USING btree ("report_id","metric_key");--> statement-breakpoint
CREATE INDEX "idx_report_updates_report_created" ON "report_updates" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_weekly_reports_profile_period" ON "weekly_reports" USING btree ("workspace_profile_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_weekly_reports_workspace_status" ON "weekly_reports" USING btree ("workspace_id","status","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspace_members_workspace_user" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_members_user_status" ON "workspace_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_workspace_notes_workspace_created" ON "workspace_notes" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_workspace_profiles_workspace" ON "workspace_profiles" USING btree ("workspace_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_jobs_subject_kind" ON "delivery_jobs" USING btree ("subject_type","subject_id","kind");