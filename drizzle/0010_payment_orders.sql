-- Per-report payments (lib/audit-payments.ts). Purely additive: a new table, nothing existing is
-- touched. The app treats a missing table as "nothing is paid" (isAuditPaid fails closed), so the
-- running build is unaffected whether this is applied before or after the code that uses it.
CREATE TABLE IF NOT EXISTS "payment_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "user_email" text NOT NULL,
  "audit_id" uuid NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'PKR' NOT NULL,
  "gateway" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "txn_ref" text NOT NULL,
  "payer_note" text DEFAULT '' NOT NULL,
  "gateway_code" text DEFAULT '' NOT NULL,
  "gateway_message" text DEFAULT '' NOT NULL,
  "paid_at" timestamp with time zone,
  "paid_by" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payment_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_orders_txn_ref" ON "payment_orders" USING btree ("txn_ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_orders_one_paid_per_audit" ON "payment_orders" USING btree ("audit_id") WHERE "payment_orders"."status" = 'paid';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_orders_user" ON "payment_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_orders_status" ON "payment_orders" USING btree ("status","created_at");
