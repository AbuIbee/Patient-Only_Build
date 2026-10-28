-- MMA PROFESSIONAL / BATCH 1 / ADDITIVE SCHEMA CANDIDATE
-- Local-only integration. NEVER APPLY TO HOSTED DATABASE WITHOUT POSTGRES REPLAY + APPROVAL.
-- Based on vetted 159-migration reference, not a final privileges or business-rule decision.
-- Every newly created table is RLS ENABLED, and NO client grants/policies are added here.
-- Existing Professional staging-only tables are not altered or dropped.
-- This script is a candidate to be replayed IN ORDER against a disposable staging reconstruction.
-- Dependencies in existing staging and managed schemas (auth/extensions/storage) must be satisfied.

-- SOURCE CREATE TABLE organization_owner_capability_grants
CREATE TABLE public.organization_owner_capability_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    capability text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    granted_by uuid NOT NULL,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT organization_owner_capability_grants_capability_check CHECK ((capability = ANY (ARRAY['caregiver'::text, 'therapist'::text, 'medical_professional'::text, 'billing_admin'::text]))),
    CONSTRAINT organization_owner_capability_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);

ALTER TABLE public.organization_owner_capability_grants ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE professional_application_documents
CREATE TABLE public.professional_application_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    document_type text NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.professional_application_documents ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE professional_application_events
CREATE TABLE public.professional_application_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_user_id uuid,
    actor_role text,
    from_status text,
    to_status text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.professional_application_events ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE professional_applications
CREATE TABLE public.professional_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    applicant_user_id uuid NOT NULL,
    requested_office text NOT NULL,
    approved_office text,
    target_organization_id uuid,
    proposed_organization_name text,
    proposed_package_type text,
    legal_name text,
    preferred_name text,
    contact_email text,
    contact_phone text,
    professional_title text,
    profession_category text,
    application_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    credential_verification_status text DEFAULT 'submitted'::text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    correction_request text,
    correction_requested_fields jsonb,
    correction_requested_at timestamp with time zone,
    correction_requested_by uuid,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    platform_owner_approval_required boolean DEFAULT false NOT NULL,
    platform_owner_approved_by uuid,
    platform_owner_approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    credential_verified_by uuid,
    credential_verified_at timestamp with time zone,
    credential_verification_evidence text,
    application_reference text NOT NULL,
    CONSTRAINT director_requires_proposed_name CHECK (((requested_office <> 'director'::text) OR (proposed_organization_name IS NOT NULL))),
    CONSTRAINT non_director_requires_target_org CHECK (((status = 'draft'::text) OR (requested_office = 'director'::text) OR (target_organization_id IS NOT NULL))),
    CONSTRAINT professional_applications_approved_office_check CHECK ((approved_office = ANY (ARRAY['director'::text, 'caregiver'::text, 'medical_professional'::text, 'therapist'::text]))),
    CONSTRAINT professional_applications_credential_verification_status_check CHECK ((credential_verification_status = ANY (ARRAY['not_submitted'::text, 'submitted'::text, 'pending_review'::text, 'insufficient'::text, 'independently_verified'::text, 'expired'::text, 'rejected'::text, 'requires_reverification'::text]))),
    CONSTRAINT professional_applications_draft_allows_null_identity CHECK (((status = 'draft'::text) OR ((legal_name IS NOT NULL) AND (contact_email IS NOT NULL)))),
    CONSTRAINT professional_applications_proposed_package_type_check CHECK ((proposed_package_type = ANY (ARRAY['therapist'::text, 'integrated_care'::text]))),
    CONSTRAINT professional_applications_requested_office_check CHECK ((requested_office = ANY (ARRAY['director'::text, 'caregiver'::text, 'medical_professional'::text, 'therapist'::text]))),
    CONSTRAINT professional_applications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'info_required'::text, 'resubmitted'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text, 'suspended'::text, 'revoked'::text])))
);

ALTER TABLE public.professional_applications ENABLE ROW LEVEL SECURITY;

-- CONSTRAINT: organization_owner_capability_grants organization_owner_capability_grants_pkey
ALTER TABLE ONLY public.organization_owner_capability_grants
    ADD CONSTRAINT organization_owner_capability_grants_pkey PRIMARY KEY (id);

-- CONSTRAINT: organization_owner_capability_grants organization_owner_capability_organization_id_user_id_capab_key
ALTER TABLE ONLY public.organization_owner_capability_grants
    ADD CONSTRAINT organization_owner_capability_organization_id_user_id_capab_key UNIQUE (organization_id, user_id, capability);

-- CONSTRAINT: professional_application_documents professional_application_documents_pkey
ALTER TABLE ONLY public.professional_application_documents
    ADD CONSTRAINT professional_application_documents_pkey PRIMARY KEY (id);

-- CONSTRAINT: professional_application_documents professional_application_documents_storage_path_key
ALTER TABLE ONLY public.professional_application_documents
    ADD CONSTRAINT professional_application_documents_storage_path_key UNIQUE (storage_path);

-- CONSTRAINT: professional_application_events professional_application_events_pkey
ALTER TABLE ONLY public.professional_application_events
    ADD CONSTRAINT professional_application_events_pkey PRIMARY KEY (id);

-- CONSTRAINT: professional_applications professional_applications_pkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_pkey PRIMARY KEY (id);

-- FK organization_owner_capability_grants organization_owner_capability_grants_granted_by_fkey
ALTER TABLE ONLY public.organization_owner_capability_grants
    ADD CONSTRAINT organization_owner_capability_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id);

-- FK organization_owner_capability_grants organization_owner_capability_grants_organization_id_fkey
ALTER TABLE ONLY public.organization_owner_capability_grants
    ADD CONSTRAINT organization_owner_capability_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- FK organization_owner_capability_grants organization_owner_capability_grants_revoked_by_fkey
ALTER TABLE ONLY public.organization_owner_capability_grants
    ADD CONSTRAINT organization_owner_capability_grants_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.profiles(id);

-- FK organization_owner_capability_grants organization_owner_capability_grants_user_id_fkey
ALTER TABLE ONLY public.organization_owner_capability_grants
    ADD CONSTRAINT organization_owner_capability_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

-- FK professional_application_documents professional_application_documents_application_id_fkey
ALTER TABLE ONLY public.professional_application_documents
    ADD CONSTRAINT professional_application_documents_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.professional_applications(id) ON DELETE CASCADE;

-- FK professional_application_events professional_application_events_actor_user_id_fkey
ALTER TABLE ONLY public.professional_application_events
    ADD CONSTRAINT professional_application_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id);

-- FK professional_application_events professional_application_events_application_id_fkey
ALTER TABLE ONLY public.professional_application_events
    ADD CONSTRAINT professional_application_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.professional_applications(id) ON DELETE CASCADE;

-- FK professional_applications professional_applications_applicant_user_id_fkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_applicant_user_id_fkey FOREIGN KEY (applicant_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- FK professional_applications professional_applications_correction_requested_by_fkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_correction_requested_by_fkey FOREIGN KEY (correction_requested_by) REFERENCES public.profiles(id);

-- FK professional_applications professional_applications_credential_verified_by_fkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_credential_verified_by_fkey FOREIGN KEY (credential_verified_by) REFERENCES public.profiles(id);

-- FK professional_applications professional_applications_platform_owner_approved_by_fkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_platform_owner_approved_by_fkey FOREIGN KEY (platform_owner_approved_by) REFERENCES public.profiles(id);

-- FK professional_applications professional_applications_reviewed_by_fkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

-- FK professional_applications professional_applications_target_organization_id_fkey
ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_target_organization_id_fkey FOREIGN KEY (target_organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
