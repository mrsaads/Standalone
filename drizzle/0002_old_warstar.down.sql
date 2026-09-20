-- Manual rollback for 0002_old_warstar.sql.
--   psql "$SUPABASE_DB_URL" -f drizzle/0002_old_warstar.down.sql
-- Disabling RLS only matters if something started relying on PostgREST/anon-key access to these
-- tables after 0002 was applied (nothing in this app does) — safe to run either way. Dropping
-- lease_token loses any in-flight reservation's fencing token, which only matters for a reservation
-- that is still "reserved" (not yet completed/failed) at the moment you run this.

alter table "profile_audits" drop column if exists "lease_token";
alter table "profiles" disable row level security;
alter table "profile_audits" disable row level security;
alter table "enquiries" disable row level security;
alter table "email_notifications" disable row level security;
alter table "drive_uploads" disable row level security;
alter table "drive_connections" disable row level security;
alter table "delivery_jobs" disable row level security;
