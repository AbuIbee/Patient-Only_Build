-- FIVE-OFFICE ENTERPRISE PLATFORM — Office E (Enterprise Patient) backend
-- support. Owner directive: "The Patient Office must use the same shared
-- Enterprise visual system as the Caregiver Office while displaying
-- patient-specific terminology, navigation, information and authorized
-- functionality" for a patient who is actually covered by an Enterprise
-- organization — never for an ordinary individual patient, who continues
-- to see the existing, completely unmodified PatientLayout.
--
-- CONFIRMED PRE-EXISTING GAPS this migration closes, found while
-- inspecting the current patient-self RLS surface before writing any new
-- frontend code (per the owner's own instruction: "inspect the existing
-- PatientLayout.tsx, patient routes, component dependencies and current
-- entitlement logic" first):
--
-- 1. `appointments` has caregiver-based (migration 001) and staff-based
--    (migration 067) SELECT policies, but no patient-self policy — a
--    signed-in patient cannot read their OWN appointments row today,
--    even though EnterprisePatientRecordTabs.tsx already treats this
--    table as the authoritative "Medical Appointments" source for every
--    OTHER viewer. Added here, same minimal `patient_id = auth.uid()`
--    shape already established by migration 004 for medications/tasks/
--    mood_entries/the patients table itself.
-- 2. `caregiver_visits` has caregiver-self and director-org policies
--    (migration 068) but no patient-self policy — a patient cannot see
--    their own scheduled visit times. Same minimal addition.
-- 3. There was no patient-facing way to learn their OWN covering
--    organization's name, or which Enterprise staff are actively
--    assigned to them — `organizations` SELECT requires
--    is_active_org_member() (patients are never org members, they are
--    covered_patient_memberships rows, a deliberately separate concept
--    per migration 035's own design) and `staff_patient_assignments`
--    SELECT only recognizes the STAFF member's own auth.uid(), never the
--    patient's. Two new, narrow SECURITY DEFINER RPCs below —
--    centralizing this exactly the way migration 050's own stated
--    design goal requires ("exactly one place this logic can ever
--    drift") — rather than opening broad new table-level RLS for a
--    patient to read.
--
-- None of this widens what any EXISTING caregiver/staff/director query
-- can see. Every new grant is scoped to `auth.uid()` matching the
-- patient's own id, or to data already proven reachable by that same
-- patient through has_patient_access() (migration 070) for the clinical
-- tables this migration does NOT touch (patient_diagnoses, patient_
-- allergies, patient_care_plans, patient_vitals, patient_care_preferences
-- already include `p_patient_id = auth.uid()` in has_patient_access() —
-- confirmed by reading migration 070 directly — so no new policy was
-- needed there).

DO $$ BEGIN
  CREATE POLICY "Patients can view their own appointments"
    ON appointments FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can view their own scheduled visits"
    ON caregiver_visits FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Returns the calling patient's own covering organization, or no rows if
-- they are not currently covered — reuses is_patient_enterprise_covered()
-- (migration 050) as the single source of truth for "covered," so this
-- can never disagree with is_my_enterprise_coverage_active() (already
-- used by SubscriptionContext.tsx) about whether a patient is Enterprise-
-- connected at all.
CREATE OR REPLACE FUNCTION public.get_my_enterprise_organization()
RETURNS TABLE(organization_id UUID, organization_name TEXT, package_type TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT o.id, o.name, o.package_type
  FROM organizations o
  JOIN covered_patient_memberships cpm ON cpm.organization_id = o.id
  WHERE cpm.patient_id = auth.uid()
    AND cpm.status = 'active'
    AND public.is_patient_enterprise_covered(auth.uid())
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_my_enterprise_organization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_enterprise_organization() TO authenticated;

-- Returns the Enterprise staff currently, actively assigned to the
-- calling patient — the staff_patient_assignments-based team an
-- Enterprise-covered patient needs to see, which the existing
-- PatientCareTeam.tsx's own residential-only query (caregiver_patients +
-- therapist_relationships) never included.
CREATE OR REPLACE FUNCTION public.get_my_enterprise_care_team()
RETURNS TABLE(user_id UUID, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, org_role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT p.id, p.first_name, p.last_name, p.email, p.phone, spa.org_role
  FROM staff_patient_assignments spa
  JOIN profiles p ON p.id = spa.user_id
  WHERE spa.patient_id = auth.uid() AND spa.is_active = true;
$function$;
REVOKE ALL ON FUNCTION public.get_my_enterprise_care_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_enterprise_care_team() TO authenticated;
