-- MASTER ENTERPRISE IDENTITY, REGISTRATION, CREDENTIAL VERIFICATION AND
-- ACCOUNT GOVERNANCE DIRECTIVE — the complete backend-enforced
-- applicant → review → approval → office-activation lifecycle.
--
-- CONFIRMED RISK, exactly as the directive's §7.2 instructs to audit:
-- create_organization() (migration 080) currently grants a brand-new
-- user ACTIVE director status the instant they call it — a self-service
-- bootstrap with no Platform Owner involvement at all. That is precisely
-- the "self-approval through an initial-organization bootstrap function"
-- the directive prohibits. This migration replaces that function's body:
-- it now creates a PENDING professional_applications row
-- (requested_office='director', platform_owner_approval_required=true)
-- and creates NO organization, NO membership, and grants NO privilege —
-- the organization itself is not created until
-- platform_owner_approve_director_application() is called by a verified
-- Platform Owner (profiles.role IN ('admin','superadmin'), the SAME
-- existing superadmin identity migration 020 already established —
-- reused here rather than inventing a second owner-identity system).
--
-- Every write to professional_applications goes through a SECURITY
-- DEFINER RPC below — the table itself has NO client INSERT/UPDATE/
-- DELETE policy at all, so a forged direct REST/RPC write is
-- structurally impossible, not merely discouraged. Every RPC
-- independently re-checks the caller's real, current authority inside
-- its own transaction — never a client-supplied reviewer, office, or
-- approval claim.

-- ============================================================================
-- §1 — is_platform_owner(): single source of truth, reused by every RPC
-- and policy below. Identical to the existing superadmin check already
-- established in migration 020 ("Admins can view all profiles") — the
-- Platform Owner IS the existing profiles.role IN ('admin','superadmin')
-- identity, not a new, separate concept.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

-- ============================================================================
-- §2 — professional_applications: the central lifecycle record.
-- requested_office is set once at submission and never changes;
-- approved_office is set ONLY by an approval RPC, distinctly, matching
-- §6/§14's explicit requirement to separate the two.
-- ============================================================================
CREATE TABLE IF NOT EXISTS professional_applications (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_office                TEXT NOT NULL CHECK (requested_office IN ('director', 'caregiver', 'medical_professional', 'therapist')),
  approved_office                 TEXT CHECK (approved_office IN ('director', 'caregiver', 'medical_professional', 'therapist')),
  target_organization_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  proposed_organization_name      TEXT,
  proposed_package_type           TEXT CHECK (proposed_package_type IN ('therapist', 'integrated_care')),
  legal_name                      TEXT NOT NULL,
  preferred_name                  TEXT,
  contact_email                   TEXT NOT NULL,
  contact_phone                   TEXT,
  professional_title              TEXT,
  profession_category             TEXT,
  application_details             JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_verification_status  TEXT NOT NULL DEFAULT 'submitted' CHECK (credential_verification_status IN
    ('not_submitted', 'submitted', 'pending_review', 'insufficient', 'independently_verified', 'expired', 'rejected', 'requires_reverification')),
  status                          TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN
    ('draft', 'submitted', 'pending_review', 'info_required', 'resubmitted', 'approved', 'rejected', 'withdrawn', 'suspended', 'revoked')),
  correction_request              TEXT,
  correction_requested_fields     JSONB,
  correction_requested_at         TIMESTAMPTZ,
  correction_requested_by         UUID REFERENCES profiles(id),
  rejection_reason                TEXT,
  reviewed_by                     UUID REFERENCES profiles(id),
  reviewed_at                     TIMESTAMPTZ,
  platform_owner_approval_required BOOLEAN NOT NULL DEFAULT false,
  platform_owner_approved_by      UUID REFERENCES profiles(id),
  platform_owner_approved_at      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Every non-director application MUST target a real, existing
  -- organization — enforced at the schema level, not just inside the
  -- RPC. A director application starts with NO target (enforced by
  -- submit_professional_application()'s own validation, not this
  -- constraint) and is back-filled with the newly-created organization's
  -- id ONLY once platform_owner_approve_director_application() actually
  -- creates it — so this constraint deliberately does not forbid a
  -- director row from having a target_organization_id, only requires
  -- every non-director row to have one.
  CONSTRAINT non_director_requires_target_org CHECK (
    requested_office = 'director' OR target_organization_id IS NOT NULL
  ),
  CONSTRAINT director_requires_proposed_name CHECK (
    requested_office <> 'director' OR proposed_organization_name IS NOT NULL
  )
);
ALTER TABLE professional_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_professional_applications_applicant ON professional_applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_professional_applications_org ON professional_applications(target_organization_id);
CREATE INDEX IF NOT EXISTS idx_professional_applications_status ON professional_applications(status);

