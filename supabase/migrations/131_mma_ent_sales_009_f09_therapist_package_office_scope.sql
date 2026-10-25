-- MMA-ENT-SALES-009 Workstream C §17 (F-09, "license and office
-- entitlements") -- "Prevent: ... Therapist package caregiver feature
-- access." Confirmed by reading the actual code: organizations.
-- package_type ('therapist' | 'integrated_care', set once at Director
-- approval and never re-checked) is NOT consulted by either staff-
-- granting path. A 'therapist'-only ("Therapist Enterprise") package
-- organization could, before this migration, have a caregiver OR a
-- medical_professional approved into it through the credential-
-- verified application pipeline (director_approve_application(),
-- migration 097), and a caregiver invited directly (invite_org_member(),
-- migration 124 -- the only clinical-adjacent role left reachable
-- there after CODEX F-13 already closed therapist/medical_professional
-- for that path). Both paths granted real, working office access with
-- no package check at all.
--
-- Fix: both functions now reject a caregiver or medical_professional
-- grant when the target organization's package_type is 'therapist'.
-- 'integrated_care' (Full Enterprise) is unrestricted, as before.
-- Director/office_administrator/billing_admin/co_director/
-- clinical_supervisor/auditor are governance/administrative roles, not
-- clinical office seats, and are deliberately NOT restricted by
-- package here, matching this engagement's existing, narrower
-- treatment of caregiver in migration 124's own reasoning.
--
-- Scoped out, not silently claimed fixed: F-09's other named item,
-- "role-specific seat allocations" (a per-role sub-limit within the
-- one aggregate licensed_seats number -- the wizard's own step1
-- already collects seatsAdmin/seatsCaregiver/seatsTherapist/
-- seatsMedical but nothing server-side has ever read them), is a
-- materially larger schema change (new organization_licenses columns,
-- org_configure_license() rewrite, Director licensing-page UI, and the
-- amendment-request flow all need to agree on the new shape) and has
-- not been attempted here -- documented as outstanding, not fabricated
-- as closed.

CREATE OR REPLACE FUNCTION public.director_approve_application(p_application_id UUID) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_package TEXT;
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

  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
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
