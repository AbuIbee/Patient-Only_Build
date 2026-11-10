-- HCN Clinical Coordination SEC-006 stabilization.
-- A direct RLS subquery on covered_patient_memberships can return 403
-- to a Director whose direct SELECT privilege/policy is limited, even
-- when their own organization genuinely covers the patient.
-- Keep the membership oracle server-owned; the caller never passes a
-- status or organization entitlement assertion.
CREATE OR REPLACE FUNCTION public.hcn_is_active_covered_patient(p_org UUID, p_patient UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_org IS NOT NULL AND p_patient IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.covered_patient_memberships c
    JOIN public.organization_licenses l ON l.organization_id = c.organization_id
    WHERE c.organization_id = p_org AND c.patient_id = p_patient
      AND c.status = 'active' AND l.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.hcn_is_active_covered_patient(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_is_active_covered_patient(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Authorized uploader submits unreviewed clinical document" ON public.hcn_clinical_documents;
CREATE POLICY "Authorized uploader submits unreviewed clinical document"
ON public.hcn_clinical_documents FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND uploader_external_label IS NULL
  AND review_status = 'received_unreviewed'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND review_notes IS NULL
  AND public.hcn_is_active_covered_patient(organization_id, patient_id)
  AND (
    public.has_patient_access(patient_id)
    OR public.is_active_org_director(organization_id)
    OR public.is_organization_owner(organization_id)
  )
  AND (
    classification IN ('general_care_coordination', 'patient_shared_document')
    OR public.is_active_org_director(organization_id)
    OR public.is_organization_owner(organization_id)
    OR public.hcn_is_qualified_clinician_for_patient(organization_id, patient_id)
  )
);

-- The client cannot directly DELETE documents (deliberately revoked in
-- SEC-006). Provide one narrow compensating action ONLY for metadata
-- with no corresponding stored object. Never delete a real uploaded
-- document, reviewed document, linked request, or shared document.
CREATE OR REPLACE FUNCTION public.hcn_discard_unstored_clinical_document(p_document_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.hcn_clinical_documents;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM public.hcn_clinical_documents WHERE id = p_document_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN false; END IF;
  IF v_row.uploaded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not the document uploader'; END IF;
  IF v_row.review_status <> 'received_unreviewed' OR v_row.reviewed_by IS NOT NULL THEN
    RAISE EXCEPTION 'Reviewed document cannot be discarded';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects o
             WHERE o.bucket_id = 'hcn-clinical-documents' AND o.name = v_row.storage_path)
    OR EXISTS (SELECT 1 FROM public.hcn_clinical_request_documents d WHERE d.document_id = p_document_id)
    OR EXISTS (SELECT 1 FROM public.hcn_document_grants g WHERE g.document_id = p_document_id)
  THEN RAISE EXCEPTION 'Document is stored or shared; cannot discard'; END IF;
  DELETE FROM public.hcn_clinical_documents WHERE id = p_document_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_discard_unstored_clinical_document(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_discard_unstored_clinical_document(UUID) TO authenticated;
