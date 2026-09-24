-- 0007: reconcile the LIVE database with the managed-clients code (db/schema.ts).
--
-- Why this exists instead of 0004_managed_clients_and_notifications.sql: that file was generated
-- against an older copy of the schema that did not yet have the first client-portal tables
-- (0004_cloudy_unicorn, already applied to production). Running it on production fails on the
-- first CREATE TABLE ("relation already exists"). This file starts from what production actually
-- has (verified table-by-table on 2026-09-24) and ends at exactly what db/schema.ts declares
-- (verified by diffing against a database built from db/schema.ts with drizzle-kit push).
--
-- Data safety:
--   * The eight old managed-client tables are dropped and recreated in their new shape. That is only
--     safe because they are EMPTY; the guard below aborts the whole migration if any has a row.
--   * profiles / profile_audits keep their legacy columns (plan, bonus_audit_credits,
--     marketing_opt_out, preferred_destination, used_bonus_credit) and the new columns are
--     backfilled from them, so nothing is lost and old code keeps working until the new code lands.
--   * delivery_jobs keeps its old unique index and gets a small trigger that fills subject_id from
--     audit_id, so the code that is live RIGHT NOW (which doesn't know about subject_id) can still
--     enqueue audit deliveries between this migration and the new deploy. Both can be removed later
--     in a later cleanup migration once the new code is live (see the handover).

DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM announcements) + (SELECT count(*) FROM client_workspaces)
       + (SELECT count(*) FROM notifications) + (SELECT count(*) FROM report_attachments)
       + (SELECT count(*) FROM report_metrics) + (SELECT count(*) FROM weekly_reports)
       + (SELECT count(*) FROM workspace_members) + (SELECT count(*) FROM workspace_profiles)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Refusing to recreate managed-client tables: they contain % row(s). Migrate that data by hand first.', n;
  END IF;
END $$;

DROP TABLE announcements;
DROP TABLE client_workspaces;
DROP TABLE notifications;
DROP TABLE report_attachments;
DROP TABLE report_metrics;
DROP TABLE weekly_reports;
DROP TABLE workspace_members;
DROP TABLE workspace_profiles;

-- ---- new-shape managed-client tables (DDL taken verbatim from a db/schema.ts-built database) ----
CREATE TABLE public.announcement_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_email text NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_message_id text,
    last_error text,
    suppression_reason text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    audience text DEFAULT 'everyone'::text NOT NULL,
    audience_user_ids text DEFAULT '[]'::text NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    category text DEFAULT 'service'::text NOT NULL,
    action_label text DEFAULT ''::text NOT NULL,
    action_url text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    recipient_count integer DEFAULT 0 NOT NULL,
    created_by_email text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);
CREATE TABLE public.client_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    invited_by_email text DEFAULT ''::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_user_id uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.client_workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    service_start_date date,
    objectives text DEFAULT ''::text NOT NULL,
    account_manager text DEFAULT ''::text NOT NULL,
    created_by_email text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.management_enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_email text NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    handled_by_email text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    link text DEFAULT ''::text NOT NULL,
    dedupe_key text NOT NULL,
    announcement_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.report_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    file_name text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    storage_provider text DEFAULT 'drive'::text NOT NULL,
    drive_file_id text,
    visible_to_client boolean DEFAULT false NOT NULL,
    uploaded_by_email text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.report_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    metric_key text NOT NULL,
    value real,
    source text DEFAULT 'admin_entered'::text NOT NULL,
    period_start date,
    period_end date,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.report_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    author_email text DEFAULT ''::text NOT NULL,
    requires_client_action boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.weekly_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    workspace_profile_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    overview text DEFAULT ''::text NOT NULL,
    goals text DEFAULT ''::text NOT NULL,
    work_completed text DEFAULT ''::text NOT NULL,
    next_actions text DEFAULT ''::text NOT NULL,
    client_actions text DEFAULT ''::text NOT NULL,
    published_at timestamp with time zone,
    published_by_email text DEFAULT ''::text NOT NULL,
    created_by_email text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_email text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    granted_by_email text DEFAULT ''::text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);
CREATE TABLE public.workspace_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    author_email text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.workspace_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    upwork_url text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.announcement_deliveries
    ADD CONSTRAINT announcement_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_invites
    ADD CONSTRAINT client_invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_workspaces
    ADD CONSTRAINT client_workspaces_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.management_enquiries
    ADD CONSTRAINT management_enquiries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_attachments
    ADD CONSTRAINT report_attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_metrics
    ADD CONSTRAINT report_metrics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_updates
    ADD CONSTRAINT report_updates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.weekly_reports
    ADD CONSTRAINT weekly_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspace_notes
    ADD CONSTRAINT workspace_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspace_profiles
    ADD CONSTRAINT workspace_profiles_pkey PRIMARY KEY (id);
