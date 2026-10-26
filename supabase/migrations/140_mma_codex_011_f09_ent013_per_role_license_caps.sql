-- MMA-CODEX-011 finding 011-05 (F-09/ENT-013, P1): independent audit
-- inspected organization_licenses' columns and the license configuration
-- UI and found only a single pooled seat count (licensed_seats) -- no
-- mechanism exists to cap any one office/role's headcount separately
-- within that pool. This is the exact gap migrations 129 and 131 each
-- already disclosed honestly and deliberately left open ("F-09 also
-- names 'no office cap/per-role-allowance model' ... not touched by
-- this narrow concurrency fix" / "'role-specific seat allocations' ...
-- is a materially larger schema change ... has not been attempted
-- here").
--
-- IMPORTANT: this migration's CREATE OR REPLACE bodies for
-- invite_org_member/director_approve_application/org_configure_license
-- are copied from their LATEST prior versions (migrations 131 and 129
-- respectively, the most recent before this one) with ONLY the new
-- per-role-cap logic layered in -- NOT from their original 035/097
-- bodies. An earlier draft of this migration mistakenly started from
-- the original bodies and silently reverted migrations 057/083/089/097/
-- 112/119/124/129/131's accumulated fixes (role delegation, F-13
-- eligibility bypass, F-09 therapist package scope, the configure-
-- versus-activation lock). Caught by running the FULL integration suite
-- before committing (9 failures across 5 unrelated-looking files) --
-- never by inspection alone.
--
-- Fix: four new, nullable per-role seat-cap columns on
-- organization_licenses, covering the four non-governance "office"
-- roles invite_org_member's own original role set already named
-- (caregiver, therapist, medical_professional, billing_admin) --
-- deliberately NOT the delegation/governance roles (co_director,
-- office_administrator, clinical_supervisor, auditor), and deliberately
-- NOT the same bucket set as DirectorApplicationWizard's informational
-- seatsAdmin/seatsCaregiver/seatsTherapist/seatsMedical sizing fields
-- (those remain unwired to any server-side enforcement, a separate,
-- larger, not-yet-attempted piece of F-09, same as before this
-- migration). NULL (the default for every existing row) means "no
-- separate cap for this role -- governed only by the existing aggregate
-- licensed_seats pool," so nothing about current enforcement changes
-- unless a Director explicitly configures a narrower per-role cap.
ALTER TABLE organization_licenses
  ADD COLUMN IF NOT EXISTS max_caregiver_seats INTEGER CHECK (max_caregiver_seats IS NULL OR max_caregiver_seats >= 0),
  ADD COLUMN IF NOT EXISTS max_medical_professional_seats INTEGER CHECK (max_medical_professional_seats IS NULL OR max_medical_professional_seats >= 0),
  ADD COLUMN IF NOT EXISTS max_therapist_seats INTEGER CHECK (max_therapist_seats IS NULL OR max_therapist_seats >= 0),
  ADD COLUMN IF NOT EXISTS max_billing_admin_seats INTEGER CHECK (max_billing_admin_seats IS NULL OR max_billing_admin_seats >= 0);

COMMENT ON COLUMN organization_licenses.max_caregiver_seats IS 'Optional per-role cap within the aggregate licensed_seats pool. NULL = no separate cap for this role.';
COMMENT ON COLUMN organization_licenses.max_medical_professional_seats IS 'Optional per-role cap within the aggregate licensed_seats pool. NULL = no separate cap for this role.';
COMMENT ON COLUMN organization_licenses.max_therapist_seats IS 'Optional per-role cap within the aggregate licensed_seats pool. NULL = no separate cap for this role.';
COMMENT ON COLUMN organization_licenses.max_billing_admin_seats IS 'Optional per-role cap within the aggregate licensed_seats pool. NULL = no separate cap for this role.';

-- org_configure_license(): base body is migration 129's (the FOR UPDATE
-- lock against concurrent activation, and the "active license is
-- locked" rejection) -- additive trailing params, all DEFAULT NULL, so
-- every existing call site that only passes the original four named
-- arguments is unaffected. A new parameter COUNT is a different
-- function identity in Postgres -- CREATE OR REPLACE alone would leave
-- the old 4-arg overload in place alongside this new 8-arg one, and
-- PostgREST's named-parameter RPC dispatch cannot then tell which
-- overload a 4-key call body means -- it would start rejecting every
-- existing caller with an ambiguous-function error. The old overload
-- must be dropped, not left beside the new one.
DROP FUNCTION IF EXISTS public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC);

