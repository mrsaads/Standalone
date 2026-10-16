-- Short-lived holding row for a customer's own Upwork profile read through Upwork's official API.
-- Created by the OAuth callback, deleted when the score request claims it, swept after expires_at.
-- Purely additive. RLS on with no policies: only the server's service-role connection can read it.
CREATE TABLE IF NOT EXISTS "upwork_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "upwork_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upwork_connections_expires" ON "upwork_connections" USING btree ("expires_at");