CREATE INDEX idx_announcement_deliveries_ann_status ON public.announcement_deliveries USING btree (announcement_id, status);
CREATE INDEX idx_announcements_status_created ON public.announcements USING btree (status, created_at);
CREATE INDEX idx_client_invites_workspace_email ON public.client_invites USING btree (workspace_id, email);
CREATE INDEX idx_client_workspaces_status ON public.client_workspaces USING btree (status);
CREATE INDEX idx_management_enquiries_status_created ON public.management_enquiries USING btree (status, created_at);
CREATE INDEX idx_management_enquiries_user ON public.management_enquiries USING btree (user_id);
CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read_at);
CREATE INDEX idx_report_attachments_report ON public.report_attachments USING btree (report_id);
CREATE INDEX idx_report_attachments_workspace ON public.report_attachments USING btree (workspace_id);
CREATE INDEX idx_report_updates_report_created ON public.report_updates USING btree (report_id, created_at);
CREATE INDEX idx_weekly_reports_workspace_status ON public.weekly_reports USING btree (workspace_id, status, period_end);
CREATE INDEX idx_workspace_members_user_status ON public.workspace_members USING btree (user_id, status);
CREATE INDEX idx_workspace_notes_workspace_created ON public.workspace_notes USING btree (workspace_id, created_at);
CREATE INDEX idx_workspace_profiles_workspace ON public.workspace_profiles USING btree (workspace_id, sort_order);
CREATE UNIQUE INDEX uq_announcement_deliveries_ann_user_channel ON public.announcement_deliveries USING btree (announcement_id, user_id, channel);
CREATE UNIQUE INDEX uq_client_invites_token ON public.client_invites USING btree (token_hash);
CREATE UNIQUE INDEX uq_client_workspaces_slug ON public.client_workspaces USING btree (slug);
CREATE UNIQUE INDEX uq_notifications_user_kind_dedupe ON public.notifications USING btree (user_id, kind, dedupe_key);
CREATE UNIQUE INDEX uq_report_metrics_report_key ON public.report_metrics USING btree (report_id, metric_key);
CREATE UNIQUE INDEX uq_weekly_reports_profile_period ON public.weekly_reports USING btree (workspace_profile_id, period_start, period_end);
CREATE UNIQUE INDEX uq_workspace_members_workspace_user ON public.workspace_members USING btree (workspace_id, user_id);
ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_profiles ENABLE ROW LEVEL SECURITY;

-- ---- profiles: three-axis entitlement model, backfilled from the legacy columns ----
ALTER TABLE profiles ADD COLUMN audit_entitlement text DEFAULT 'free' NOT NULL;
ALTER TABLE profiles ADD COLUMN audit_credits integer DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN audit_credits_used integer DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN marketing_opt_in boolean DEFAULT true NOT NULL;
UPDATE profiles SET audit_entitlement = 'subscribed' WHERE plan = 'subscriber';
UPDATE profiles SET audit_credits = bonus_audit_credits WHERE bonus_audit_credits > 0;
UPDATE profiles SET marketing_opt_in = NOT marketing_opt_out;

-- ---- profile_audits: credit_spent replaces used_bonus_credit ----
ALTER TABLE profile_audits ADD COLUMN credit_spent boolean DEFAULT false NOT NULL;
UPDATE profile_audits SET credit_spent = used_bonus_credit;

-- ---- delivery_jobs: generalised subject, backward compatible with the currently live code ----
ALTER TABLE delivery_jobs ALTER COLUMN audit_id DROP NOT NULL;
ALTER TABLE delivery_jobs ADD COLUMN subject_type text DEFAULT 'audit' NOT NULL;
ALTER TABLE delivery_jobs ADD COLUMN subject_id uuid;
UPDATE delivery_jobs SET subject_id = audit_id WHERE subject_id IS NULL;

CREATE OR REPLACE FUNCTION public.delivery_jobs_fill_subject_id() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.subject_id IS NULL THEN NEW.subject_id := NEW.audit_id; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.delivery_jobs_fill_subject_id() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_delivery_jobs_fill_subject_id BEFORE INSERT ON delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.delivery_jobs_fill_subject_id();

ALTER TABLE delivery_jobs ALTER COLUMN subject_id SET NOT NULL;
CREATE UNIQUE INDEX uq_delivery_jobs_subject_kind ON delivery_jobs USING btree (subject_type, subject_id, kind);
