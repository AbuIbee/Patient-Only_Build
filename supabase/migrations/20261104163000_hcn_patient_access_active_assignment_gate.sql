-- HCN 2026-11-04: staff patient roster cannot disclose data through a
-- stale assignment when membership, license, or coverage has been revoked.
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
 RETURNS TABLE(organization_id uuid,organization_name text,patient_id uuid,
  first_name text,last_name text,preferred_name text,org_role text,
  address text,location text,assignment_id uuid,display_label text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT spa.organization_id,o.name,p.id,p.first_name,p.last_name,
         p.preferred_name,spa.org_role,p.address,p.location,spa.id,spa.display_label
  FROM public.staff_patient_assignments spa
  JOIN public.organizations o ON o.id=spa.organization_id
  JOIN public.patients p ON p.id=spa.patient_id
  JOIN public.organization_memberships m
    ON m.organization_id=spa.organization_id AND m.user_id=spa.user_id
      AND m.org_role=spa.org_role AND m.status='active'
  JOIN public.organization_licenses l
    ON l.organization_id=spa.organization_id AND l.status='active'
      AND l.license_number IS NOT NULL
  JOIN public.covered_patient_memberships c
    ON c.organization_id=spa.organization_id AND c.patient_id=spa.patient_id
      AND c.status='active'
  WHERE spa.user_id=auth.uid() AND spa.is_active=true

  UNION

  SELECT NULL::uuid,'Direct Patient Connection',p.id,p.first_name,
         p.last_name,p.preferred_name,'therapist',p.address,p.location,
         NULL::uuid,NULL::text
  FROM public.therapist_relationships tr
  JOIN public.patients p ON p.id=tr.patient_id
  WHERE tr.therapist_id=auth.uid() AND tr.is_active=true;
$$;

DROP POLICY IF EXISTS "Assigned org staff can view their assigned patients" ON public.patients;
CREATE POLICY "Assigned org staff can view their assigned patients"
ON public.patients FOR SELECT TO authenticated
USING (EXISTS(
 SELECT 1 FROM public.staff_patient_assignments spa
 JOIN public.organization_memberships m
   ON m.organization_id=spa.organization_id AND m.user_id=spa.user_id
     AND m.org_role=spa.org_role AND m.status='active'
 JOIN public.covered_patient_memberships c
   ON c.organization_id=spa.organization_id AND c.patient_id=spa.patient_id
     AND c.status='active'
 JOIN public.organization_licenses l
   ON l.organization_id=spa.organization_id AND l.status='active'
     AND l.license_number IS NOT NULL
 WHERE spa.user_id=(select auth.uid()) AND spa.patient_id=patients.id
   AND spa.is_active=true
));

DROP POLICY IF EXISTS "Assigned staff can see their patient's coverage record" ON public.covered_patient_memberships;
CREATE POLICY "Assigned staff can see their patient's coverage record"
ON public.covered_patient_memberships FOR SELECT TO authenticated
USING (EXISTS(
 SELECT 1 FROM public.staff_patient_assignments spa
 JOIN public.organization_memberships m
   ON m.organization_id=spa.organization_id AND m.user_id=spa.user_id
     AND m.org_role=spa.org_role AND m.status='active'
 JOIN public.organization_licenses l
   ON l.organization_id=spa.organization_id AND l.status='active'
     AND l.license_number IS NOT NULL
 WHERE spa.organization_id=covered_patient_memberships.organization_id
   AND spa.patient_id=covered_patient_memberships.patient_id
   AND covered_patient_memberships.status='active'
   AND spa.user_id=(select auth.uid()) AND spa.is_active=true
));