CREATE OR REPLACE FUNCTION public.org_configure_license(
  p_org_id UUID,
  p_licensed_seats INTEGER,
  p_covered_patient_capacity INTEGER,
  p_annual_license_fee NUMERIC,
  p_max_caregiver_seats INTEGER DEFAULT NULL,
  p_max_medical_professional_seats INTEGER DEFAULT NULL,
  p_max_therapist_seats INTEGER DEFAULT NULL,
  p_max_billing_admin_seats INTEGER DEFAULT NULL
) RETURNS organization_licenses AS $$
DECLARE
  v_existing organization_licenses;
  v_row organization_licenses;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may configure its license';
  END IF;
  IF p_licensed_seats IS NOT NULL AND p_licensed_seats < 0 THEN
    RAISE EXCEPTION 'licensed_seats cannot be negative';
  END IF;
  IF p_covered_patient_capacity IS NOT NULL AND p_covered_patient_capacity < 0 THEN
    RAISE EXCEPTION 'covered_patient_capacity cannot be negative';
  END IF;
  IF p_max_caregiver_seats IS NOT NULL AND p_max_caregiver_seats < 0 THEN RAISE EXCEPTION 'max_caregiver_seats cannot be negative'; END IF;
  IF p_max_medical_professional_seats IS NOT NULL AND p_max_medical_professional_seats < 0 THEN RAISE EXCEPTION 'max_medical_professional_seats cannot be negative'; END IF;
  IF p_max_therapist_seats IS NOT NULL AND p_max_therapist_seats < 0 THEN RAISE EXCEPTION 'max_therapist_seats cannot be negative'; END IF;
  IF p_max_billing_admin_seats IS NOT NULL AND p_max_billing_admin_seats < 0 THEN RAISE EXCEPTION 'max_billing_admin_seats cannot be negative'; END IF;

  SELECT * INTO v_existing FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration found for this organization';
  END IF;
  IF v_existing.status = 'active' THEN
    RAISE EXCEPTION 'This license is active under a confirmed commercial agreement -- seats, capacity, and fee can no longer be self-configured. Contact the Platform Owner for an expansion or renewal quote.';
  END IF;

  -- A per-role cap narrower than that role's current active+invited
  -- headcount would silently orphan existing members above the new
  -- limit (never rejected, never re-counted) -- reject the configure
  -- call itself instead, same "fail loud, not silently" standard as
  -- every other capacity check in this file.
  IF p_max_caregiver_seats IS NOT NULL AND p_max_caregiver_seats < (
    SELECT count(*) FROM organization_memberships WHERE organization_id = p_org_id AND org_role = 'caregiver' AND status IN ('active', 'invited')
  ) THEN RAISE EXCEPTION 'max_caregiver_seats cannot be set below the current caregiver headcount for this organization'; END IF;
  IF p_max_medical_professional_seats IS NOT NULL AND p_max_medical_professional_seats < (
    SELECT count(*) FROM organization_memberships WHERE organization_id = p_org_id AND org_role = 'medical_professional' AND status IN ('active', 'invited')
  ) THEN RAISE EXCEPTION 'max_medical_professional_seats cannot be set below the current medical professional headcount for this organization'; END IF;
  IF p_max_therapist_seats IS NOT NULL AND p_max_therapist_seats < (
    SELECT count(*) FROM organization_memberships WHERE organization_id = p_org_id AND org_role = 'therapist' AND status IN ('active', 'invited')
  ) THEN RAISE EXCEPTION 'max_therapist_seats cannot be set below the current therapist headcount for this organization'; END IF;
  IF p_max_billing_admin_seats IS NOT NULL AND p_max_billing_admin_seats < (
    SELECT count(*) FROM organization_memberships WHERE organization_id = p_org_id AND org_role = 'billing_admin' AND status IN ('active', 'invited')
  ) THEN RAISE EXCEPTION 'max_billing_admin_seats cannot be set below the current billing admin headcount for this organization'; END IF;

  UPDATE organization_licenses SET
    licensed_seats = p_licensed_seats,
    covered_patient_capacity = p_covered_patient_capacity,
    annual_license_fee = p_annual_license_fee,
    max_caregiver_seats = p_max_caregiver_seats,
    max_medical_professional_seats = p_max_medical_professional_seats,
    max_therapist_seats = p_max_therapist_seats,
    max_billing_admin_seats = p_max_billing_admin_seats,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

-- invite_org_member(): base body is migration 131's (role delegation,
-- F-13 eligibility bypass closing therapist/medical_professional direct
-- invites, F-09 therapist-package office scope). Only reachable roles
-- at the point of the new check are 'caregiver' and 'billing_admin'
-- (therapist/medical_professional already raise above; the delegation/
-- governance roles have no per-role cap column and the CASE below
-- correctly yields NULL -- no cap -- for them, unchanged from before).
-- Also locks the organization's own license row (FOR UPDATE) before
-- checking capacity -- closing a pre-existing, same-root-cause race
-- this function never had (director_approve_application, migration 097,
-- already does this for its own path) where two concurrent invites
-- could both read the aggregate count as one-under-capacity before
-- either committed. The unchanged aggregate check runs first, exactly
-- as before -- "without weakening aggregate gates."
CREATE OR REPLACE FUNCTION public.invite_org_member(
  p_org_id UUID,
  p_email TEXT,
  p_org_role TEXT
) RETURNS organization_memberships AS $$
DECLARE
  v_target_user_id UUID;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_row organization_memberships;
  v_is_director boolean;
  v_is_office_admin boolean;
  v_package TEXT;
  v_role_cap INTEGER;
  v_role_count INTEGER;
