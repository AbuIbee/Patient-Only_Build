-- CODEX F-13 (P1, release-blocking) — "Professional eligibility
-- bypass remains." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-13,
-- target commit b362e119.
--
-- Confirmed by reading the actual code: the professional_applications
-- pipeline (migrations 083/089) requires record_credential_
-- verification() to reach 'independently_verified' before
-- director_approve_application() can grant a therapist or
-- medical_professional office at all. But invite_org_member()
-- (migration 035, predates the credential-verification system
-- entirely) lets any active Director invite an EXISTING account
-- directly into 'therapist' or 'medical_professional' with ZERO
-- credential check of any kind -- respond_to_org_invite() then
-- activates that membership on simple acceptance, no verification
-- step anywhere in that path. is_professional_staff_for_patient()
-- (migration 070), the function every clinical note/diagnosis/
-- medication RPC gates on, trusts staff_patient_assignments.org_role
-- IN ('therapist','medical_professional') unconditionally -- it has no
-- way to know, and does not ask, whether that role was ever granted
-- through credential verification or through this completely
-- unverified legacy path. The two paths grant IDENTICAL clinical
-- authority; only one of them is actually gated.
--
-- Fix: invite_org_member() (and migration 119's office_administrator
-- delegated-invite variant, which reuses this exact function) can no
-- longer grant 'therapist' or 'medical_professional' at all -- those
-- two specifically licensed clinical offices must go exclusively
-- through the credential-verified application pipeline that already
-- exists and already works correctly for them. This does not touch
-- 'caregiver' (the migration 089 comment's own grouping is ambiguous
-- between "professional/credentialed caregiver" and the much more
-- common, lower-risk "Director invites a known staff member" use --
-- restricting it here without a clearer owner signal would be an
-- unjustified, overreaching change to a widely-used path) or any of
-- the administrative/governance roles (billing_admin, co_director,
-- office_administrator, clinical_supervisor, auditor) added this
-- engagement -- none of those carry an independent licensed-credential
-- requirement the way therapist/medical_professional do.
--
-- A residual, narrower path still exists:
-- platform_owner_correct_office_classification() (migration 104) can
-- also set org_role to therapist/medical_professional without a
-- credential check. Deliberately NOT touched here: it is Platform-
-- Owner-only (a far smaller, already-trusted actor than "any
-- Director"), it exists specifically as a classification-CORRECTION
-- tool rather than an initial grant mechanism, and closing it
-- correctly needs its own review of what "correcting" a
-- classification should require -- scoped out honestly, not silently
-- claimed fixed.
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
