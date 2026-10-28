-- MMA_Professional_SQL_Implementation_003 — mirrors four real tables and
-- one function confirmed, by direct read-only introspection against
-- Enterprise staging (axurszlibxwwptkczztt), to ALREADY exist there but
-- NOT in this repository's migration history: enterprise_demo_
-- environments, enterprise_retention_settings, enterprise_patient_
-- deletion_requests, enterprise_role_catalog, and
-- enterprise_patient_deletion_eligibility(uuid).
--
-- CONTEXT: an externally-supplied candidate package
-- (MMA_Professional_SQL_Implementation_003, reviewed this session)
-- claimed 21 tables + 82 functions + 78 policies were "missing from
-- staging." Independently verified, by diffing every single name
-- against this repository's own supabase/migrations/: ALL 21 tables,
-- ALL 82 functions, and ALL 78 policies ALREADY exist here, fully
-- implemented with grants/RLS/business logic (migrations 035-159) --
-- the package is a reconciliation snapshot of this repo's OWN schema
-- against staging's current (behind) state, not a request to build new
-- application features. These four tables (plus their one function)
-- are the ONLY genuinely new discovery this session made: the candidate
-- package itself never mentions them at all; they were found by this
-- session's own direct staging query, confirming the directive's "four
-- custom staging-only tables" by name and structure.
--
-- This migration reproduces their EXACT verified structure (every
-- column, default, CHECK, FK, and grant confirmed live against staging
-- -- never invented), additively, in this repository for the first
-- time. It does NOT change staging. Seed data (the role catalog's 7
-- rows, the one retention policy row) is likewise the exact data
-- confirmed present on staging, not invented.
--
-- GRANTS: staging grants ONLY `postgres`/`service_role` on all four
-- tables and the one function -- no `authenticated`/`anon` privilege of
-- any kind. Reproduced identically: this is confirmed, deliberately,
-- backend/operations-only infrastructure, never meant to be called
-- directly by the application. RLS is enabled with NO policies on all
-- four tables (confirmed live), matching Postgres's correct default-deny
-- behavior for any role without an explicit grant anyway.
CREATE TABLE IF NOT EXISTS public.enterprise_demo_environments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    label text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    synthetic_data_only boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone,
    cleanup_completed_at timestamp with time zone,
    notes text,
    CONSTRAINT enterprise_demo_environments_pkey PRIMARY KEY (id),
    CONSTRAINT enterprise_demo_environments_organization_id_key UNIQUE (organization_id),
    CONSTRAINT enterprise_demo_environments_label_check CHECK ((length(btrim(label)) >= 3) AND (length(btrim(label)) <= 120)),
    CONSTRAINT enterprise_demo_environments_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'expired'::text, 'retired'::text, 'cleanup_pending'::text, 'cleaned'::text])),
    CONSTRAINT enterprise_demo_environments_synthetic_data_only_check CHECK (synthetic_data_only = true),
    CONSTRAINT enterprise_demo_active_expiry CHECK ((status <> 'active'::text) OR (expires_at IS NOT NULL)),
    CONSTRAINT enterprise_demo_cleanup_consistency CHECK ((cleanup_completed_at IS NULL) OR (status = 'cleaned'::text)),
    CONSTRAINT enterprise_demo_environments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT,
    CONSTRAINT enterprise_demo_environments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT
);
ALTER TABLE public.enterprise_demo_environments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enterprise_demo_environments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.enterprise_demo_environments TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_retention_settings (
    policy_key text NOT NULL,
    retention_years integer NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    notes text,
    CONSTRAINT enterprise_retention_settings_pkey PRIMARY KEY (policy_key),
    CONSTRAINT enterprise_retention_settings_policy_key_chk CHECK (policy_key ~ '^[a-z][a-z0-9_]*$'::text),
    CONSTRAINT enterprise_retention_settings_retention_years_check CHECK ((retention_years >= 1) AND (retention_years <= 100))
);
ALTER TABLE public.enterprise_retention_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enterprise_retention_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.enterprise_retention_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_patient_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    request_reason text NOT NULL,
    status text DEFAULT 'pending_owner_review'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    retention_anchor_at timestamp with time zone,
    legal_hold_cleared_at timestamp with time zone,
    executed_by uuid,
    executed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enterprise_patient_deletion_requests_pkey PRIMARY KEY (id),
    CONSTRAINT enterprise_patient_deletion_requests_request_reason_check CHECK (length(btrim(request_reason)) >= 10),
    CONSTRAINT enterprise_patient_deletion_requests_status_check CHECK (status = ANY (ARRAY['pending_owner_review'::text, 'rejected'::text, 'approved_pending_retention'::text, 'approved_pending_hold_review'::text, 'eligible_for_execution'::text, 'executed'::text, 'cancelled'::text])),
    CONSTRAINT enterprise_patient_deletion_review_consistency CHECK (((reviewed_at IS NULL) AND (reviewed_by IS NULL)) OR ((reviewed_at IS NOT NULL) AND (reviewed_by IS NOT NULL))),
    CONSTRAINT enterprise_patient_deletion_execution_consistency CHECK (((executed_at IS NULL) AND (executed_by IS NULL)) OR ((executed_at IS NOT NULL) AND (executed_by IS NOT NULL))),
    CONSTRAINT enterprise_patient_deletion_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT
);
ALTER TABLE public.enterprise_patient_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enterprise_patient_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.enterprise_patient_deletion_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_role_catalog (
    role_key text NOT NULL,
    display_name text NOT NULL,
    role_scope text NOT NULL,
    office_key text,
    is_assignable_by_director boolean DEFAULT false NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enterprise_role_catalog_pkey PRIMARY KEY (role_key),
    CONSTRAINT enterprise_role_catalog_role_key_check CHECK (role_key ~ '^[a-z][a-z0-9_]*$'::text),
    CONSTRAINT enterprise_role_catalog_role_scope_check CHECK (role_scope = ANY (ARRAY['platform'::text, 'organization'::text, 'patient'::text])),
    CONSTRAINT enterprise_role_catalog_office_key_check CHECK (office_key = ANY (ARRAY['director'::text, 'caregiver'::text, 'medical'::text, 'therapy'::text, 'patient'::text]))
);
ALTER TABLE public.enterprise_role_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enterprise_role_catalog FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.enterprise_role_catalog TO service_role;

