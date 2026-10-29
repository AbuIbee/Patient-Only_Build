-- HCN P0: existing "not temporary program" policy was PERMISSIVE;
-- OR-combination with other policies could expose every patient to normal users.
-- Preserve legitimate patient/self/staff/director relationships while ensuring
-- no unrelated authenticated account can use a global "NOT temp" allow clause.
DROP POLICY IF EXISTS "Temporary program cannot read patients (REPAIR 008)" ON public.patients;
CREATE POLICY "Temporary program cannot read patients (REPAIR 008)" ON public.patients
AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.caller_is_temp_user_program());

DROP POLICY IF EXISTS "Assigned org staff can view their assigned patients" ON public.patients;
CREATE POLICY "Assigned org staff can view their assigned patients" ON public.patients
FOR SELECT TO authenticated
USING (
 EXISTS(
 SELECT 1 FROM public.staff_patient_assignments spa
 JOIN public.organization_memberships m ON m.organization_id=spa.organization_id AND m.user_id=spa.user_id
    AND m.status='active' AND m.org_role=spa.org_role
 JOIN public.covered_patient_memberships c ON c.organization_id=spa.organization_id AND c.patient_id=spa.patient_id AND c.status='active'
 JOIN public.organization_licenses l ON l.organization_id=spa.organization_id AND l.status='active'
 WHERE spa.patient_id=patients.id AND spa.user_id=auth.uid() AND spa.is_active=true
 ));

DROP POLICY IF EXISTS "Direct-connection therapists can view their patients" ON public.patients;
CREATE POLICY "Direct-connection therapists can view their patients" ON public.patients
FOR SELECT TO authenticated USING(
 EXISTS(
 SELECT 1 FROM public.therapist_relationships tr
 JOIN public.profiles pr ON pr.id=tr.therapist_id AND pr.role='therapist'
 WHERE tr.patient_id=patients.id AND tr.therapist_id=auth.uid() AND tr.is_active=true
 ));
