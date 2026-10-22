-- MASTER ENTERPRISE COMPLETION DIRECTIVE §1.C — Professional credential
-- verification. CONFIRMED FINDING (DEFECT-CREDENTIAL-VERIFICATION-
-- STATUS-NEVER-ENFORCED): migration 083 defined
-- professional_applications.credential_verification_status with a rich
-- 8-value CHECK constraint ('not_submitted','submitted','pending_review',
-- 'insufficient','independently_verified','expired','rejected',
-- 'requires_reverification') -- but no RPC anywhere ever read, wrote, or
-- gated on it. An application could reach status='approved' (granting
-- full, active organization membership and every privilege that office
-- carries) while its credential sat at the default 'submitted' value
-- forever, genuinely unverified, with nothing in the system ever
-- distinguishing that from a credential someone had actually checked.
--
-- This migration separates the four distinct phases the directive
-- names, where only two previously existed:
--   (1) Document submission        -- unchanged, already existed (professional_application_documents).
--   (2) Administrative review      -- unchanged, already existed (director_approve_application / request_application_corrections / reject_application: is this application complete and credible?).
--   (3) Independently verified authenticity -- NEW. record_credential_verification() below: a distinct, separately-audited decision, answering a different question than (2) ("is the credential itself genuine?"), made by the same reviewing authority but as its own explicit act with its own evidence trail.
--   (4) Final authorization        -- unchanged RPCs, now GATED on (3) actually having happened for the three clinical/caregiver offices.
--
-- NOT INVENTED HERE, and explicitly left to the owner (closure register
-- §4 item 5): WHAT constitutes sufficient evidence for "independently
-- verified" -- a licensing-board phone call, a document review, a
-- third-party verification service -- is a substantive standard this
-- migration does not prescribe. p_evidence_reference is free text the
-- human reviewer supplies describing what they actually did; this
-- migration only guarantees that SOMETHING was recorded, by an
-- identified reviewer, at an identified time, before any privilege is
-- granted -- never that it meets any particular regulatory bar.
ALTER TABLE professional_applications ADD COLUMN IF NOT EXISTS credential_verified_by UUID REFERENCES profiles(id);
ALTER TABLE professional_applications ADD COLUMN IF NOT EXISTS credential_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE professional_applications ADD COLUMN IF NOT EXISTS credential_verification_evidence TEXT;

-- record_credential_verification(): the new, separate "is the
-- credential itself genuine" decision. Scoped to the three offices
-- that actually submit a clinical/professional credential
-- (caregiver/medical_professional/therapist) -- a Director application
-- has no license-type credential to verify (it is an organizational
-- founding, approved by the Platform Owner through a completely
-- separate path); this RPC explicitly refuses to apply to one, rather
-- than silently accepting a meaningless call.
CREATE OR REPLACE FUNCTION public.record_credential_verification(
  p_application_id UUID, p_decision TEXT, p_evidence_reference TEXT
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  IF p_decision NOT IN ('independently_verified', 'insufficient', 'rejected', 'requires_reverification') THEN
    RAISE EXCEPTION 'Invalid credential verification decision: %', p_decision;
  END IF;
  IF p_evidence_reference IS NULL OR btrim(p_evidence_reference) = '' THEN
    RAISE EXCEPTION 'An evidence reference describing what was checked is required';
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office = 'director' THEN
    RAISE EXCEPTION 'Director applications have no clinical credential to independently verify';
  END IF;
  IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
    RAISE EXCEPTION 'Only an active director of the target organization may record a credential verification decision';
  END IF;
  IF v_app.applicant_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot verify your own credential';
  END IF;

  UPDATE professional_applications SET
    credential_verification_status = p_decision,
    credential_verified_by = auth.uid(),
    credential_verified_at = now(),
    credential_verification_evidence = p_evidence_reference,
    updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'credential_verification_recorded', auth.uid(), 'director', v_app.status, v_app.status,
    'Credential verification decision: ' || p_decision || ' — ' || p_evidence_reference);

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_credential_verification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_credential_verification(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_credential_verification(UUID, TEXT, TEXT) FROM anon;

-- director_approve_application(): now REQUIRES credential_verification_status
-- = 'independently_verified' before an application for the three
-- clinical/caregiver offices can be approved at all — closing
-- DEFECT-CREDENTIAL-VERIFICATION-STATUS-NEVER-ENFORCED. An unverified
-- professional structurally cannot become an active member (and
-- therefore cannot exercise any privilege of that office), satisfying
-- the directive's explicit requirement without inventing a new
-- "provisional privilege" tier this architecture never had.
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
  IF v_app.credential_verification_status != 'independently_verified' THEN
    RAISE EXCEPTION 'This application cannot be approved until its credential has been independently verified (current status: %). Call record_credential_verification() first.', v_app.credential_verification_status;
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
REVOKE EXECUTE ON FUNCTION public.director_approve_application(UUID) FROM anon;
