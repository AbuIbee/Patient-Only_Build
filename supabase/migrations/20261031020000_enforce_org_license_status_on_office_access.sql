-- HCN organization license and office authentication remediation,
-- 2026-10-31. P0-02: "Identify every protected office RPC, API, route,
-- and Edge Function. Enforce the organization's current license
-- status on the server. Do not rely on frontend navigation checks
-- alone."
--
-- CONFIRMED DEFECT, found by reading the actual function body, not
-- assumed: get_my_organizations() (migration 035) -- the ONE function
-- ProfessionalOfficeResolver.tsx calls to decide whether a signed-in
-- user has ANY office (director/caregiver/medical_professional/
-- therapist) and therefore whether to render a real dashboard -- only
-- ever checked organization_memberships.status = 'active'. It never
-- joined organization_licenses at all. A Director or staff member
-- whose own membership is still perfectly active, but whose
-- ORGANIZATION'S LICENSE has since expired, been canceled, or been
-- suspended (Issue #3 P0-02's admin_set_organization_license_status,
-- or a lapsed/failed renewal), would still be handed a full operational
-- dashboard -- directly contradicting owner-approved architecture
-- item 6 ("Inactive licenses block all licensed office access") and
-- item 8 ("account authentication, license eligibility, and office
-- authorization must be separate server-enforced checks" -- this
-- function conflated the first two, skipping license eligibility
-- entirely).
--
-- This is the SAME class of defect migration 142 already found and
-- fixed for PATIENT data access (is_authorized_for_patient() et al.,
-- which already correctly join organization_licenses.status='active')
-- -- this migration closes the identical gap for OFFICE/DASHBOARD
-- access itself, the step that happens before any patient data is
-- even reached.
--
-- FIX: require organization_licenses.status = 'active' for the
-- organization returned. This is intentionally the ONLY change --
-- membership rows are never touched, mutated, or revoked here. Per
-- owner-approved architecture item 7 ("renewing a license restores
-- eligible existing memberships without re-registration"): because
-- license eligibility is checked LIVE here rather than baked into
-- membership state, the moment a license returns to 'active' (via
-- activate_enterprise_license_from_quote, Issue #3 P0-01, or a future
-- renewal transition), every existing non-revoked membership
-- automatically regains office access on its very next call to this
-- function -- no separate "restore membership" step is needed or
-- implemented, by design.
CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (organization_id UUID, organization_name TEXT, package_type TEXT, org_role TEXT) AS $$
  SELECT o.id, o.name, o.package_type, m.org_role
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  JOIN organization_licenses l ON l.organization_id = o.id
  WHERE m.user_id = auth.uid() AND m.status = 'active' AND l.status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;