BEGIN
  v_is_director := public.is_active_org_director(p_org_id);
  v_is_office_admin := EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND org_role = 'office_administrator' AND status = 'active'
  );
  IF NOT v_is_director AND NOT v_is_office_admin THEN
    RAISE EXCEPTION 'Only an active director, co-director, or office administrator of this organization may invite staff';
  END IF;

  IF p_org_role IN ('therapist', 'medical_professional') THEN
    RAISE EXCEPTION 'A therapist or medical professional office requires independently verified credentials -- submit a professional application for this organization instead of a direct invite';
  END IF;

  SELECT package_type INTO v_package FROM organizations WHERE id = p_org_id;
  IF v_package = 'therapist' AND p_org_role = 'caregiver' THEN
    RAISE EXCEPTION 'This organization''s Therapist Enterprise package does not include the caregiver office';
  END IF;

  IF v_is_director THEN
    IF p_org_role NOT IN ('caregiver', 'billing_admin', 'co_director', 'office_administrator', 'clinical_supervisor', 'auditor') THEN
      RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
    END IF;
  ELSE
    IF p_org_role NOT IN ('caregiver', 'billing_admin') THEN
      RAISE EXCEPTION 'An office administrator may only invite caregiver or billing administrator roles';
    END IF;
  END IF;

  SELECT id INTO v_target_user_id FROM profiles WHERE lower(email) = lower(btrim(p_email));
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first, then invite them.', p_email;
  END IF;

  PERFORM licensed_seats FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;

  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
  END IF;

  v_role_cap := CASE p_org_role
    WHEN 'caregiver' THEN (SELECT max_caregiver_seats FROM organization_licenses WHERE organization_id = p_org_id)
    WHEN 'billing_admin' THEN (SELECT max_billing_admin_seats FROM organization_licenses WHERE organization_id = p_org_id)
    ELSE NULL
  END;
  IF v_role_cap IS NOT NULL THEN
    SELECT count(*) INTO v_role_count FROM organization_memberships
      WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role = p_org_role;
    IF v_role_count >= v_role_cap THEN
      RAISE EXCEPTION 'No licensed % seats are available for this organization (% of % used). Configure a higher per-role cap before inviting more.', p_org_role, v_role_count, v_role_cap;
    END IF;
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_org_id, v_target_user_id, p_org_role, 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = EXCLUDED.org_role,
    status = CASE WHEN organization_memberships.status = 'revoked' THEN 'invited' ELSE organization_memberships.status END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.invite_org_member(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_org_member(UUID, TEXT, TEXT) TO authenticated;

-- director_approve_application(): base body is migration 131's
-- (therapist-package office scope). requested_office here is always
-- one of 'caregiver'/'medical_professional'/'therapist' (the only
-- non-director values the column accepts) -- all three get a per-role
-- cap check this time, under the SAME organization_licenses lock this
-- function already takes (migration 097), counting only status='active'
-- for that specific role (this function's existing aggregate count is
-- 'active' only, because approval IS the activation step -- unlike
-- invite_org_member's 'active'+'invited').
CREATE OR REPLACE FUNCTION public.director_approve_application(p_application_id UUID) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_package TEXT;
  v_role_cap INTEGER;
  v_role_count INTEGER;
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

  SELECT package_type INTO v_package FROM organizations WHERE id = v_app.target_organization_id;
  IF v_package = 'therapist' AND v_app.requested_office IN ('caregiver', 'medical_professional') THEN
    RAISE EXCEPTION 'This organization''s Therapist Enterprise package does not include caregiver or medical professional offices';
  END IF;

  PERFORM licensed_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id FOR UPDATE;
  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id;
  IF v_seats IS NOT NULL THEN
    SELECT count(*) INTO v_active_count FROM organization_memberships WHERE organization_id = v_app.target_organization_id AND status = 'active';
    IF v_active_count >= v_seats THEN
      RAISE EXCEPTION 'This organization has no remaining licensed seats. Increase licensed seats before approving this application.';
    END IF;
  END IF;

  v_role_cap := CASE v_app.requested_office
    WHEN 'caregiver' THEN (SELECT max_caregiver_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id)
    WHEN 'medical_professional' THEN (SELECT max_medical_professional_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id)
    WHEN 'therapist' THEN (SELECT max_therapist_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id)
    ELSE NULL
  END;
  IF v_role_cap IS NOT NULL THEN
    SELECT count(*) INTO v_role_count FROM organization_memberships
      WHERE organization_id = v_app.target_organization_id AND status = 'active' AND org_role = v_app.requested_office;
    IF v_role_count >= v_role_cap THEN
      RAISE EXCEPTION 'This organization has no remaining licensed % seats. Increase the per-role cap before approving this application.', v_app.requested_office;
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
