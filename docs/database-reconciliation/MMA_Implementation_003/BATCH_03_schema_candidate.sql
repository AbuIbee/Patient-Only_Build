-- MMA PROFESSIONAL / BATCH 3 / ADDITIVE SCHEMA CANDIDATE
-- Local-only integration. NEVER APPLY TO HOSTED DATABASE WITHOUT POSTGRES REPLAY + APPROVAL.
-- Based on vetted 159-migration reference, not a final privileges or business-rule decision.
-- Every newly created table is RLS ENABLED, and NO client grants/policies are added here.
-- Existing Professional staging-only tables are not altered or dropped.
-- This script is a candidate to be replayed IN ORDER against a disposable staging reconstruction.
-- Dependencies in existing staging and managed schemas (auth/extensions/storage) must be satisfied.

-- SOURCE CREATE TABLE account_deletion_requests
CREATE TABLE public.account_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    reason text,
    status text DEFAULT 'requested'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_deletion_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'under_review'::text, 'approved'::text, 'denied'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE account_management_audit
CREATE TABLE public.account_management_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid,
    organization_id uuid,
    action_type text NOT NULL,
    actor_user_id uuid,
    previous_value jsonb,
    new_value jsonb,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.account_management_audit ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE patient_legal_holds
CREATE TABLE public.patient_legal_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    placed_by uuid NOT NULL,
    placed_at timestamp with time zone DEFAULT now() NOT NULL,
    released_by uuid,
    released_at timestamp with time zone,
    CONSTRAINT patient_legal_holds_reason_check CHECK ((char_length(btrim(reason)) > 0)),
    CONSTRAINT patient_legal_holds_status_check CHECK ((status = ANY (ARRAY['active'::text, 'released'::text])))
);

ALTER TABLE public.patient_legal_holds ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE patient_representatives
CREATE TABLE public.patient_representatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    representative_user_id uuid NOT NULL,
    legal_first_name text NOT NULL,
    legal_middle_name text,
    legal_last_name text NOT NULL,
    contact_email text NOT NULL,
    contact_phone text NOT NULL,
    residential_address text NOT NULL,
    relationship_to_patient text NOT NULL,
    authorization_basis text NOT NULL,
    authorization_evidence_reference text,
    consent_acknowledged boolean DEFAULT false NOT NULL,
    verification_status text DEFAULT 'pending_verification'::text NOT NULL,
    status text DEFAULT 'pending_verification'::text NOT NULL,
    initiated_by uuid NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone,
    revoked_by uuid,
    revocation_reason text,
    revoked_at timestamp with time zone,
    replaced_by_representative_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_representatives_legal_first_name_check CHECK ((char_length(btrim(legal_first_name)) > 0)),
    CONSTRAINT patient_representatives_legal_last_name_check CHECK ((char_length(btrim(legal_last_name)) > 0)),
    CONSTRAINT patient_representatives_status_check CHECK ((status = ANY (ARRAY['pending_verification'::text, 'active'::text, 'revoked'::text, 'replaced'::text]))),
    CONSTRAINT patient_representatives_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending_verification'::text, 'verified'::text, 'rejected'::text])))
);

ALTER TABLE public.patient_representatives ENABLE ROW LEVEL SECURITY;

-- CONSTRAINT: account_deletion_requests account_deletion_requests_pkey
ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);

-- CONSTRAINT: account_management_audit account_management_audit_pkey
ALTER TABLE ONLY public.account_management_audit
    ADD CONSTRAINT account_management_audit_pkey PRIMARY KEY (id);

-- CONSTRAINT: patient_legal_holds patient_legal_holds_pkey
ALTER TABLE ONLY public.patient_legal_holds
    ADD CONSTRAINT patient_legal_holds_pkey PRIMARY KEY (id);

-- CONSTRAINT: patient_representatives patient_representatives_pkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_pkey PRIMARY KEY (id);

-- FK account_deletion_requests account_deletion_requests_requested_by_fkey
ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);

-- FK account_deletion_requests account_deletion_requests_reviewed_by_fkey
ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

-- FK account_deletion_requests account_deletion_requests_target_user_id_fkey
ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);

-- FK account_management_audit account_management_audit_actor_user_id_fkey
ALTER TABLE ONLY public.account_management_audit
    ADD CONSTRAINT account_management_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id);

-- FK account_management_audit account_management_audit_organization_id_fkey
ALTER TABLE ONLY public.account_management_audit
    ADD CONSTRAINT account_management_audit_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- FK account_management_audit account_management_audit_target_user_id_fkey
ALTER TABLE ONLY public.account_management_audit
    ADD CONSTRAINT account_management_audit_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);

-- FK patient_legal_holds patient_legal_holds_patient_id_fkey
ALTER TABLE ONLY public.patient_legal_holds
    ADD CONSTRAINT patient_legal_holds_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);

-- FK patient_legal_holds patient_legal_holds_placed_by_fkey
ALTER TABLE ONLY public.patient_legal_holds
    ADD CONSTRAINT patient_legal_holds_placed_by_fkey FOREIGN KEY (placed_by) REFERENCES public.profiles(id);

-- FK patient_legal_holds patient_legal_holds_released_by_fkey
ALTER TABLE ONLY public.patient_legal_holds
    ADD CONSTRAINT patient_legal_holds_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.profiles(id);

-- FK patient_representatives patient_representatives_initiated_by_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.profiles(id);

-- FK patient_representatives patient_representatives_organization_id_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- FK patient_representatives patient_representatives_patient_id_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);

-- FK patient_representatives patient_representatives_replaced_by_representative_id_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_replaced_by_representative_id_fkey FOREIGN KEY (replaced_by_representative_id) REFERENCES public.patient_representatives(id);

-- FK patient_representatives patient_representatives_representative_user_id_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_representative_user_id_fkey FOREIGN KEY (representative_user_id) REFERENCES public.profiles(id);

-- FK patient_representatives patient_representatives_revoked_by_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.profiles(id);

-- FK patient_representatives patient_representatives_verified_by_fkey
ALTER TABLE ONLY public.patient_representatives
    ADD CONSTRAINT patient_representatives_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id);
