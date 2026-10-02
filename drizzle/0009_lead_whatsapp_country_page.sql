-- Enquiry form: WhatsApp number, country, and the page the form was on. `mobile` was added to the
-- live database on 2026-09-28 (migration "lead_contact_fields"); it is repeated here with
-- IF NOT EXISTS so this file is correct on a database that never had that one.
-- Purely additive, every column has a default: the build that is live today is unaffected.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "mobile" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "whatsapp" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "country" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source_page" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_country" ON "leads" USING btree ("country");
