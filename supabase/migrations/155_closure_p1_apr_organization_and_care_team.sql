-- MMA-P1-FINAL-CLOSURE Priority 1 — finish APR Patient Office coverage.
-- The P1-01 remediation (migration 154) explicitly documented three
-- remaining gaps: get_my_enterprise_organization()/get_my_enterprise_
-- care_team() were still auth.uid()-only, and caregiver_patients/
-- therapist_relationships had no has_patient_access()-based (or, for
-- caregiver_patients, ANY patient-self) SELECT policy. Closed here.
--
-- Both RPCs gain an optional p_patient_id (default NULL = auth.uid(),
-- preserving every existing call site's exact current behavior).
-- Authorization is has_patient_access(resolved subject) -- the same
-- centralized helper every other P1 fix in this engagement uses, so an
-- APR, an Owner's self-assigned capability, or ordinary staff/patient
-- access all work identically and uniformly; an arbitrary caller-
-- supplied id that the caller is not authorized for returns an empty
-- result (not an error), matching this function's existing "no rows if
-- not covered" contract rather than introducing a new failure mode.
-- CREATE OR REPLACE does NOT replace a function with a different
-- parameter list -- it would have created a SECOND, overloaded function
-- alongside the old zero-arg one, leaving PostgREST unable to resolve a
-- no-argument RPC call unambiguously (confirmed empirically: HTTP 300
-- "Multiple Choices"). The old zero-arg signatures are dropped first.
DROP FUNCTION IF EXISTS public.get_my_enterprise_organization();
DROP FUNCTION IF EXISTS public.get_my_enterprise_care_team();

CREATE OR REPLACE FUNCTION public.get_my_enterprise_organization(p_patient_id UUID DEFAULT NULL)
RETURNS TABLE(organization_id UUID, organization_name TEXT, package_type TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT o.id, o.name, o.package_type
  FROM organizations o
  JOIN covered_patient_memberships cpm ON cpm.organization_id = o.id
  WHERE cpm.patient_id = COALESCE(p_patient_id, auth.uid())
    AND cpm.status = 'active'
    AND public.has_patient_access(COALESCE(p_patient_id, auth.uid()))
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_my_enterprise_organization(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_enterprise_organization(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_enterprise_care_team(p_patient_id UUID DEFAULT NULL)
RETURNS TABLE(user_id UUID, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, org_role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT p.id, p.first_name, p.last_name, p.email, p.phone, spa.org_role
  FROM staff_patient_assignments spa
  JOIN profiles p ON p.id = spa.user_id
  WHERE spa.patient_id = COALESCE(p_patient_id, auth.uid())
    AND spa.is_active = true
    AND public.has_patient_access(COALESCE(p_patient_id, auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.get_my_enterprise_care_team(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_enterprise_care_team(UUID) TO authenticated, service_role;

-- caregiver_patients had NO patient-self SELECT policy at all (a
-- pre-existing gap unrelated to APR, discovered while fixing this) --
-- only "Caregivers can view their relationships." therapist_
-- relationships already had "Patients can view their own therapist
-- relationships" (patient_id = auth.uid()) but, like every other
-- pre-has_patient_access table, never recognized an APR/Owner grant.
-- One additional permissive policy per table, same pattern as
-- migration 154.
-- `TO authenticated` is NOT optional here (migration 106's own
-- established, hard-learned lesson, re-discovered and re-applied this
-- time via a real regression this session caught and fixed before
-- pushing): without it, a policy defaults to PUBLIC/all roles, and
-- Postgres evaluates it for `anon` too -- even indirectly, as a
-- subquery inside a DIFFERENT table's own RLS policy (e.g. patients'
-- "Caregivers can view their patients" policy subqueries
-- caregiver_patients). anon has no EXECUTE grant on has_patient_access,
-- so an anon caller touching ANY table that subqueries caregiver_
-- patients/therapist_relationships would hit a hard 42501 permission
-- error instead of the correct empty/false result -- confirmed
-- reproduced this session via round7MasterCorrectiveSecurity.test.ts's
-- own regression guard before being fixed here.
DO $$ BEGIN
  CREATE POLICY "has_patient_access covers caregiver_patients (closure, migration 155)"
    ON caregiver_patients FOR SELECT TO authenticated
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "has_patient_access covers therapist_relationships (closure, migration 155)"
    ON therapist_relationships FOR SELECT TO authenticated
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
