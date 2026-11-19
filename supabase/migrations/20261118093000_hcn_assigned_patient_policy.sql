-- License financial rows intentionally remain hidden from clinical offices.
-- The private predicate already checks the live assignment, organization,
-- membership, coverage, license and clinical role under its definer boundary.
-- Joining organization_licenses again as the caller incorrectly filtered out
-- valid clinicians whose financial access is denied.
DROP POLICY IF EXISTS "Assigned org staff can view their assigned patients" ON public.patients;
CREATE POLICY "Assigned org staff can view their assigned patients"
ON public.patients FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.staff_patient_assignments a
  WHERE a.user_id=(SELECT auth.uid()) AND a.patient_id=patients.id
    AND a.is_active
    AND hcn_private.current_staff_patient_v1(a.organization_id,a.patient_id,a.org_role)
));
