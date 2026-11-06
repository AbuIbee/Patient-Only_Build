-- Preserve migration 106's private arbitrary-user authorization boundary.
-- RLS callers get a current-actor wrapper, never the two-user helper.
REVOKE ALL ON FUNCTION public.is_org_director_for_patient(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_director_for_patient(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_current_director_for_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.is_org_director_for_patient(auth.uid(),p_patient_id);
$function$;
REVOKE ALL ON FUNCTION public.hcn_current_director_for_patient(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_current_director_for_patient(uuid) TO authenticated,service_role;

ALTER POLICY "HCN active directors read patient healthcare contacts"
ON public.patient_care_providers TO authenticated
USING (public.hcn_current_director_for_patient(patient_id));
ALTER POLICY "HCN patient contacts history authorized read"
ON public.hcn_patient_contact_history TO authenticated
USING (public.has_patient_access(patient_id) OR public.hcn_current_director_for_patient(patient_id));
