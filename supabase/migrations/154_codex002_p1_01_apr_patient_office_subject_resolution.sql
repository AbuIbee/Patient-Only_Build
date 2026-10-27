-- MMA-P1-CODEX-002 P1-01 — "APR Patient Office access." Independent
-- Codex audit, reproduced exactly: real APR login at
-- /Professional/Patient renders "Organization access required";
-- is_my_enterprise_coverage_active() (keyed on auth.uid() = the
-- REPRESENTATIVE's own id) is false for the representative; a seeded
-- patient medication is invisible despite has_patient_access=true.
--
-- ROOT CAUSE, confirmed by reading the actual frontend source: every
-- Patient Office entry point and data fetch in this repository resolves
-- "which patient" purely from the caller's OWN auth.uid() (`state.
-- currentUser?.id`) -- correct for an ordinary patient (subject ==
-- actor) but structurally wrong for an APR, whose own auth.uid() is the
-- REPRESENTATIVE's identity, never a patients(id) row at all. The
-- database-side authorization (migration 145's is_authorized_for_patient
-- OR-branch) was already correct; nothing upstream of it ever asked "who
-- do I represent" in the first place.
--
-- FIX (this migration, database layer only -- frontend wiring is a
-- separate commit): a single, authoritative subject-resolution RPC.
-- Deliberately NOT a change to is_my_enterprise_coverage_active() itself
-- -- that function's existing meaning ("am I personally a covered
-- patient") is relied on elsewhere (SubscriptionContext.tsx's Full
-- Support plan label) and must not start returning true for a
-- representative, who has no personal subscription at all.
CREATE OR REPLACE FUNCTION public.get_my_patient_office_subject()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_rep_patient UUID;
BEGIN
  IF public.is_my_enterprise_coverage_active() THEN
    RETURN auth.uid();
  END IF;

  SELECT r.patient_id INTO v_rep_patient
  FROM patient_representatives r
  JOIN covered_patient_memberships c ON c.organization_id = r.organization_id AND c.patient_id = r.patient_id AND c.status = 'active'
  JOIN organization_licenses l ON l.organization_id = r.organization_id AND l.status = 'active'
  WHERE r.representative_user_id = auth.uid() AND r.status = 'active'
  LIMIT 1;

  RETURN v_rep_patient;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_patient_office_subject() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_patient_office_subject() TO authenticated, service_role;

-- is_my_enterprise_coverage_active() only ever checks "am I personally
-- covered" -- it was never wired to recognize an APR either, which is
-- exactly why ProfessionalOfficeResolver.tsx's gate denied the
-- representative access to the Patient Office in the first place. A
-- second, parallel helper for the resolver's specific gating question
-- ("should the Patient Office render for this session AT ALL, whether
-- as patient or as representative") -- kept separate from
-- is_my_enterprise_coverage_active() for the same reason as above.
CREATE OR REPLACE FUNCTION public.my_patient_office_access_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.get_my_patient_office_subject() IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.my_patient_office_access_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_patient_office_access_active() TO authenticated, service_role;

-- ── Close the SECOND half of the reproduction: real data invisibility ──
-- medications/appointments/caregiver_visits/tasks predate
-- has_patient_access() (migration 070) and carry their own independent,
-- ad-hoc per-source SELECT policies (patient-self, caregiver-via-
-- caregiver_patients, org-staff-via-staff_patient_assignments,
-- direct-therapist) -- none of which recognize an APR, an Organization
-- Owner's self-assigned capability, or (for medications) even the
-- already-corrected migration-142 staff path. Adding ONE additional
-- PERMISSIVE policy per table using the centralized, already-correct
-- has_patient_access() helper closes the APR gap (and these three
-- latent gaps) uniformly without touching any existing policy -- RLS
-- permissive policies are OR'd together, so every existing legitimate
-- access path keeps working unchanged.
DO $$ BEGIN
  CREATE POLICY "has_patient_access covers medications (APR/Owner/staff, migration 154)"
    ON medications FOR SELECT
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "has_patient_access covers appointments (APR/Owner/staff, migration 154)"
    ON appointments FOR SELECT
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "has_patient_access covers caregiver_visits (APR/Owner/staff, migration 154)"
    ON caregiver_visits FOR SELECT
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "has_patient_access covers tasks (APR/Owner/staff, migration 154)"
    ON tasks FOR SELECT
    USING (public.has_patient_access(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
