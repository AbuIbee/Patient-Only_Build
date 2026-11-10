-- SEC-006/007: INSERT ... RETURNING must authorize the row values that
-- PostgREST is returning, not look up the row by id in a second query.
-- RLS using hcn_can_view_clinical_document(id) internally SELECTed this
-- same table, and so rejected legitimate first-time INSERTs with 42501
-- even after marking that helper VOLATILE.
--
-- Define one tenant/role/classification decision over ACTUAL row fields.
-- Table RLS uses those fields directly; Storage access calls the
-- metadata-to-fields wrapper, so they share one access matrix.
CREATE FUNCTION public.hcn_can_access_clinical_document_fields(
  p_document_id uuid, p_org uuid, p_patient uuid,
  p_classification text, p_review_status text, p_is_archived boolean,
  p_uploaded_by uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' STABLE AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.hcn_is_active_covered_patient(p_org,p_patient)
    THEN RETURN false; END IF;

  -- Administrative acceptance is not clinical approval. Prevent all
  -- Caregiver/Patient access to unreleased or archived instruction content.
  -- Also applies to its original uploader (no uploader shortcut).
  IF p_classification='caregiver_approved_instructions'
    AND (p_review_status IS DISTINCT FROM 'clinical_approved' OR p_is_archived)
  THEN
    RETURN public.is_active_org_director(p_org)
      OR public.is_organization_owner(p_org)
      OR public.hcn_is_qualified_clinician_for_patient(p_org,p_patient);
  END IF;

  IF p_uploaded_by=auth.uid()
    AND public.hcn_has_current_org_patient_access(p_org,p_patient)
  THEN RETURN true; END IF;

  IF p_classification IN (
    'general_care_coordination','caregiver_approved_instructions','patient_shared_document'
  ) THEN
    RETURN public.hcn_has_current_org_patient_access(p_org,p_patient);
  END IF;

  IF p_classification='restricted_clinical_documentation' THEN
    RETURN public.is_active_org_director(p_org)
      OR public.is_organization_owner(p_org)
      OR public.hcn_is_qualified_clinician_for_patient(p_org,p_patient);
  END IF;

  -- Explicit per-document grant + clinical qualification, independently
  -- of generic patient access or organization Director status.
  IF p_classification='specially_protected_documentation' THEN
    RETURN public.hcn_is_qualified_clinician_for_patient(p_org,p_patient)
      AND EXISTS (
        SELECT 1 FROM public.hcn_document_grants g
        WHERE g.document_id=p_document_id AND g.grantee_type='internal_user'
          AND g.grantee_user_id=auth.uid() AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR g.expires_at>now())
      );
  END IF;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_can_access_clinical_document_fields(
  uuid,uuid,uuid,text,text,boolean,uuid
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_access_clinical_document_fields(
  uuid,uuid,uuid,text,text,boolean,uuid
) TO authenticated;

-- Inline row fields into RLS. This is the material difference for
-- successful POST /rest/v1/hcn_clinical_documents Prefer:return=representation.
DROP POLICY IF EXISTS "Classification-aware clinical document visibility"
  ON public.hcn_clinical_documents;
CREATE POLICY "Classification-aware clinical document visibility"
  ON public.hcn_clinical_documents FOR SELECT TO authenticated
  USING (public.hcn_can_access_clinical_document_fields(
    id,organization_id,patient_id,classification,review_status,is_archived,uploaded_by
  ));

CREATE OR REPLACE FUNCTION public.hcn_can_view_clinical_document(p_document_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' VOLATILE AS $$
DECLARE d public.hcn_clinical_documents;
BEGIN
  SELECT * INTO d FROM public.hcn_clinical_documents WHERE id=p_document_id;
  IF d.id IS NULL THEN RETURN false; END IF;
  RETURN public.hcn_can_access_clinical_document_fields(
    d.id,d.organization_id,d.patient_id,d.classification,
    d.review_status,d.is_archived,d.uploaded_by
  );
END; $$;
REVOKE ALL ON FUNCTION public.hcn_can_view_clinical_document(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_clinical_document(uuid) TO authenticated;
