-- HCN-CLINICAL-MASTER-002 -- foundation schema for the Haneen Clinical
-- Coordination Center: an organization-scoped Healthcare Contact
-- Directory (Feature 1), structured external clinical requests with a
-- durable lifecycle and append-only event history (Features 2 and 4),
-- and a new clinical-document metadata/versioning/sharing layer backed
-- by a dedicated private storage bucket (Feature 3's core). Multi-
-- provider Coordination Plans (Feature 5) and automated
-- reminders/reporting (Feature 6) are deliberately NOT part of this
-- migration -- see the engagement's own completion report for that
-- explicitly-open scope.
--
-- Reuses rather than duplicates: is_active_org_director(),
-- is_organization_owner(), has_patient_access(), organization_licenses,
-- organization_memberships, covered_patient_memberships,
-- staff_patient_assignments, account_management_audit. Does not touch
-- the existing patient-personal healthcare_contacts equivalent
-- (patient_care_providers) or the existing patient_document_uploads/
-- media_uploads tables -- both remain exactly as they are (R1).
--
-- Authorization pattern used throughout: Director/Owner get org-wide
-- visibility via is_active_org_director(organization_id) /
-- is_organization_owner(organization_id) (the same pattern this
-- codebase's own Director-facing tables already use -- e.g.
-- caregiver_visits, incident_reports); every other internal role
-- (assigned Caregiver/Medical/Therapist, Patient, active Representative)
-- is scoped through the existing has_patient_access(patient_id), which
-- already encapsulates assignment status, role, and active-license
-- checks in one place -- never re-derived ad hoc here.

-- =====================================================================
-- A. Healthcare Provider Directory (Feature 1) -- organization-scoped
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_healthcare_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) > 0),
  professional_title TEXT,
  specialty TEXT NOT NULL CHECK (specialty IN (
    'primary_care_physician', 'medical_specialist', 'nurse_practitioner', 'physical_therapist',
    'occupational_therapist', 'mental_health_therapist', 'psychologist', 'speech_language_pathologist',
    'dietitian_nutritionist', 'pharmacist', 'social_worker_care_navigator', 'hospital_clinic',
    'wound_care_specialist', 'other'
  )),
  specialty_other_label TEXT,
  practice_name TEXT,
  office_phone TEXT,
  fax_number TEXT,
  secure_contact_email TEXT,
  office_address TEXT,
  professional_identifier TEXT,
  credentials TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'disputed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT hcn_healthcare_providers_specialty_other_check CHECK (
    (specialty <> 'other') OR (specialty_other_label IS NOT NULL AND char_length(btrim(specialty_other_label)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_hcn_healthcare_providers_org ON public.hcn_healthcare_providers(organization_id) WHERE is_active = true;

ALTER TABLE public.hcn_healthcare_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage their provider directory" ON public.hcn_healthcare_providers;
CREATE POLICY "Org directors and owners manage their provider directory" ON public.hcn_healthcare_providers
  FOR ALL TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
-- Any internal user with access to at least one patient in this org
-- may READ the directory (needed to pick a provider when filing a
-- request for their own assigned patient) -- never write.
DROP POLICY IF EXISTS "Assigned staff can view their org's provider directory" ON public.hcn_healthcare_providers;
CREATE POLICY "Assigned staff can view their org's provider directory" ON public.hcn_healthcare_providers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_patient_assignments a
    WHERE a.organization_id = hcn_healthcare_providers.organization_id AND a.user_id = auth.uid() AND a.is_active = true
  ));
REVOKE ALL ON public.hcn_healthcare_providers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.hcn_healthcare_providers TO authenticated;
GRANT ALL ON public.hcn_healthcare_providers TO service_role;

-- =====================================================================
-- B. Patient <-> Provider associations -- stored separately from the
-- provider's own org-scoped identity (one real provider, many patients)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_patient_provider_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  provider_id UUID NOT NULL REFERENCES public.hcn_healthcare_providers(id),
  relationship_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_hcn_patient_provider_assoc_patient ON public.hcn_patient_provider_associations(patient_id) WHERE is_active = true;

ALTER TABLE public.hcn_patient_provider_associations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage patient-provider associations" ON public.hcn_patient_provider_associations;
CREATE POLICY "Org directors and owners manage patient-provider associations" ON public.hcn_patient_provider_associations
  FOR ALL TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
