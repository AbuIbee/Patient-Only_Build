-- HCN organization license and office authentication remediation,
-- 2026-10-31. P0-05: "Replace every 'contact Platform Owner' dead end
-- with an actionable, truthful state", explicitly naming 'Renew
-- license' as one of the required states.
--
-- get_my_organizations() (migration 20261031020000) now correctly
-- EXCLUDES an organization whose license is not 'active' -- but doing
-- that in isolation reintroduces the P0-05 problem one level up: a
-- Director/staff member whose membership is still perfectly active,
-- but whose org's license has expired/been canceled/been suspended,
-- now sees availableOffices.length === 0 in ProfessionalOfficeResolver
-- with NO way to distinguish "your org's license lapsed -- renew it"
-- from "you have never had any office at all." Falling through to the
-- generic AccessRequiredState (or, worse, a stale-looking "approved --
-- agreements pending" ApplicationStatusPage) would be exactly the kind
-- of untruthful dead end this directive requires removed.
--
-- This read-only helper is the deliberately separate, additive
-- counterpart that makes the TRUE reason visible to the frontend
-- without granting any access itself -- it never appears in
-- get_my_organizations()'s own result set (license-active and
-- license-blocked are mutually exclusive by construction), so it
-- carries no risk of being mistaken for real office access by any
-- existing caller.
CREATE OR REPLACE FUNCTION public.get_my_license_blocked_memberships()
RETURNS TABLE (organization_id UUID, organization_name TEXT, org_role TEXT, license_status TEXT) AS $$
  SELECT o.id, o.name, m.org_role, l.status
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  JOIN organization_licenses l ON l.organization_id = o.id
  WHERE m.user_id = auth.uid() AND m.status = 'active' AND l.status <> 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_license_blocked_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_license_blocked_memberships() TO authenticated;
