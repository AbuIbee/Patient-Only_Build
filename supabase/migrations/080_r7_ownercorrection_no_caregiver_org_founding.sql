-- 080_r7_ownercorrection_no_caregiver_org_founding.sql
-- OWNER CORRECTION — ENTERPRISE ROLES, ONBOARDING AND NAVIGATION:
-- "Enterprise caregivers are operational users, not organization
-- founders by default... ordinary caregivers must also be denied
-- organization-creation... at the RPC/database level, not merely a
-- hidden UI button."
--
-- ROOT STATE BEFORE THIS MIGRATION: create_organization() (migration
-- 035) has no restriction beyond basic authentication -- ANY
-- authenticated account, including one already actively staffing an
-- existing Enterprise organization, could call it and instantly become
-- the director of a second, unrelated organization. This was the
-- intentional, pre-existing self-service bootstrap mechanism a
-- brand-new residential caregiver uses to found their very first
-- organization -- that path is explicitly preserved (owner correction
-- item 11: "preserve existing residential caregiver functionality").
--
-- FIX (narrowly scoped, not a re-architecture of org bootstrapping):
-- reject the call only when the caller ALREADY holds an active
-- organization_memberships row, in ANY organization, under ANY role
-- (caregiver, therapist, medical_professional, or even an existing
-- director trying to spin up an unrelated second org). A brand-new
-- user with zero existing membership rows is completely unaffected and
-- can still self-bootstrap their first organization exactly as before.
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_package_type TEXT
) RETURNS organizations AS $$
DECLARE
  v_org organizations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_memberships WHERE user_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'You are already an active member of an organization. Organization creation is managed by your organization''s director — ask them to add you where needed, or contact support to start a separate organization.';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;
  IF p_package_type NOT IN ('therapist', 'integrated_care') THEN
    RAISE EXCEPTION 'Invalid package type: %', p_package_type;
  END IF;

  INSERT INTO organizations (name, package_type, created_by)
  VALUES (btrim(p_name), p_package_type, auth.uid())
  RETURNING * INTO v_org;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, auth.uid(), 'director', 'active', auth.uid());

  -- A fresh org starts with NO licensed seats/capacity (item 7) — a real
  -- row exists so org_configure_license() has something to UPDATE, but it
  -- grants nothing by itself.
  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated;
