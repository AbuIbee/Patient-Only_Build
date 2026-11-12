-- HCN-MASTER-28: verified provider -> Director document upload for a patient-
-- scoped conversation. No direct client insert permissions into clinical tables.
-- A file is visible to the Director only after Storage upload finalization.
CREATE TABLE IF NOT EXISTS public.hcn_provider_thread_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.hcn_provider_threads(id) ON DELETE CASCADE,
  document_id uuid NOT NULL UNIQUE REFERENCES public.hcn_clinical_documents(id) ON DELETE CASCADE,
  upload_state text NOT NULL DEFAULT 'pending' CHECK(upload_state IN ('pending','ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_hcn_provider_thread_documents_thread
  ON public.hcn_provider_thread_documents(thread_id,created_at);
ALTER TABLE public.hcn_provider_thread_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_provider_thread_documents FROM PUBLIC,anon;
GRANT SELECT ON public.hcn_provider_thread_documents TO authenticated;
CREATE POLICY "Only active conversation participants can read thread document associations"
  ON public.hcn_provider_thread_documents FOR SELECT TO authenticated
  USING(public.hcn_can_access_provider_thread(thread_id) AND upload_state='ready');

CREATE OR REPLACE FUNCTION public.hcn_is_authenticated_provider_for_thread(p_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT public.hcn_can_access_provider_thread(p_thread)
    AND EXISTS(
      SELECT 1 FROM public.hcn_provider_threads t
      JOIN public.hcn_provider_accounts a ON a.provider_id=t.provider_id
        AND a.organization_id=t.organization_id AND a.status='active'
      WHERE t.id=p_thread AND a.user_id=(SELECT auth.uid())
    );
$$;
REVOKE ALL ON FUNCTION public.hcn_is_authenticated_provider_for_thread(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_is_authenticated_provider_for_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_prepare_provider_document_upload(
  p_thread_id uuid, p_document_id uuid, p_filename text,
  p_mime_type text, p_file_size bigint, p_category text, p_sha256 text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_thread public.hcn_provider_threads;v_path text;v_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hcn_is_authenticated_provider_for_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Only this verified patient provider may upload to this clinical conversation';
  END IF;
  IF p_document_id IS NULL THEN RAISE EXCEPTION 'Document identifier is required'; END IF;
  IF char_length(btrim(coalesce(p_filename,''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Filename must be 1 to 200 characters';
  END IF;
  IF p_file_size IS NULL OR p_file_size NOT BETWEEN 1 AND 26214400 THEN
    RAISE EXCEPTION 'Clinical attachments must be between 1 byte and 25 MiB';
  END IF;
  IF p_mime_type NOT IN (
    'application/pdf','image/jpeg','image/png','image/webp','text/plain',
    'text/csv','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) THEN RAISE EXCEPTION 'Unsupported clinical document type'; END IF;
  IF p_category NOT IN (
    'medical_records','therapy_reports','medication_lists','discharge_documents',
    'care_instructions','referral_documents','specialist_assessments',
    'patient_provided_documents','administrative_coordination','other_clinical_attachment'
  ) THEN RAISE EXCEPTION 'Unsupported document category'; END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Valid SHA-256 digest required'; END IF;
  SELECT * INTO v_thread FROM public.hcn_provider_threads WHERE id=p_thread_id;
  v_name:=regexp_replace(p_filename,'[^A-Za-z0-9._-]','_','g');
  v_path:=v_thread.patient_id::text || '/provider-' || p_document_id::text || '_' || v_name;
  INSERT INTO public.hcn_clinical_documents(
    id,organization_id,patient_id,category,classification,storage_path,
    original_filename,mime_type,file_size_bytes,checksum_sha256,uploaded_by,
    review_status,is_archived
  ) VALUES (
    p_document_id,v_thread.organization_id,v_thread.patient_id,p_category,
    'general_care_coordination',v_path,p_filename,p_mime_type,p_file_size,
    p_sha256,auth.uid(),'received_unreviewed',false
  );
  INSERT INTO public.hcn_provider_thread_documents(thread_id,document_id,upload_state)
  VALUES(p_thread_id,p_document_id,'pending');
  RETURN v_path;
END $$;
REVOKE ALL ON FUNCTION public.hcn_prepare_provider_document_upload(uuid,uuid,text,text,bigint,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_prepare_provider_document_upload(uuid,uuid,text,text,bigint,text,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_finalize_provider_document_upload(p_thread_id uuid,p_document_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_link public.hcn_provider_thread_documents;v_doc public.hcn_clinical_documents;
BEGIN
  IF NOT public.hcn_is_authenticated_provider_for_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Provider access to this clinical conversation has been revoked';
  END IF;
  SELECT * INTO v_link FROM public.hcn_provider_thread_documents
  WHERE thread_id=p_thread_id AND document_id=p_document_id FOR UPDATE;
  SELECT * INTO v_doc FROM public.hcn_clinical_documents
  WHERE id=p_document_id AND uploaded_by=auth.uid();
  IF v_link.id IS NULL OR v_doc.id IS NULL THEN RAISE EXCEPTION 'No matching upload'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='hcn-clinical-documents'
      AND o.name=v_doc.storage_path
  ) THEN RAISE EXCEPTION 'File has not been received by secure storage'; END IF;
  UPDATE public.hcn_provider_thread_documents SET upload_state='ready',
    finalized_at=coalesce(finalized_at,now()) WHERE id=v_link.id;
  RETURN p_document_id;
END $$;
REVOKE ALL ON FUNCTION public.hcn_finalize_provider_document_upload(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_finalize_provider_document_upload(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_abort_provider_document_upload(p_thread_id uuid,p_document_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_doc public.hcn_clinical_documents;
BEGIN
  IF NOT public.hcn_is_authenticated_provider_for_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Provider authorization required';
  END IF;
  SELECT d.* INTO v_doc FROM public.hcn_clinical_documents d
    JOIN public.hcn_provider_thread_documents td ON td.document_id=d.id
  WHERE td.thread_id=p_thread_id AND td.document_id=p_document_id
    AND td.upload_state='pending' AND d.uploaded_by=auth.uid() FOR UPDATE OF d;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'No pending upload'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='hcn-clinical-documents'
    AND name=v_doc.storage_path) THEN RAISE EXCEPTION 'File exists; finalize rather than abort'; END IF;
  DELETE FROM public.hcn_provider_thread_documents WHERE document_id=p_document_id;
  DELETE FROM public.hcn_clinical_documents WHERE id=p_document_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.hcn_abort_provider_document_upload(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_abort_provider_document_upload(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hcn_list_provider_thread_documents(p_thread_id uuid)
RETURNS TABLE(
  document_id uuid,original_filename text,storage_path text,
  review_status text,created_at timestamptz,uploaded_by uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NOT public.hcn_can_access_provider_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Not authorized for this clinical document list';
  END IF;
  RETURN QUERY SELECT d.id,d.original_filename,d.storage_path,d.review_status,d.created_at,d.uploaded_by
  FROM public.hcn_provider_thread_documents td
  JOIN public.hcn_clinical_documents d ON d.id=td.document_id
  WHERE td.thread_id=p_thread_id AND td.upload_state='ready'
  ORDER BY d.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.hcn_list_provider_thread_documents(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_provider_thread_documents(uuid) TO authenticated;


-- Storage INSERT checks hcn_clinical_documents through caller RLS;
-- permit ONLY the active verified provider's own documented upload metadata.
CREATE POLICY "Verified provider reads own patient-scoped uploaded metadata"
  ON public.hcn_clinical_documents FOR SELECT TO authenticated
  USING (
    uploaded_by=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.hcn_provider_thread_documents td
      WHERE td.document_id=id
        AND public.hcn_is_authenticated_provider_for_thread(td.thread_id)
    )
  );

CREATE POLICY "Verified provider downloads own finalized clinical upload"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='hcn-clinical-documents'
    AND EXISTS (
      SELECT 1 FROM public.hcn_clinical_documents d
      JOIN public.hcn_provider_thread_documents td ON td.document_id=d.id
      WHERE d.storage_path=storage.objects.name
        AND d.uploaded_by=(SELECT auth.uid())
        AND td.upload_state='ready'
        AND public.hcn_is_authenticated_provider_for_thread(td.thread_id)
    )
  );
