-- Provider response review ≠ patient disclosure. SEC-008.
-- Closed/archived documents, unreviewed patient uploads, and
-- external provider responses cannot be exposed by general patient
-- authorization until an explicit Director publish operation.
CREATE OR REPLACE FUNCTION public.hcn_can_access_clinical_document_fields(
  p_document_id uuid, p_org uuid, p_patient uuid,
  p_classification text, p_review_status text, p_is_archived boolean,
  p_uploaded_by uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' STABLE AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.hcn_is_active_covered_patient(p_org,p_patient)
    THEN RETURN false; END IF;

  -- Archive is a Director-only record; no patient, Caregiver or
  -- uploader shortcut is permitted after archiving.
  IF p_is_archived THEN
    RETURN public.is_active_org_director(p_org) OR public.is_organization_owner(p_org);
  END IF;

  -- External-provider documents default to general coordination.
  -- Never silently disclose an unreviewed/accepted provider upload
  -- to the patient or Caregiver. Director/clinical review is not
  -- an authorization to PUBLISH; that must be a separate audited RPC.
  IF p_uploaded_by IS NULL AND p_classification='general_care_coordination' THEN
    RETURN public.is_active_org_director(p_org)
      OR public.is_organization_owner(p_org)
      OR public.hcn_is_qualified_clinician_for_patient(p_org,p_patient);
  END IF;

  -- Patient-uploaded records remain visible to the uploader while
  -- awaiting Director review, but not to all caregivers. External
  -- patient-shared items must be accepted before broader visibility.
  IF p_classification='patient_shared_document'
    AND p_review_status NOT IN ('accepted','clinical_approved') THEN
    RETURN (p_uploaded_by=auth.uid() AND public.hcn_has_current_org_patient_access(p_org,p_patient))
      OR public.is_active_org_director(p_org)
      OR public.is_organization_owner(p_org)
      OR public.hcn_is_qualified_clinician_for_patient(p_org,p_patient);
  END IF;

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

ALTER TABLE public.hcn_clinical_request_events
  DROP CONSTRAINT IF EXISTS hcn_clinical_request_events_event_type_check;
ALTER TABLE public.hcn_clinical_request_events
  ADD CONSTRAINT hcn_clinical_request_events_event_type_check
  CHECK (event_type IN (
    'created','recipient_selected','send_attempted','send_delivered','send_failed',
    'recipient_verified','request_accessed','document_uploaded','response_submitted',
    'administrative_review','clinical_review','revision_requested','cancelled','revoked',
    'reminder_queued','reminder_failed','reminder_sent','completed','closed',
    'document_published_to_patient'
  ));

-- Publish only a genuinely received, administratively accepted (or
-- clinically approved) external document. This changes a classification
-- only after explicit current Director/Owner authorization. It does not
-- create an external provider account, create broad grants, or bypass
-- source request organization/patient binding.
CREATE FUNCTION public.hcn_publish_provider_document_to_patient(p_document_id uuid)
RETURNS public.hcn_clinical_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_doc public.hcn_clinical_documents;
  v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_doc FROM public.hcn_clinical_documents
  WHERE id=p_document_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'No such document'; END IF;
  IF NOT (public.is_active_org_director(v_doc.organization_id)
      OR public.is_organization_owner(v_doc.organization_id))
    THEN RAISE EXCEPTION 'Active Director/Owner authorization required'; END IF;
  IF NOT public.hcn_is_active_covered_patient(v_doc.organization_id,v_doc.patient_id)
    THEN RAISE EXCEPTION 'Patient is not actively covered'; END IF;
  IF v_doc.is_archived OR v_doc.uploader_external_label IS NULL OR
     v_doc.review_status NOT IN ('accepted','clinical_approved')
    THEN RAISE EXCEPTION 'Only reviewed, non-archived external documents may be published'; END IF;
  IF v_doc.classification NOT IN ('general_care_coordination','patient_shared_document')
    THEN RAISE EXCEPTION 'Protected documentation requires a separate disclosure review'; END IF;

  SELECT rd.request_id INTO v_request_id
    FROM public.hcn_clinical_request_documents rd
    JOIN public.hcn_clinical_requests r ON r.id=rd.request_id
    WHERE rd.document_id=p_document_id AND rd.direction='received_from_recipient'
      AND r.organization_id=v_doc.organization_id AND r.patient_id=v_doc.patient_id
    ORDER BY r.created_at DESC LIMIT 1;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Document must originate from a matching external clinical request';
  END IF;
  IF v_doc.classification='patient_shared_document' THEN RETURN v_doc; END IF;

  UPDATE public.hcn_clinical_documents
    SET classification='patient_shared_document',updated_at=now()
    WHERE id=v_doc.id RETURNING * INTO v_doc;
  PERFORM public.hcn_record_request_event(
    v_request_id,'document_published_to_patient',auth.uid(),NULL,
    jsonb_build_object('document_id',v_doc.id));
  RETURN v_doc;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_publish_provider_document_to_patient(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_publish_provider_document_to_patient(uuid) TO authenticated;
