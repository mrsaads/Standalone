-- Manual rollback for 0001_ambiguous_scalphunter.sql. Not auto-generated (drizzle-kit does not
-- produce down-migrations) and not wired into scripts/run-migrations.mjs — apply by hand only if
-- you need to revert the reservation/delivery-queue schema change:
--   psql "$SUPABASE_DB_URL" -f drizzle/0001_ambiguous_scalphunter.down.sql
--
-- Safe to run even if 0001 was never applied (every statement is IF EXISTS). Does not touch
-- profile_audits' existing rows or any other table's data — only removes the columns/table 0001
-- added. The changed column DEFAULTs on profile_audits (report_json/score/pass_count/weak_count/
-- fail_count/provider) are deliberately left in place on rollback: they're harmless (existing rows
-- are NOT NULL and unaffected; the defaults only matter for a future INSERT that omits those
-- columns, which nothing does once this rollback removes the "reserved" status flow).

drop table if exists "delivery_jobs";
drop index if exists "idx_profile_audits_status";
alter table "profile_audits" drop column if exists "status";
alter table "profile_audits" drop column if exists "updated_at";
