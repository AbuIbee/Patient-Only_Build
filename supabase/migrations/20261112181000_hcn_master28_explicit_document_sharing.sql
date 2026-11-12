-- HCN-MASTER-28: internal documents are NOT externally visible until an
-- authorized Director explicitly shares a reviewed, general-coordination file.
ALTER TABLE public.hcn_clinical_request_events
  DROP CONSTRAINT IF EXISTS hcn_clinical_request_events_event_type_check;
ALTER TABLE public.hcn_clinical_request_events
  ADD CONSTRAINT hcn_clinical_request_events_event_type_check CHECK (
    event_type = ANY(ARRAY[
      'created','recipient_selected','send_attempted','send_delivered','send_failed',
      'recipient_verified','request_accessed','document_uploaded','document_shared',
      'response_submitted','administrative_review','clinical_review','revision_requested',
      'cancelled','revoked','reminder_queued','reminder_failed','reminder_sent',
      'completed','closed','document_published_to_patient'
    ])
  );

CREATE OR REPLACE FUNCTION public.hcn_share_clinical_document_with_recipient(p_request_id uuid,p_document_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_req public.hcn_clinical_requests; v_doc public.hcn_clinical_documents;
  v_link public.hcn_clinical_request_documents;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  SELECT * INTO v_req FROM public.hcn_clinical_requests WHERE id=p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR NOT public.is_active_org_director(v_req.organization_id) THEN
    RAISE EXCEPTION 'Only the assigned organization Director may release clinical documents';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_licenses
    WHERE organization_id=v_req.organization_id AND status='active') THEN
    RAISE EXCEPTION 'Inactive license';
  END IF;
  IF v_req.status NOT IN ('sent','response_received','pending_review','pending_clinical_approval','accepted','revision_required') THEN
    RAISE EXCEPTION 'Request must be active before external document sharing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hcn_healthcare_providers p
    JOIN public.hcn_provider_accounts a ON a.provider_id=p.id AND a.organization_id=p.organization_id
      AND a.status='active'
    JOIN public.hcn_patient_provider_associations x
      ON x.organization_id=v_req.organization_id AND x.patient_id=v_req.patient_id
        AND x.provider_id=v_req.provider_id AND x.is_active
    WHERE p.id=v_req.provider_id AND p.organization_id=v_req.organization_id
      AND p.is_active AND p.verification_status='verified'
  ) THEN RAISE EXCEPTION 'Recipient must be an approved provider for this patient'; END IF;
  SELECT * INTO v_doc FROM public.hcn_clinical_documents WHERE id=p_document_id FOR UPDATE;
  IF v_doc.id IS NULL OR v_doc.organization_id<>v_req.organization_id OR v_doc.patient_id<>v_req.patient_id THEN
    RAISE EXCEPTION 'Document and request must belong to the same patient and organization';
  END IF;
  IF v_doc.is_archived OR v_doc.classification<>'general_care_coordination'
    OR v_doc.review_status NOT IN ('accepted','clinical_approved') THEN
    RAISE EXCEPTION 'Only reviewed general-coordination documents can be shared';
  END IF;
  SELECT * INTO v_link FROM public.hcn_clinical_request_documents
    WHERE request_id=v_req.id AND document_id=v_doc.id FOR UPDATE;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Upload and attach this document internally first'; END IF;
  IF v_link.direction='shared_with_recipient' THEN RETURN v_link.id; END IF;
  IF v_link.direction<>'uploaded_by_care_team' THEN RAISE EXCEPTION 'Cannot re-share a provider-uploaded document'; END IF;

  -- The link table has UNIQUE(request_id,document_id), so promote the
  -- existing internal association atomically instead of inserting a duplicate.
  UPDATE public.hcn_clinical_request_documents
    SET direction='shared_with_recipient' WHERE id=v_link.id;
  INSERT INTO public.hcn_clinical_request_events(
    request_id,event_type,actor_user_id,details
  ) VALUES (v_req.id,'document_shared',auth.uid(),
    jsonb_build_object('document_id',v_doc.id,'classification',v_doc.classification));
  RETURN v_link.id;
END $$;
REVOKE ALL ON FUNCTION public.hcn_share_clinical_document_with_recipient(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_share_clinical_document_with_recipient(uuid,uuid) TO authenticated;
