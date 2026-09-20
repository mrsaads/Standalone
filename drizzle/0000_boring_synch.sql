CREATE TABLE "drive_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_email" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"root_folder_id" text NOT NULL,
	"connected_by_email" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drive_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"pdf_status" text DEFAULT 'pending' NOT NULL,
	"docx_status" text DEFAULT 'pending' NOT NULL,
	"pdf_file_id" text,
	"docx_file_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid,
	"user_email" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"platform" text NOT NULL,
	"service" text NOT NULL,
	"buyer" text NOT NULL,
	"budget" text DEFAULT '' NOT NULL,
	"intent" text NOT NULL,
	"challenge" text DEFAULT '' NOT NULL,
	"profile_json" text NOT NULL,
	"score" real NOT NULL,
	"unknown_points" real NOT NULL,
	"recommendation" text NOT NULL,
	"rubric_version" text DEFAULT '1' NOT NULL,
	"consent" boolean NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"profile_key" text NOT NULL,
	"profile_url" text DEFAULT '' NOT NULL,
	"profile_name" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"report_json" text NOT NULL,
	"score" real NOT NULL,
	"pass_count" integer NOT NULL,
	"weak_count" integer NOT NULL,
	"fail_count" integer NOT NULL,
	"provider" text NOT NULL,
	"rubric_version" text DEFAULT '23-point-v1' NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"mobile" text DEFAULT '' NOT NULL,
	"upwork_link" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'base' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_drive_uploads_audit" ON "drive_uploads" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "idx_email_notifications_audit_kind" ON "email_notifications" USING btree ("audit_id","kind");--> statement-breakpoint
CREATE INDEX "idx_enquiries_email_created" ON "enquiries" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "idx_profile_audits_user_created" ON "profile_audits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_profile_audits_user_profile" ON "profile_audits" USING btree ("user_id","profile_key","created_at");--> statement-breakpoint
CREATE INDEX "idx_profiles_email" ON "profiles" USING btree ("email");
--> statement-breakpoint
-- profiles.id is intentionally the same uuid as Supabase's auth.users.id (see db/schema.ts's
-- comment). drizzle-kit cannot express a cross-schema FK from its pg-core table builder, so it's
-- added here by hand: this ties a profile row's lifetime to its auth user and, together with
-- ON DELETE CASCADE, means deleting a customer from Supabase Auth (e.g. a GDPR request) also
-- removes their profile row automatically rather than leaving an orphaned one behind.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_fk" FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;
-- These tables are only ever reached through this app's server, via a direct Postgres connection
-- (SUPABASE_DB_URL) that bypasses PostgREST/RLS entirely by design (see db/index.ts's comment) —
-- so Row Level Security is deliberately left off here. If any of these tables are ever exposed
-- through Supabase's PostgREST/anon-key API directly, enable RLS and add matching policies first.