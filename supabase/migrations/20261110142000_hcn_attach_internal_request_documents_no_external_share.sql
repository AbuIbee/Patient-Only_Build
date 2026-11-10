-- Explicitly distinguish care-team upload from documents deliberately
-- shared with the outside recipient. Uploading a document to a Director
-- request must never automatically grant an external provider access.
ALTER TABLE public.hcn_clinical_request_documents
  DROP CONSTRAINT IF EXISTS hcn_clinical_request_documents_direction_check;
ALTER TABLE public.hcn_clinical_request_documents
  ADD CONSTRAINT hcn_clinical_request_documents_direction_check
  CHECK (direction IN ('shared_with_recipient','received_from_recipient','uploaded_by_care_team'));

CREATE FUNCTION public.hcn_attach_internal_document_to_request(p_request_id uuid,p_document_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_request public.hcn_clinical_requests; v_document public.hcn_clinical_documents;
BEGIN
  SELECT * INTO v_request FROM public.hcn_clinical_requests WHERE id=p_request_id;
  SELECT * INTO v_document FROM public.hcn_clinical_documents WHERE id=p_document_id;
  IF auth.uid() IS NULL OR v_request.id IS NULL OR v_document.id IS NULL
    OR v_request.patient_id<>v_document.patient_id
    OR v_request.organization_id<>v_document.organization_id
    OR NOT public.hcn_is_active_covered_patient(v_request.organization_id,v_request.patient_id)
    OR NOT (public.is_active_org_director(v_request.organization_id)
      OR public.is_organization_owner(v_request.organization_id))
    THEN RAISE EXCEPTION 'Authorized Director and matching request/document required'; END IF;
  IF v_request.status IN ('cancelled','closed','expired')
    THEN RAISE EXCEPTION 'Cannot attach documents to closed requests'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='hcn-clinical-documents'
    AND o.name=v_document.storage_path)
    THEN RAISE EXCEPTION 'Document bytes are not available in private storage'; END IF;
  INSERT INTO public.hcn_clinical_request_documents(request_id,document_id,direction)
    VALUES(p_request_id,p_document_id,'uploaded_by_care_team')
    ON CONFLICT(request_id,document_id) DO NOTHING;
  PERFORM public.hcn_record_request_event(p_request_id,'document_uploaded',auth.uid(),NULL,
    jsonb_build_object('document_id',p_document_id,'direction','uploaded_by_care_team'));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_attach_internal_document_to_request(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_attach_internal_document_to_request(uuid,uuid) TO authenticated;
