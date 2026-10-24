-- OWNER DIRECTIVE MMA-ENT-SALES-007-FINAL Phase H — "Implement
-- delegation roles: Founding Director. Authorized Co-Director. Office
-- Administrator. Caregiver. Therapist. Clinical Supervisor where
-- applicable. Billing Administrator. Auditor/Compliance Reviewer where
-- applicable."
--
-- Caregiver, Therapist and Billing Administrator already exist
-- (migration 035's org_role: 'caregiver', 'therapist', 'billing_admin').
-- This migration adds the four still-missing values and wires each to
-- a real, testable permission difference -- never just a label with no
-- enforced behavior behind it:
--
--   co_director          -- full Director-equivalent authority. Rather
--                            than retrofit every one of the ~20 existing
--                            call sites that gate on the literal
--                            org_role = 'director', this widens the one
--                            shared helper function (is_active_org_
--                            director(), already the sole authority
--                            boundary for patient visibility, staff
--                            invites, credential review, license
--                            configuration, amendment requests and
--                            contract management) to also recognize
--                            co_director -- additive by construction,
--                            same reasoning as this engagement's
--                            trigger-based notification design: nothing
--                            existing changes behavior, more people can
--                            now pass a check that already existed.
--                            A small number of secondary/cosmetic
--                            surfaces still hardcode the literal
--                            'director' string directly rather than
--                            calling the helper (care-team peer
--                            directory listing, default conversation
--                            participation, the dashboard communications
--                            count, the "last director" removal guard,
--                            and license-activated notification
--                            routing) -- intentionally NOT touched here;
--                            none of them are an authority boundary (a
--                            missing Co-Director there is a visibility
--                            gap, never a privilege escalation), and
--                            retrofitting all of them is out of scope
--                            for this increment. Documented honestly in
--                            the status doc, not silently claimed
--                            complete.
--   office_administrator -- a new, narrower delegated-invite authority:
--                            can invite caregiver/therapist/medical_
--                            professional/billing_admin staff (the same
--                            restricted set a Director already could),
--                            but cannot invite another office_
--                            administrator, a clinical_supervisor, an
--                            auditor, a co_director, or a director --
--                            never able to grant a role at or above
--                            their own level.
--   clinical_supervisor  -- read-only clinical oversight: sees every
--                            staff-patient assignment, every covered
--                            patient, and every member profile in their
--                            own org, mirroring the Director's existing
--                            oversight grants (migration 081) via a new
--                            additive policy -- never a write grant.
--   auditor               -- read-only compliance visibility into their
--                            own org's membership roster and license
--                            status. (Contract/amendment-request
--                            visibility for this role is NOT yet wired --
--                            an honest scope boundary, not fabricated.)

ALTER TABLE organization_memberships DROP CONSTRAINT IF EXISTS organization_memberships_org_role_check;
ALTER TABLE organization_memberships ADD CONSTRAINT organization_memberships_org_role_check
  CHECK (org_role IN ('director', 'co_director', 'caregiver', 'therapist', 'medical_professional', 'billing_admin', 'office_administrator', 'clinical_supervisor', 'auditor'));

CREATE OR REPLACE FUNCTION public.is_active_org_director(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND org_role IN ('director', 'co_director') AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_active_org_clinical_authority(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND org_role IN ('director', 'co_director', 'clinical_supervisor') AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_active_org_clinical_authority(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_org_clinical_authority(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_active_org_auditor(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND org_role = 'auditor' AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_active_org_auditor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_org_auditor(UUID) TO authenticated;

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

  IF v_is_director THEN
    IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin', 'co_director', 'office_administrator', 'clinical_supervisor', 'auditor') THEN
      RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
    END IF;
  ELSE
    IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
      RAISE EXCEPTION 'An office administrator may only invite caregiver, therapist, medical professional, or billing administrator roles';
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

-- Clinical Supervisor read-only oversight, additive -- mirrors the
-- existing Director-scoped policies (migrations 035, 081) exactly,
-- just for a narrower, read-only role.
DO $$ BEGIN
  CREATE POLICY "Active clinical authority can view assignments in their own org"
    ON staff_patient_assignments FOR SELECT TO authenticated
    USING (public.is_active_org_clinical_authority(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The patients policy below joins through covered_patient_memberships,
-- and that join itself re-evaluates covered_patient_memberships' OWN
-- RLS as the calling (authenticated) role -- is_active_org_director()
-- being SECURITY DEFINER only bypasses RLS on the table IT queries
-- (organization_memberships), never on covered_patient_memberships. A
-- clinical_supervisor with no SELECT grant there would see the
-- subquery return zero rows regardless, so this additive grant (mirror
-- of the existing director policy just below it) is required, not
-- optional. Caught by this migration's own integration test (expected
-- 1 row, got 0) before this was shipped.
DO $$ BEGIN
  CREATE POLICY "Active clinical authority can view coverage in their org"
    ON covered_patient_memberships FOR SELECT TO authenticated
    USING (public.is_active_org_clinical_authority(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active clinical authority can view patients in their org"
    ON patients FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM covered_patient_memberships cpm
        WHERE cpm.patient_id = patients.id AND cpm.status = 'active'
          AND public.is_active_org_clinical_authority(cpm.organization_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same RLS-on-the-subquery gotcha as covered_patient_memberships above:
-- the profiles policy below joins organization_memberships to itself,
-- and that direct query is subject to organization_memberships' OWN
-- RLS as the calling role. A clinical_supervisor could see their own
-- membership row (the existing self policy) but not any OTHER
-- member's row, so the join's om_target side returned nothing. This
-- additive grant (mirroring the auditor policy just above) is what
-- that join actually needs.
DO $$ BEGIN
  CREATE POLICY "Active clinical authority can view memberships in org"
    ON organization_memberships FOR SELECT TO authenticated
    USING (public.is_active_org_clinical_authority(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active clinical authority can view member profiles in org"
    ON profiles FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM organization_memberships om_target
        JOIN organization_memberships om_self
          ON om_self.organization_id = om_target.organization_id
        WHERE om_target.user_id = profiles.id AND om_target.status = 'active'
          AND om_self.user_id = auth.uid() AND om_self.org_role = 'clinical_supervisor' AND om_self.status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Found while widening is_active_org_director(): migration 081's
-- director profiles policy hardcodes the literal org_role = 'director'
-- string directly instead of calling the shared helper (so it would
-- NOT have picked up co_director), and was never scoped `TO
-- authenticated` like every other RLS policy in this schema is
-- required to be (CLAUDE.md convention; also the standard post-
-- migration guard this engagement runs after every migration).
-- Dropped and recreated via the helper, closing both gaps at once --
-- same authorization boundary, co_director now included, correctly
-- scoped.
DROP POLICY IF EXISTS "Active org directors can view member profiles in their own org" ON profiles;
CREATE POLICY "Active org directors can view member profiles in their own org"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om_target
      WHERE om_target.user_id = profiles.id AND om_target.status = 'active'
        AND public.is_active_org_director(om_target.organization_id)
    )
  );

-- Auditor/Compliance Reviewer read-only visibility into their own
-- org's roster and license status.
DO $$ BEGIN
  CREATE POLICY "Active auditor can view memberships in their own org"
    ON organization_memberships FOR SELECT TO authenticated
    USING (public.is_active_org_auditor(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active auditor can view their own org's license"
    ON organization_licenses FOR SELECT TO authenticated
    USING (public.is_active_org_auditor(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
