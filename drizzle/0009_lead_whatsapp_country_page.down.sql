DROP INDEX IF EXISTS "idx_leads_country";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "whatsapp", DROP COLUMN IF EXISTS "country", DROP COLUMN IF EXISTS "source_page";
-- "mobile" is left in place: it predates this migration on production.
