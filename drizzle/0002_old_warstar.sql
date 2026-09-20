ALTER TABLE "delivery_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_audits" ADD COLUMN "lease_token" uuid;