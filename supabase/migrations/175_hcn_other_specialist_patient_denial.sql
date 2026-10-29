-- Enforce approved clinical roles in both authorization helper and patient SELECT RLS.
-- Other Specialist is a configurable profession category, NOT implicit clinical access.
CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT p_user_id IS NOT NULL AND p_patient_id IS NOT NULL AND
(p_user_id=p_patient_id OR EXISTS (SELECT 1 FROM public.caregiver_patients cp WHERE cp.caregiver_id=p_user_id AND cp.patient_id=p_patient_id)
OR EXISTS (SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role=a.org_role AND m.org_role IN ('caregiver','medical_professional','therapist') JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=p_user_id AND a.patient_id=p_patient_id AND a.is_active=true)
OR EXISTS (SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=p_user_id AND t.patient_id=p_patient_id AND t.is_active=true)

OR EXISTS (SELECT 1 FROM public.patient_representatives r JOIN public.covered_patient_memberships c ON c.organization_id=r.organization_id AND c.patient_id=r.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=r.organization_id AND l.status='active' WHERE r.representative_user_id=p_user_id AND r.patient_id=p_patient_id AND r.status='active'));
$function$;
DROP POLICY IF EXISTS "Assigned org staff can view their assigned patients" ON public.patients;
CREATE POLICY "Assigned org staff can view their assigned patients"
ON public.patients FOR SELECT TO authenticated
USING (EXISTS(
 SELECT 1 FROM public.staff_patient_assignments spa
 JOIN public.organization_memberships m ON m.organization_id=spa.organization_id
   AND m.user_id=spa.user_id AND m.status='active' AND m.org_role=spa.org_role
   AND m.org_role IN ('caregiver','medical_professional','therapist')
 JOIN public.covered_patient_memberships c ON c.organization_id=spa.organization_id
   AND c.patient_id=spa.patient_id AND c.status='active'
 JOIN public.organization_licenses l ON l.organization_id=spa.organization_id AND l.status='active'
 WHERE spa.patient_id=patients.id AND spa.user_id=auth.uid() AND spa.is_active=true
));