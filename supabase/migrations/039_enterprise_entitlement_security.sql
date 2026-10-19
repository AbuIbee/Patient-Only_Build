-- 039_enterprise_entitlement_security.sql
-- FINAL INTEGRATION CORRECTIONS item 1 — CRITICAL commercial entitlement
-- security.
--
-- Bug: is_my_enterprise_coverage_active() granted Full Support whenever a
-- covered_patient_memberships row existed with status='active', with NO
-- check on the covering organization's LICENSE status. Since
-- org_configure_license() never set status away from its 'proposed'
-- default, every organization was effectively already "active" for
-- entitlement purposes the instant a director covered a patient — a
-- director configuring capacity/a proposed fee was functionally
-- equivalent to activating paid coverage, which is exactly what the
-- owner flagged as unacceptable.
--
-- Fix: entitlement now requires BOTH an active covered_patient_memberships
-- row AND organization_licenses.status = 'active'. Activating a license is
-- moved to a NEW admin-only RPC (admin_set_organization_license_status) —
-- the same profiles.role IN ('admin','superadmin') gate already used by
-- admin_set_subscription() for residential accounts. A director still
-- cannot self-activate: org_configure_license() is untouched and still
-- never writes to `status`.
--
-- "Preserve existing covered-patient records and implement appropriate
-- coverage transitions": covered_patient_memberships rows are NEVER
-- mutated by a license status change. Entitlement is computed fresh on
-- every check by joining the two tables, so flipping a license from
-- proposed -> active -> expired -> canceled transitions coverage
-- immediately and reversibly with zero data loss and zero migration of
-- membership rows.
--
-- Also fixes a real TOCTOU capacity race in cover_patient() and
-- cover_patient_via_staff_registration(): both read an active-count then
-- INSERT with no lock, so two concurrent calls for the same organization
-- could both read "capacity not yet reached" and both succeed, exceeding
-- the configured cap. Both now take a row lock on organization_licenses
-- (SELECT ... FOR UPDATE) before counting, serializing concurrent covers
-- for the same org.
--
-- STAGING-TARGETED. Not yet applied to production. No production billing
-- activation; the new RPC only ever writes to organization_licenses.status
-- in the isolated staging project.

ALTER TABLE public.organization_licenses DROP CONSTRAINT organization_licenses_status_check;
ALTER TABLE public.organization_licenses ADD CONSTRAINT organization_licenses_status_check
  CHECK (status = ANY (ARRAY['proposed'::text, 'active'::text, 'expired'::text, 'canceled'::text, 'unpaid'::text]));

ALTER TABLE public.organization_licenses ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES profiles(id);
ALTER TABLE public.organization_licenses ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

-- The corrected, license-gated entitlement check.
CREATE OR REPLACE FUNCTION public.is_my_enterprise_coverage_active()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM covered_patient_memberships cpm
    JOIN organization_licenses ol ON ol.organization_id = cpm.organization_id
    WHERE cpm.patient_id = auth.uid()
      AND cpm.status = 'active'
      AND ol.status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- The ONLY path by which an organization license can become 'active' (or
-- be moved to 'expired'/'canceled'/'unpaid'). Admin-only — mirrors
-- admin_set_subscription()'s own gate exactly. Explicitly the "staging
-- activation mechanism for synthetic integration tests" the owner asked
-- for: a director cannot call this, and it never runs automatically from
-- configuring seats/capacity/fee.
CREATE OR REPLACE FUNCTION public.admin_set_organization_license_status(
  p_org_id UUID,
  p_status TEXT
) RETURNS organization_licenses AS $$
DECLARE
  v_row organization_licenses;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can activate or change an organization license status';
  END IF;
  IF p_status NOT IN ('proposed', 'active', 'expired', 'canceled', 'unpaid') THEN
    RAISE EXCEPTION 'Invalid license status: %', p_status;
  END IF;

  UPDATE organization_licenses SET
    status = p_status,
    activated_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE activated_by END,
    activated_at = CASE WHEN p_status = 'active' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration found for this organization';
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_organization_license_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_license_status(UUID, TEXT) TO authenticated;

-- Concurrency-safe capacity enforcement: lock the license row before
-- counting, so a second concurrent call for the same org blocks until the
-- first commits and then sees the up-to-date count.
CREATE OR REPLACE FUNCTION public.cover_patient(p_org_id UUID, p_patient_id UUID)
RETURNS covered_patient_memberships AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may cover a patient';
  END IF;
  SELECT * INTO v_row FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id;
  IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
    RETURN v_row; -- idempotent
  END IF;
  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used). Configure the license before covering more patients.', v_active_count, COALESCE(v_capacity, 0);
  END IF;
  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET
    status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.cover_patient_via_staff_registration(p_org_id UUID, p_patient_id UUID)
RETURNS covered_patient_memberships AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Only an active member of this organization may register a covered patient for it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active' AND org_role = 'caregiver'
  ) THEN
    RAISE EXCEPTION 'Only an active caregiver member of this organization may register a covered patient';
  END IF;
  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used).', v_active_count, COALESCE(v_capacity, 0);
  END IF;
  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;
  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, auth.uid(), p_patient_id, 'caregiver', auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET is_active = true, updated_at = now();
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
