-- Patient Information page reads the organization directory associations
-- directly, without copying provider records into a second patient
-- master or overwriting manually verified patient contacts.
CREATE FUNCTION public.hcn_get_patient_linked_healthcare_providers(
  p_organization_id uuid,p_patient_id uuid
)
RETURNS TABLE(provider_id uuid,display_name text,specialty text,
  practice_name text,office_phone text,secure_contact_email text,
  office_address text,relationship_note text,verification_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.hcn_is_active_covered_patient(p_organization_id,p_patient_id)
    OR NOT (public.has_patient_access(p_patient_id)
      OR public.is_active_org_director(p_organization_id)
      OR public.is_organization_owner(p_organization_id))
    THEN RAISE EXCEPTION 'Patient directory access denied'; END IF;
  RETURN QUERY
    SELECT d.id,d.display_name,d.specialty,d.practice_name,d.office_phone,
      d.secure_contact_email,d.office_address,a.relationship_note,d.verification_status
    FROM public.hcn_patient_provider_associations a
    JOIN public.hcn_healthcare_providers d ON d.id=a.provider_id AND d.organization_id=a.organization_id
    WHERE a.organization_id=p_organization_id AND a.patient_id=p_patient_id
      AND a.is_active=true AND d.is_active=true
    ORDER BY d.display_name;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_get_patient_linked_healthcare_providers(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_patient_linked_healthcare_providers(uuid,uuid) TO authenticated;