DROP POLICY IF EXISTS "Patient-authorized internal users can view associations" ON public.hcn_patient_provider_associations;
CREATE POLICY "Patient-authorized internal users can view associations" ON public.hcn_patient_provider_associations
  FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));
REVOKE ALL ON public.hcn_patient_provider_associations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.hcn_patient_provider_associations TO authenticated;
GRANT ALL ON public.hcn_patient_provider_associations TO service_role;

-- =====================================================================
-- C. Clinical documents -- dedicated metadata table for THIS feature's
-- documents (medical records exchanged with external/internal
-- providers), distinct from patient_document_uploads/media_uploads
-- (R1: existing systems untouched). Versioning via self-reference
-- (supersedes_document_id), the same pattern enterprise_contracts
-- already established for its own supersession chain.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_clinical_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  category TEXT NOT NULL CHECK (category IN (
    'medical_records', 'therapy_reports', 'medication_lists', 'discharge_documents', 'care_instructions',
    'referral_documents', 'specialist_assessments', 'patient_provided_documents',
    'administrative_coordination', 'other_clinical_attachment'
  )),
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  checksum_sha256 TEXT,
  -- Exactly one of (uploaded_by, uploader_external_label) is set: an
  -- internal authenticated upload always has a real profiles.id;  an
  -- external provider has no Haneen account at all, so their identity
  -- is the verified label captured at upload time (name + the
  -- recipient_email their access token was issued to), never a
  -- fabricated internal user id.
  uploaded_by UUID REFERENCES public.profiles(id),
  uploader_external_label TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  supersedes_document_id UUID REFERENCES public.hcn_clinical_documents(id),
  review_status TEXT NOT NULL DEFAULT 'received_unreviewed' CHECK (review_status IN (
    'received_unreviewed', 'accepted', 'revision_required', 'rejected',
    'forwarded_for_clinical_review', 'clinical_approved'
  )),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hcn_clinical_documents_uploader_check CHECK (
    (uploaded_by IS NOT NULL AND uploader_external_label IS NULL) OR
    (uploaded_by IS NULL AND uploader_external_label IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_hcn_clinical_documents_patient ON public.hcn_clinical_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_hcn_clinical_documents_org_status ON public.hcn_clinical_documents(organization_id, review_status);

ALTER TABLE public.hcn_clinical_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Org directors and owners manage clinical documents" ON public.hcn_clinical_documents
  FOR ALL TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
DROP POLICY IF EXISTS "Patient-authorized internal users can view clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Patient-authorized internal users can view clinical documents" ON public.hcn_clinical_documents
  FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));
-- Any patient-authorized internal user may upload a document for that
-- patient (the Director-review step downstream is what gates whether
-- it becomes a trusted care instruction -- upload itself is not an
-- authority claim).
DROP POLICY IF EXISTS "Patient-authorized internal users can upload clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Patient-authorized internal users can upload clinical documents" ON public.hcn_clinical_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_patient_access(patient_id) AND uploaded_by = auth.uid());
REVOKE ALL ON public.hcn_clinical_documents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.hcn_clinical_documents TO authenticated;
GRANT ALL ON public.hcn_clinical_documents TO service_role;

-- Private bucket for this feature's documents -- never public, same
-- convention as every other patient-document bucket in this project.
-- MIME allowlist is defense-in-depth alongside the application's own
-- content-signature validation (never trusted alone, per directive
-- 5.3); HEIC/TIFF are deliberately excluded pending the directive's
-- own "evaluate" language -- not yet security-reviewed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hcn-clinical-documents', 'hcn-clinical-documents', false, 26214400, ARRAY[
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain',
  'image/jpeg', 'image/png'
])
ON CONFLICT (id) DO NOTHING;

-- storage_path convention: '{patient_id}/{document_id}_{sanitized filename}'
-- -- authorization is re-derived from hcn_clinical_documents by
-- storage_path match (never from the folder name alone), exactly
-- mirroring migration 136's incident-attachments pattern.
DROP POLICY IF EXISTS "Patient-authorized internal users can upload clinical document objects" ON storage.objects;
CREATE POLICY "Patient-authorized internal users can upload clinical document objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hcn-clinical-documents'
    AND EXISTS (SELECT 1 FROM public.hcn_clinical_documents d WHERE d.storage_path = storage.objects.name AND d.uploaded_by = auth.uid())
  );
