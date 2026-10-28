-- MMA PROFESSIONAL / BATCH 4 / ADDITIVE SCHEMA CANDIDATE
-- Local-only integration. NEVER APPLY TO HOSTED DATABASE WITHOUT POSTGRES REPLAY + APPROVAL.
-- Based on vetted 159-migration reference, not a final privileges or business-rule decision.
-- Every newly created table is RLS ENABLED, and NO client grants/policies are added here.
-- Existing Professional staging-only tables are not altered or dropped.
-- This script is a candidate to be replayed IN ORDER against a disposable staging reconstruction.
-- Dependencies in existing staging and managed schemas (auth/extensions/storage) must be satisfied.

-- SOURCE CREATE TABLE caregiver_notification_preferences
CREATE TABLE public.caregiver_notification_preferences (
    user_id uuid NOT NULL,
    notify_messages boolean DEFAULT true NOT NULL,
    notify_help_alerts boolean DEFAULT true NOT NULL,
    notify_follow_up_due boolean DEFAULT true NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caregiver_notification_preferences_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'in_app_and_email'::text])))
);

ALTER TABLE public.caregiver_notification_preferences ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE document_access_audit
CREATE TABLE public.document_access_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accessed_by uuid NOT NULL,
    bucket_id text NOT NULL,
    storage_path text NOT NULL,
    accessed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_access_audit_bucket_id_check CHECK ((bucket_id = ANY (ARRAY['patient-documents'::text, 'professional-credentials'::text])))
);

ALTER TABLE public.document_access_audit ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE enterprise_notifications
CREATE TABLE public.enterprise_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid NOT NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text,
    related_entity_type text,
    related_entity_id uuid,
    status text DEFAULT 'sent'::text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dedup_key text,
    CONSTRAINT enterprise_notifications_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);

ALTER TABLE public.enterprise_notifications ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE incident_attachments
CREATE TABLE public.incident_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incident_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE patient_care_providers
CREATE TABLE public.patient_care_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    provider_name text NOT NULL,
    provider_role text NOT NULL,
    phone text,
    email text,
    notes text,
    source text DEFAULT 'caregiver_report'::text NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_care_providers_source_check CHECK ((source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text])))
);

ALTER TABLE public.patient_care_providers ENABLE ROW LEVEL SECURITY;

-- CONSTRAINT: caregiver_notification_preferences caregiver_notification_preferences_pkey
ALTER TABLE ONLY public.caregiver_notification_preferences
    ADD CONSTRAINT caregiver_notification_preferences_pkey PRIMARY KEY (user_id);

-- CONSTRAINT: document_access_audit document_access_audit_pkey
ALTER TABLE ONLY public.document_access_audit
    ADD CONSTRAINT document_access_audit_pkey PRIMARY KEY (id);

-- CONSTRAINT: enterprise_notifications enterprise_notifications_pkey
ALTER TABLE ONLY public.enterprise_notifications
    ADD CONSTRAINT enterprise_notifications_pkey PRIMARY KEY (id);

-- CONSTRAINT: incident_attachments incident_attachments_pkey
ALTER TABLE ONLY public.incident_attachments
    ADD CONSTRAINT incident_attachments_pkey PRIMARY KEY (id);

-- CONSTRAINT: incident_attachments incident_attachments_storage_path_key
ALTER TABLE ONLY public.incident_attachments
    ADD CONSTRAINT incident_attachments_storage_path_key UNIQUE (storage_path);

-- CONSTRAINT: patient_care_providers patient_care_providers_pkey
ALTER TABLE ONLY public.patient_care_providers
    ADD CONSTRAINT patient_care_providers_pkey PRIMARY KEY (id);

-- FK caregiver_notification_preferences caregiver_notification_preferences_user_id_fkey
ALTER TABLE ONLY public.caregiver_notification_preferences
    ADD CONSTRAINT caregiver_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- FK document_access_audit document_access_audit_accessed_by_fkey
ALTER TABLE ONLY public.document_access_audit
    ADD CONSTRAINT document_access_audit_accessed_by_fkey FOREIGN KEY (accessed_by) REFERENCES public.profiles(id);

-- FK enterprise_notifications enterprise_notifications_recipient_user_id_fkey
ALTER TABLE ONLY public.enterprise_notifications
    ADD CONSTRAINT enterprise_notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(id);

-- FK incident_attachments incident_attachments_incident_id_fkey
ALTER TABLE ONLY public.incident_attachments
    ADD CONSTRAINT incident_attachments_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incident_reports(id) ON DELETE CASCADE;

-- FK incident_attachments incident_attachments_uploaded_by_fkey
ALTER TABLE ONLY public.incident_attachments
    ADD CONSTRAINT incident_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);

-- FK patient_care_providers patient_care_providers_author_id_fkey
ALTER TABLE ONLY public.patient_care_providers
    ADD CONSTRAINT patient_care_providers_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);

-- FK patient_care_providers patient_care_providers_patient_id_fkey
ALTER TABLE ONLY public.patient_care_providers
    ADD CONSTRAINT patient_care_providers_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
