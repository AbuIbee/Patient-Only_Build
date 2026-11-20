-- Clinical staff are intentionally unable to read organization_licenses
-- because those rows contain billing terms. Do not use a caller-visible
-- license join to authorize their patient chart reads: the private helper
-- evaluates assignment, membership, active coverage and active license
-- inside its definer boundary without exposing financial columns.
DROP POLICY IF EXISTS "Assigned org staff can view their assigned patients" ON public.patients;
CREATE POLICY "Assigned org staff can view their assigned patients"
ON public.patients FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.staff_patient_assignments a
  WHERE a.user_id=(SELECT auth.uid()) AND a.patient_id=patients.id
    AND a.is_active
    AND hcn_private.current_staff_patient_v1(a.organization_id,a.patient_id,a.org_role)
));