-- Seed data: the exact 7 rows and 1 retention policy confirmed present
-- on staging (read-only SELECT this session), reproduced for parity --
-- not invented. ON CONFLICT DO NOTHING makes this safe to re-run.
INSERT INTO public.enterprise_role_catalog (role_key, display_name, role_scope, office_key, is_assignable_by_director, description) VALUES
    ('platform_owner', 'Platform Owner', 'platform', NULL, false, 'Global SaaS administrator; not a member of any licensed organization.'),
    ('director', 'Director', 'organization', 'director', false, 'Administers a licensed organization''s operations.'),
    ('caregiver', 'Caregiver', 'organization', 'caregiver', true, 'Provides care coordination within a licensed organization.'),
    ('medical_professional', 'Medical Professional', 'organization', 'medical', true, 'Authorized clinical professional within a licensed organization.'),
    ('therapist', 'Therapist', 'organization', 'therapy', true, 'Authorized therapy professional within a licensed organization.'),
    ('billing_admin', 'Billing Administrator', 'organization', NULL, true, 'Organization-scoped billing administration; not a separate office.'),
    ('patient', 'Patient', 'patient', 'patient', false, 'The Enterprise patient, or their Authorized Patient Representative.')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.enterprise_retention_settings (policy_key, retention_years) VALUES
    ('patient_record_default', 7)
ON CONFLICT (policy_key) DO NOTHING;

-- enterprise_patient_deletion_eligibility(): READ-ONLY gate, exact
-- staging definition (confirmed via pg_get_functiondef). Deliberately
-- performs no DML -- the actual request-creation/review/execution steps
-- are a controlled, non-RPC, service_role/operations-only process on
-- staging (confirmed: no other function anywhere references these four
-- tables). See MMA_P1_IMPLEMENTATION_003_RECONCILIATION.md for the
-- architectural question this raises against this repository's own
-- platform_owner_delete_patient_exceptionally() (migration 151).
CREATE OR REPLACE FUNCTION public.enterprise_patient_deletion_eligibility(p_request_id uuid)
 RETURNS TABLE(request_id uuid, retention_years integer, eligible_after timestamp with time zone, retention_elapsed boolean, legal_hold_reviewed boolean, owner_reviewed boolean, eligible_for_execution boolean)
 LANGUAGE sql STABLE SET search_path TO ''
AS $function$
SELECT d.id,r.retention_years,
 CASE WHEN d.retention_anchor_at IS NULL THEN NULL
 ELSE d.retention_anchor_at + make_interval(years => r.retention_years) END,
 (d.retention_anchor_at IS NOT NULL AND now() >= d.retention_anchor_at + make_interval(years => r.retention_years)),
 (d.legal_hold_cleared_at IS NOT NULL),
 (d.reviewed_by IS NOT NULL AND d.reviewed_at IS NOT NULL),
 (d.status = 'eligible_for_execution'
 AND d.retention_anchor_at IS NOT NULL
 AND now() >= d.retention_anchor_at + make_interval(years => r.retention_years)
 AND d.legal_hold_cleared_at IS NOT NULL
 AND d.reviewed_by IS NOT NULL AND d.reviewed_at IS NOT NULL)
FROM public.enterprise_patient_deletion_requests d
CROSS JOIN public.enterprise_retention_settings r
WHERE d.id=p_request_id AND r.policy_key='patient_record_default';
$function$;
REVOKE ALL ON FUNCTION public.enterprise_patient_deletion_eligibility(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_patient_deletion_eligibility(uuid) TO service_role;
