CREATE TABLE "announcement_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"in_app_status" text DEFAULT 'queued' NOT NULL,
	"email_status" text DEFAULT 'skipped' NOT NULL,
	"email_provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "announcement_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"audience" text NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"kind" text DEFAULT 'service' NOT NULL,
	"action_label" text DEFAULT '' NOT NULL,
	"action_url" text DEFAULT '' NOT NULL,
	"created_by_email" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workspace_profile_id" uuid,
	"message" text NOT NULL,
	"visibility" text NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_manager_email" text DEFAULT '' NOT NULL,
	"service_start_date" timestamp with time zone,
	"objectives" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link_url" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"drive_file_id" text,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_profile_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"work_completed" text DEFAULT '' NOT NULL,
	"next_actions" text DEFAULT '' NOT NULL,
	"client_action_needed" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "weekly_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"added_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"upwork_url" text DEFAULT '' NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bonus_audit_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "marketing_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_announcement_recipients_announcement_user" ON "announcement_recipients" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_recipients_email_status" ON "announcement_recipients" USING btree ("email_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_announcement_targets_announcement_user" ON "announcement_targets" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_announcements_status_created" ON "announcements" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_client_updates_workspace_visibility" ON "client_updates" USING btree ("workspace_id","visibility","created_at");--> statement-breakpoint
CREATE INDEX "idx_client_workspaces_status" ON "client_workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_report_attachments_report" ON "report_attachments" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_metrics_report_key" ON "report_metrics" USING btree ("report_id","metric_key");--> statement-breakpoint
CREATE INDEX "idx_weekly_reports_profile_period" ON "weekly_reports" USING btree ("workspace_profile_id","period_start");--> statement-breakpoint
CREATE INDEX "idx_weekly_reports_status" ON "weekly_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspace_members_workspace_user" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_members_user" ON "workspace_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_workspace_profiles_workspace" ON "workspace_profiles" USING btree ("workspace_id");