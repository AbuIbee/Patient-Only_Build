-- HCN-CARE-MASTER-001 sections 16/21: licensed Director access.
-- Reproduced on staging: suspended, expired and canceled licenses all
-- incorrectly returned true. Preserve membership/coverage boundaries and
-- the separate historical-read helper; require an active license here.
CREATE OR REPLACE FUNCTION public.is_org_director_for_patient(p_user_id uuid, p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT p_user_id IS NOT NULL AND p_patient_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    JOIN public.covered_patient_memberships cpm ON cpm.organization_id=om.organization_id
    JOIN public.organization_licenses ol ON ol.organization_id=om.organization_id AND ol.status='active'
    WHERE om.user_id=p_user_id AND om.org_role='director' AND om.status='active'
      AND cpm.patient_id=p_patient_id AND cpm.status='active'
  );
$function$;
REVOKE ALL ON FUNCTION public.is_org_director_for_patient(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_org_director_for_patient(uuid,uuid) TO authenticated,service_role;