-- Read-only RLS: the applicant sees their own; an active director sees
-- applications targeting their own org; the Platform Owner sees all.
-- NO INSERT/UPDATE/DELETE policy exists on this table at all — every
-- write goes through a SECURITY DEFINER RPC below, which is the only
-- place authorization for a status transition is decided.
DO $$ BEGIN
  CREATE POLICY "Applicant can view their own application"
    ON professional_applications FOR SELECT
    USING (applicant_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active org directors can view applications targeting their org"
    ON professional_applications FOR SELECT
    USING (target_organization_id IS NOT NULL AND public.is_active_org_director(target_organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Platform Owner can view every application"
    ON professional_applications FOR SELECT
    USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- §3 — professional_application_documents: credential/evidence files.
-- Metadata only here; bytes live in the private 'professional-credentials'
-- storage bucket, §7 below — mirrors the patient-documents pattern
-- (migration 007), never public, never emailed.
-- ============================================================================
CREATE TABLE IF NOT EXISTS professional_application_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL UNIQUE,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE professional_application_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Applicant can view their own application documents"
    ON professional_application_documents FOR SELECT
    USING (EXISTS (SELECT 1 FROM professional_applications a WHERE a.id = application_id AND a.applicant_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Applicant can attach documents to their own pending application"
    ON professional_application_documents FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM professional_applications a WHERE a.id = application_id AND a.applicant_user_id = auth.uid()
        AND a.status IN ('pending_review', 'info_required', 'resubmitted'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized reviewers can view application documents"
    ON professional_application_documents FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM professional_applications a WHERE a.id = application_id
        AND (
          (a.target_organization_id IS NOT NULL AND public.is_active_org_director(a.target_organization_id))
          OR public.is_platform_owner()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- §4 — professional_application_events: append-only, immutable audit
-- trail. No UPDATE/DELETE policy exists anywhere in this migration —
-- default-deny means an audit row, once written, can never be altered
-- or removed by any client, including the Platform Owner's own session.
-- ============================================================================
CREATE TABLE IF NOT EXISTS professional_application_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  actor_user_id   UUID REFERENCES profiles(id),
  actor_role      TEXT,
  from_status     TEXT,
  to_status       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE professional_application_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Applicant can view their own application history"
    ON professional_application_events FOR SELECT
    USING (EXISTS (SELECT 1 FROM professional_applications a WHERE a.id = application_id AND a.applicant_user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized reviewers can view application history"
    ON professional_application_events FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM professional_applications a WHERE a.id = application_id
        AND ((a.target_organization_id IS NOT NULL AND public.is_active_org_director(a.target_organization_id)) OR public.is_platform_owner())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- §5 — account_management_audit: Platform Owner backend corrections
-- (office reclassification, cross-org status corrections) not tied to
-- any specific application — §10.2/§11.2's own required audit trail.
-- Append-only, same pattern as §4.
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_management_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id),
  action_type     TEXT NOT NULL,
  actor_user_id   UUID REFERENCES profiles(id),
  previous_value  JSONB,
  new_value       JSONB,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE account_management_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Platform Owner can view the account management audit"
    ON account_management_audit FOR SELECT
    USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- §5.5 — find_organization_for_application(): lets a prospective
-- Caregiver/Medical/Therapist applicant resolve their target
-- organization's id from its exact name, without exposing a public
-- browse-all-organizations listing (organizations' own SELECT RLS
-- requires active membership or Platform Owner status — neither of
-- which a brand-new applicant has yet). Returns only id/name/package —
-- never licensing, staff, or patient data.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_organization_for_application(p_name TEXT)
RETURNS TABLE(id UUID, name TEXT, package_type TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT o.id, o.name, o.package_type FROM organizations o WHERE lower(btrim(o.name)) = lower(btrim(p_name)) LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.find_organization_for_application(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_organization_for_application(TEXT) TO authenticated;

-- ============================================================================
-- §6 — submit_professional_application(): the ONLY way a
-- professional_applications row comes into existence. Never grants
-- privilege — status always starts at 'pending_review', never 'approved'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_professional_application(
  p_requested_office TEXT,
  p_target_organization_id UUID,
  p_proposed_organization_name TEXT,
  p_proposed_package_type TEXT,
  p_legal_name TEXT,
  p_preferred_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_professional_title TEXT,
  p_profession_category TEXT,
  p_application_details JSONB
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_requested_office NOT IN ('director', 'caregiver', 'medical_professional', 'therapist') THEN
    RAISE EXCEPTION 'Invalid requested office: %', p_requested_office;
  END IF;
  IF p_legal_name IS NULL OR btrim(p_legal_name) = '' THEN
    RAISE EXCEPTION 'Legal name is required';
  END IF;
  IF p_contact_email IS NULL OR btrim(p_contact_email) = '' THEN
    RAISE EXCEPTION 'Contact email is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM professional_applications
    WHERE applicant_user_id = auth.uid() AND status IN ('pending_review', 'info_required', 'resubmitted')
  ) THEN
    RAISE EXCEPTION 'You already have an application under review. Wait for a decision before submitting another.';
  END IF;

  IF p_requested_office = 'director' THEN
    IF p_target_organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'A Director application proposes a new organization and must not target an existing one';
    END IF;
    IF p_proposed_organization_name IS NULL OR btrim(p_proposed_organization_name) = '' THEN
      RAISE EXCEPTION 'Proposed organization name is required for a Director application';
    END IF;
    IF p_proposed_package_type NOT IN ('therapist', 'integrated_care') THEN
      RAISE EXCEPTION 'Invalid package type: %', p_proposed_package_type;
    END IF;
  ELSE
    IF p_target_organization_id IS NULL THEN
      RAISE EXCEPTION 'An organization is required for this application';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_target_organization_id) THEN
      RAISE EXCEPTION 'The target organization does not exist';
    END IF;
  END IF;

  INSERT INTO professional_applications (
    applicant_user_id, requested_office, target_organization_id, proposed_organization_name, proposed_package_type,
    legal_name, preferred_name, contact_email, contact_phone, professional_title, profession_category,
    application_details, status, platform_owner_approval_required
  ) VALUES (
    auth.uid(), p_requested_office, p_target_organization_id, btrim(p_proposed_organization_name), p_proposed_package_type,
    btrim(p_legal_name), NULLIF(btrim(COALESCE(p_preferred_name, '')), ''), btrim(p_contact_email), p_contact_phone, p_professional_title, p_profession_category,
    COALESCE(p_application_details, '{}'::jsonb), 'pending_review', (p_requested_office = 'director')
  ) RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'submitted', auth.uid(), 'applicant', NULL, 'pending_review', 'Application submitted');

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_professional_application(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_professional_application(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- §7 — resubmit_application(): the applicant may edit only the fields
-- the application itself carries (legal name, contact info, details) —
-- status, reviewer identity, approval fields are never client-writable,
-- by construction (this function's UPDATE list never touches them).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resubmit_application(
  p_application_id UUID,
  p_legal_name TEXT,
  p_preferred_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_professional_title TEXT,
  p_profession_category TEXT,
  p_application_details JSONB
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No such application';
  END IF;
  IF v_app.applicant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You may only resubmit your own application';
  END IF;
  IF v_app.status <> 'info_required' THEN
    RAISE EXCEPTION 'This application is not awaiting corrections';
  END IF;

  UPDATE professional_applications SET
    legal_name = btrim(p_legal_name), preferred_name = NULLIF(btrim(COALESCE(p_preferred_name, '')), ''),
    contact_email = btrim(p_contact_email), contact_phone = p_contact_phone,
    professional_title = p_professional_title, profession_category = p_profession_category,
    application_details = COALESCE(p_application_details, application_details),
    status = 'resubmitted', updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'resubmitted', auth.uid(), 'applicant', 'info_required', 'resubmitted', 'Applicant resubmitted with corrections');

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.resubmit_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- §8 — withdraw_application(): the applicant's own, always-available exit.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.withdraw_application(p_application_id UUID) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.applicant_user_id <> auth.uid() THEN RAISE EXCEPTION 'You may only withdraw your own application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'info_required', 'resubmitted') THEN
    RAISE EXCEPTION 'This application can no longer be withdrawn';
  END IF;

  UPDATE professional_applications SET status = 'withdrawn', updated_at = now() WHERE id = p_application_id RETURNING * INTO v_app;
  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status)
  VALUES (p_application_id, 'withdrawn', auth.uid(), 'applicant', v_app.status, 'withdrawn');
  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.withdraw_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_application(UUID) TO authenticated;

-- ============================================================================
-- §9 — request_application_corrections() / reject_application(): shared
-- reviewer-action functions. Internally branch on requested_office to
-- decide WHO is authorized to act — a director-application reviewer must
-- be the Platform Owner; every other office's reviewer must be an active
-- director of the application's own target_organization_id. Adversarial
-- test SEC-15-2/3/5/6/7 below exercise exactly this branch.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_application_corrections(
  p_application_id UUID, p_correction_request TEXT, p_correction_fields JSONB
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'resubmitted') THEN RAISE EXCEPTION 'This application is not open for review'; END IF;

  IF v_app.requested_office = 'director' THEN
    IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may review a Director application'; END IF;
  ELSE
    IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
      RAISE EXCEPTION 'Only an active director of the target organization may review this application';
    END IF;
  END IF;

  UPDATE professional_applications SET
    status = 'info_required', correction_request = p_correction_request, correction_requested_fields = p_correction_fields,
    correction_requested_at = now(), correction_requested_by = auth.uid(), updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'info_requested', auth.uid(), CASE WHEN v_app.requested_office = 'director' THEN 'platform_owner' ELSE 'director' END,
    'pending_review', 'info_required', p_correction_request);

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.request_application_corrections(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_application_corrections(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_application(p_application_id UUID, p_rejection_reason TEXT) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_actor_role TEXT;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'info_required', 'resubmitted') THEN RAISE EXCEPTION 'This application cannot be rejected from its current state'; END IF;

  IF v_app.requested_office = 'director' THEN
    IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may reject a Director application'; END IF;
    v_actor_role := 'platform_owner';
  ELSE
    IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
      RAISE EXCEPTION 'Only an active director of the target organization may reject this application';
    END IF;
    v_actor_role := 'director';
  END IF;

  UPDATE professional_applications SET
    status = 'rejected', rejection_reason = p_rejection_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'rejected', auth.uid(), v_actor_role, v_app.status, 'rejected', p_rejection_reason);

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.reject_application(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_application(UUID, TEXT) TO authenticated;

-- ============================================================================
-- §10 — director_approve_application(): activates a Caregiver/Medical/
-- Therapist applicant into the Director's OWN organization only. Hard
-- self-approval and cross-tenant blocks (SEC-15-1/3/5) plus an optional
-- seat-capacity check (only enforced when the org has actually
-- configured a seat limit — an unconfigured/"proposed" license, the
-- default for every org, never blocks activation).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.director_approve_application(p_application_id UUID) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_seats INTEGER;
  v_active_count INTEGER;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office = 'director' THEN
    RAISE EXCEPTION 'Director applications are approved by the Platform Owner, not an organization director';
  END IF;
  IF v_app.status NOT IN ('pending_review', 'resubmitted') THEN RAISE EXCEPTION 'This application is not open for approval'; END IF;
  IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
    RAISE EXCEPTION 'Only an active director of the target organization may approve this application';
  END IF;
  IF v_app.applicant_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own application';
  END IF;

  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id;
  IF v_seats IS NOT NULL THEN
    SELECT count(*) INTO v_active_count FROM organization_memberships WHERE organization_id = v_app.target_organization_id AND status = 'active';
    IF v_active_count >= v_seats THEN
      RAISE EXCEPTION 'This organization has no remaining licensed seats. Increase licensed seats before approving this application.';
    END IF;
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_app.target_organization_id, v_app.applicant_user_id, v_app.requested_office, 'active', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role, status = 'active', updated_at = now();

  UPDATE professional_applications SET
    status = 'approved', approved_office = v_app.requested_office, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status)
  VALUES (p_application_id, 'approved', auth.uid(), 'director', 'pending_review', 'approved');

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.director_approve_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.director_approve_application(UUID) TO authenticated;

-- ============================================================================
-- §11 — platform_owner_approve_director_application(): the ONLY path by
-- which a new organization now comes into existence with an active
-- director. Replaces create_organization()'s prior instant-activation
-- behavior (§13 below).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_owner_approve_director_application(p_application_id UUID) RETURNS organizations AS $$
DECLARE
  v_app professional_applications;
  v_org organizations;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may approve a Director application';
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office <> 'director' THEN RAISE EXCEPTION 'This is not a Director application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'resubmitted') THEN RAISE EXCEPTION 'This application is not open for approval'; END IF;

  INSERT INTO organizations (name, package_type, created_by)
  VALUES (v_app.proposed_organization_name, v_app.proposed_package_type, v_app.applicant_user_id)
  RETURNING * INTO v_org;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, v_app.applicant_user_id, 'director', 'active', auth.uid());

  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  UPDATE professional_applications SET
    status = 'approved', approved_office = 'director', target_organization_id = v_org.id,
    platform_owner_approved_by = auth.uid(), platform_owner_approved_at = now(),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'platform_owner_approved', auth.uid(), 'platform_owner', v_app.status, 'approved', 'Organization ' || v_org.name || ' created and Director activated');

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_approve_director_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_approve_director_application(UUID) TO authenticated;

-- ============================================================================
-- §12 — platform_owner_correct_office_classification(): §10.2's required
-- backend office-correction capability, fully audited.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_owner_correct_office_classification(
  p_user_id UUID, p_organization_id UUID, p_new_org_role TEXT, p_new_status TEXT, p_reason TEXT
) RETURNS organization_memberships AS $$
DECLARE
  v_before organization_memberships;
  v_after organization_memberships;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may correct an office classification';
  END IF;
  IF p_new_org_role NOT IN ('director', 'caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
    RAISE EXCEPTION 'Invalid office classification: %', p_new_org_role;
  END IF;
  IF p_new_status NOT IN ('invited', 'active', 'revoked', 'declined') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT * INTO v_before FROM organization_memberships WHERE organization_id = p_organization_id AND user_id = p_user_id FOR UPDATE;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'No such organization membership'; END IF;

  UPDATE organization_memberships SET org_role = p_new_org_role, status = p_new_status, updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (p_user_id, p_organization_id, 'office_classification_corrected', auth.uid(),
    jsonb_build_object('org_role', v_before.org_role, 'status', v_before.status),
    jsonb_build_object('org_role', v_after.org_role, 'status', v_after.status), p_reason);

  RETURN v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_correct_office_classification(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_correct_office_classification(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Platform Owner read access for account administration (§10.2:
-- "locate an Enterprise account... review identity and organization
-- relationships"). SELECT-only; writes still go exclusively through
-- the audited RPCs above.
DO $$ BEGIN
  CREATE POLICY "Platform Owner can view all organization memberships"
    ON organization_memberships FOR SELECT
    USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Platform Owner can view all organizations"
    ON organizations FOR SELECT
    USING (public.is_platform_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- §13 — CLOSE THE SELF-APPROVAL BOOTSTRAP: create_organization() no
-- longer creates an organization or grants director status at all. It
-- now submits a pending Director application instead — §7.2's explicit
-- requirement. The function NAME and SIGNATURE are kept identical so
-- every existing caller (CreateOrgCard, the residential /business
-- "Start an Organization" fallback) keeps working without a frontend
-- rewrite; only its RETURN SHAPE and actual effect change, which the
-- one caller (organizationService.ts's createOrganization()) is updated
-- to reflect honestly ("submitted for review," never "created").
-- ============================================================================
-- Return type changes from `organizations` to `professional_applications`
-- — Postgres requires the old signature dropped first before a
-- CREATE OR REPLACE with a different return type is accepted.
DROP FUNCTION IF EXISTS public.create_organization(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_package_type TEXT
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_memberships WHERE user_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'You are already an active member of an organization. Organization creation is managed by your organization''s director — ask them to add you where needed, or contact support to start a separate organization.';
  END IF;

  SELECT * INTO v_app FROM public.submit_professional_application(
    'director', NULL, p_name, p_package_type,
    COALESCE((SELECT first_name || ' ' || last_name FROM profiles WHERE id = auth.uid()), 'Applicant'),
    NULL, COALESCE((SELECT email FROM profiles WHERE id = auth.uid()), ''), NULL, NULL, NULL, '{}'::jsonb
  );

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- §14 — private 'professional-credentials' storage bucket. Mirrors the
-- patient-documents pattern (migration 007): never public, objects keyed
-- `${application_id}/${document_type}/...`, only the applicant and an
-- authorized reviewer (their application's own target-org director, or
-- the Platform Owner) may read; only the applicant may write to their
-- own application's folder, and only while it is still open for review.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('professional-credentials', 'professional-credentials', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Applicant can upload their own application credential files"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'professional-credentials'
      AND EXISTS (
        SELECT 1 FROM professional_applications a
        WHERE a.id::text = (storage.foldername(name))[1] AND a.applicant_user_id = auth.uid()
          AND a.status IN ('pending_review', 'info_required', 'resubmitted')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Applicant can view their own application credential files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'professional-credentials'
      AND EXISTS (SELECT 1 FROM professional_applications a WHERE a.id::text = (storage.foldername(name))[1] AND a.applicant_user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authorized reviewers can view application credential files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'professional-credentials'
      AND EXISTS (
        SELECT 1 FROM professional_applications a WHERE a.id::text = (storage.foldername(name))[1]
        AND ((a.target_organization_id IS NOT NULL AND public.is_active_org_director(a.target_organization_id)) OR public.is_platform_owner())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
