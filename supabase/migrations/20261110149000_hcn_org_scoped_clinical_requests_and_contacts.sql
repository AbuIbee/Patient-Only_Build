-- Uniform organization-scoped read policy across Clinical Coordination.
-- A user authorized for patient P in organization A MUST NOT inspect
-- organization B's request, contact, history, or document metadata
-- just because both organizations cover patient P.

DROP POLICY IF EXISTS "Patient-authorized internal users can view associations" ON public.hcn_patient_provider_associations;
CREATE POLICY "Patient-authorized internal users can view associations"
ON public.hcn_patient_provider_associations FOR SELECT TO authenticated
USING (public.hcn_has_current_org_patient_access(organization_id,patient_id));

DROP POLICY IF EXISTS "Patient-authorized internal users can view clinical requests" ON public.hcn_clinical_requests;
CREATE POLICY "Patient-authorized internal users can view clinical requests"
ON public.hcn_clinical_requests FOR SELECT TO authenticated
USING (public.hcn_has_current_org_patient_access(organization_id,patient_id));

DROP POLICY IF EXISTS "Request-authorized internal users can view event history" ON public.hcn_clinical_request_events;
CREATE POLICY "Request-authorized internal users can view event history"
ON public.hcn_clinical_request_events FOR SELECT TO authenticated
USING (EXISTS(
  SELECT 1 FROM public.hcn_clinical_requests r
  WHERE r.id=request_id
    AND public.hcn_has_current_org_patient_access(r.organization_id,r.patient_id)
));

DROP POLICY IF EXISTS "Request-authorized internal users can view request documents" ON public.hcn_clinical_request_documents;
CREATE POLICY "Request-authorized internal users can view request documents"
ON public.hcn_clinical_request_documents FOR SELECT TO authenticated
USING (EXISTS(
  SELECT 1 FROM public.hcn_clinical_requests r
  WHERE r.id=request_id
    AND public.hcn_has_current_org_patient_access(r.organization_id,r.patient_id)
));

DROP POLICY IF EXISTS "Grantee can view their own active document grant" ON public.hcn_document_grants;
CREATE POLICY "Grantee can view their own active document grant"
ON public.hcn_document_grants FOR SELECT TO authenticated
USING (grantee_type='internal_user' AND grantee_user_id=auth.uid()
  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
  AND EXISTS (
    SELECT 1 FROM public.hcn_clinical_documents d
    WHERE d.id=document_id
      AND public.hcn_has_current_org_patient_access(d.organization_id,d.patient_id)
  ));

-- PatientInformation uses this same directory read model; do not
-- duplicate contacts into patient_care_providers or another authority.
CREATE OR REPLACE FUNCTION public.hcn_get_patient_linked_healthcare_providers(
  p_organization_id uuid,p_patient_id uuid
)
RETURNS TABLE(provider_id uuid,display_name text,specialty text,
  practice_name text,office_phone text,secure_contact_email text,
  office_address text,relationship_note text,verification_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
BEGIN
  IF NOT public.hcn_has_current_org_patient_access(p_organization_id,p_patient_id)
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
