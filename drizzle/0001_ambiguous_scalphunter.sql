CREATE TABLE "delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_audits" ALTER COLUMN "report_json" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "profile_audits" ALTER COLUMN "score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profile_audits" ALTER COLUMN "pass_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profile_audits" ALTER COLUMN "weak_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profile_audits" ALTER COLUMN "fail_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profile_audits" ALTER COLUMN "provider" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "profile_audits" ADD COLUMN "status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_audits" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_jobs_audit_kind" ON "delivery_jobs" USING btree ("audit_id","kind");--> statement-breakpoint
CREATE INDEX "idx_delivery_jobs_claimable" ON "delivery_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_profile_audits_status" ON "profile_audits" USING btree ("status","updated_at");