DROP POLICY IF EXISTS "Patient-authorized internal users can read clinical document objects" ON storage.objects;
CREATE POLICY "Patient-authorized internal users can read clinical document objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hcn-clinical-documents'
    AND EXISTS (
      SELECT 1 FROM public.hcn_clinical_documents d
      WHERE d.storage_path = storage.objects.name
        AND (public.has_patient_access(d.patient_id) OR public.is_active_org_director(d.organization_id) OR public.is_organization_owner(d.organization_id))
    )
  );

-- =====================================================================
-- D. Explicit document sharing grants (upload/download/share/revoke_share)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_document_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.hcn_clinical_documents(id),
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('internal_user', 'external_request')),
  grantee_user_id UUID REFERENCES public.profiles(id),
  request_id UUID, -- FK added below once hcn_clinical_requests exists
  granted_by UUID NOT NULL REFERENCES public.profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  CONSTRAINT hcn_document_grants_grantee_check CHECK (
    (grantee_type = 'internal_user' AND grantee_user_id IS NOT NULL AND request_id IS NULL) OR
    (grantee_type = 'external_request' AND grantee_user_id IS NULL AND request_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_hcn_document_grants_document ON public.hcn_document_grants(document_id);

-- =====================================================================
-- E. Clinical requests -- the core request lifecycle (Features 2 & 4)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_clinical_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  provider_id UUID NOT NULL REFERENCES public.hcn_healthcare_providers(id),
  request_type TEXT NOT NULL CHECK (request_type IN (
    'medical_documentation', 'therapy_documentation', 'medication_list_verification', 'discharge_summary',
    'clinical_clarification', 'updated_caregiver_instructions', 'specialist_assessment', 'provider_referral',
    'document_correction_or_replacement', 'general_provider_coordination'
  )),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT,
  requested_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'send_pending', 'sent', 'response_received', 'pending_review',
    'pending_clinical_approval', 'accepted', 'revision_required', 'rejected',
    'closed', 'cancelled', 'expired'
  )),
  deadline_at TIMESTAMPTZ,
  follow_up_owner_id UUID REFERENCES public.profiles(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_hcn_clinical_requests_org_status ON public.hcn_clinical_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_hcn_clinical_requests_patient ON public.hcn_clinical_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_hcn_clinical_requests_deadline ON public.hcn_clinical_requests(deadline_at) WHERE status NOT IN ('closed', 'cancelled', 'expired', 'rejected', 'accepted');

ALTER TABLE public.hcn_clinical_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage clinical requests" ON public.hcn_clinical_requests;
CREATE POLICY "Org directors and owners manage clinical requests" ON public.hcn_clinical_requests
  FOR ALL TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
DROP POLICY IF EXISTS "Patient-authorized internal users can view clinical requests" ON public.hcn_clinical_requests;
CREATE POLICY "Patient-authorized internal users can view clinical requests" ON public.hcn_clinical_requests
  FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));
-- The designated follow-up owner (any internal staff, not necessarily
-- a director) may update status-adjacent fields on their own assigned
-- request -- enforced narrowly at the RPC layer (hcn_review_clinical_document
-- etc.), not via a broad direct-table UPDATE grant to non-directors.
REVOKE ALL ON public.hcn_clinical_requests FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_clinical_requests TO authenticated;
GRANT ALL ON public.hcn_clinical_requests TO service_role;

ALTER TABLE public.hcn_document_grants ADD CONSTRAINT hcn_document_grants_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.hcn_clinical_requests(id);
ALTER TABLE public.hcn_document_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org directors and owners manage document grants" ON public.hcn_document_grants;
CREATE POLICY "Org directors and owners manage document grants" ON public.hcn_document_grants
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hcn_clinical_documents d WHERE d.id = document_id AND (public.is_active_org_director(d.organization_id) OR public.is_organization_owner(d.organization_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hcn_clinical_documents d WHERE d.id = document_id AND (public.is_active_org_director(d.organization_id) OR public.is_organization_owner(d.organization_id))));
DROP POLICY IF EXISTS "Grantee can view their own active document grant" ON public.hcn_document_grants;
CREATE POLICY "Grantee can view their own active document grant" ON public.hcn_document_grants
  FOR SELECT TO authenticated
  USING (grantee_type = 'internal_user' AND grantee_user_id = auth.uid());
REVOKE ALL ON public.hcn_document_grants FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_document_grants TO authenticated;
GRANT ALL ON public.hcn_document_grants TO service_role;

-- =====================================================================
-- F. Append-only event history (Feature 4.2) -- no UPDATE/DELETE grant
-- to any non-service-role caller, ever.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_clinical_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.hcn_clinical_requests(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'recipient_selected', 'send_attempted', 'send_delivered', 'send_failed',
    'recipient_verified', 'request_accessed', 'document_uploaded', 'response_submitted',
    'administrative_review', 'clinical_review', 'revision_requested', 'cancelled', 'revoked',
    'reminder_sent', 'completed', 'closed'
  )),
  actor_user_id UUID REFERENCES public.profiles(id),
  actor_external_label TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hcn_clinical_request_events_request ON public.hcn_clinical_request_events(request_id, created_at);

ALTER TABLE public.hcn_clinical_request_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Request-authorized internal users can view event history" ON public.hcn_clinical_request_events;
CREATE POLICY "Request-authorized internal users can view event history" ON public.hcn_clinical_request_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hcn_clinical_requests r WHERE r.id = request_id
      AND (public.is_active_org_director(r.organization_id) OR public.is_organization_owner(r.organization_id) OR public.has_patient_access(r.patient_id))
  ));
-- No INSERT/UPDATE/DELETE grant to authenticated at all -- every event
-- is recorded exclusively by SECURITY DEFINER RPCs/service-role Edge
-- Functions, never a direct client insert, so "append-only for
-- ordinary users" is enforced by the complete absence of a write grant,
-- not merely a policy.
REVOKE ALL ON public.hcn_clinical_request_events FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_clinical_request_events TO authenticated;
GRANT ALL ON public.hcn_clinical_request_events TO service_role;

-- =====================================================================
-- G. Request <-> document associations, with direction
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_clinical_request_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.hcn_clinical_requests(id),
  document_id UUID NOT NULL REFERENCES public.hcn_clinical_documents(id),
  direction TEXT NOT NULL CHECK (direction IN ('shared_with_recipient', 'received_from_recipient')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, document_id)
);
ALTER TABLE public.hcn_clinical_request_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Request-authorized internal users can view request documents" ON public.hcn_clinical_request_documents;
CREATE POLICY "Request-authorized internal users can view request documents" ON public.hcn_clinical_request_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hcn_clinical_requests r WHERE r.id = request_id
      AND (public.is_active_org_director(r.organization_id) OR public.is_organization_owner(r.organization_id) OR public.has_patient_access(r.patient_id))
  ));
REVOKE ALL ON public.hcn_clinical_request_documents FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_clinical_request_documents TO authenticated;
GRANT ALL ON public.hcn_clinical_request_documents TO service_role;

-- =====================================================================
-- H. External provider verified access tokens -- same hashed-token +
-- expiry + single-purpose-scope pattern as sales_quote_invitations
-- (migration 107), extended with revocation. service_role only: no
-- authenticated/anon grant at all -- every external-facing operation
-- goes through a dedicated Edge Function that validates the raw token
-- (never trusted from the browser alone) plus a confirmed recipient
-- email, server-side, before touching anything else.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.hcn_external_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.hcn_clinical_requests(id),
  token_hash TEXT NOT NULL UNIQUE,
  recipient_email TEXT NOT NULL,
  recipient_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  first_verified_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hcn_external_access_tokens_request ON public.hcn_external_access_tokens(request_id);

ALTER TABLE public.hcn_external_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Request-authorized internal users can view external access tokens" ON public.hcn_external_access_tokens;
CREATE POLICY "Request-authorized internal users can view external access tokens" ON public.hcn_external_access_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hcn_clinical_requests r WHERE r.id = request_id
      AND (public.is_active_org_director(r.organization_id) OR public.is_organization_owner(r.organization_id))
  ));
REVOKE ALL ON public.hcn_external_access_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hcn_external_access_tokens TO authenticated;
GRANT ALL ON public.hcn_external_access_tokens TO service_role;
