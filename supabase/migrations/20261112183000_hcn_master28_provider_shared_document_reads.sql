-- HCN Master 28: allow only an APPROVED, signed-in provider to access
-- expressly shared, already-reviewed documents for their active patient.
-- Storage signed URLs remain short lived and are generated under caller JWT.
CREATE OR REPLACE FUNCTION public.hcn_provider_can_download_shared_document(p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.hcn_clinical_documents d
      JOIN public.hcn_clinical_request_documents rd ON rd.document_id=d.id
        AND rd.direction='shared_with_recipient'
      JOIN public.hcn_clinical_requests r ON r.id=rd.request_id
        AND r.organization_id=d.organization_id AND r.patient_id=d.patient_id
        AND r.status NOT IN ('draft','send_pending','cancelled','expired')
      JOIN public.hcn_provider_accounts a ON a.provider_id=r.provider_id
        AND a.organization_id=r.organization_id
        AND a.status='active' AND a.user_id=(SELECT auth.uid())
      JOIN public.hcn_healthcare_providers p ON p.id=a.provider_id
        AND p.is_active=true AND p.verification_status='verified'
      JOIN public.hcn_patient_provider_associations x ON x.provider_id=r.provider_id
        AND x.patient_id=r.patient_id AND x.organization_id=r.organization_id AND x.is_active
      JOIN public.covered_patient_memberships c ON c.patient_id=r.patient_id
        AND c.organization_id=r.organization_id AND c.status='active'
      JOIN public.organization_licenses l ON l.organization_id=r.organization_id AND l.status='active'
      WHERE d.id=p_document_id AND NOT d.is_archived
        AND d.classification='general_care_coordination'
        AND d.review_status IN ('accepted','clinical_approved')
    );
$$;
REVOKE ALL ON FUNCTION public.hcn_provider_can_download_shared_document(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_provider_can_download_shared_document(uuid) TO authenticated;

DROP POLICY IF EXISTS "HCN approved provider reads explicitly shared clinical objects" ON storage.objects;
CREATE POLICY "HCN approved provider reads explicitly shared clinical objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='hcn-clinical-documents' AND
    EXISTS (
      SELECT 1 FROM public.hcn_clinical_documents d
      WHERE d.storage_path=storage.objects.name
        AND public.hcn_provider_can_download_shared_document(d.id)
    )
  );

CREATE OR REPLACE FUNCTION public.hcn_list_provider_shared_documents(p_thread_id uuid)
RETURNS TABLE(document_id uuid,filename text,storage_path text,shared_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_thread public.hcn_provider_threads;
BEGIN
  SELECT * INTO v_thread FROM public.hcn_provider_threads WHERE id=p_thread_id;
  IF v_thread.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hcn_provider_accounts a
    WHERE a.provider_id=v_thread.provider_id AND a.organization_id=v_thread.organization_id
      AND a.user_id=auth.uid() AND a.status='active'
  ) OR NOT public.hcn_can_access_provider_thread(p_thread_id) THEN
    RAISE EXCEPTION 'Provider is not authorized to view this document list';
  END IF;
  RETURN QUERY
    SELECT DISTINCT d.id,d.original_filename,d.storage_path,rd.created_at
    FROM public.hcn_clinical_requests r
    JOIN public.hcn_clinical_request_documents rd
      ON rd.request_id=r.id AND rd.direction='shared_with_recipient'
    JOIN public.hcn_clinical_documents d ON d.id=rd.document_id
    WHERE r.organization_id=v_thread.organization_id
      AND r.patient_id=v_thread.patient_id
      AND r.provider_id=v_thread.provider_id
      AND public.hcn_provider_can_download_shared_document(d.id)
    ORDER BY rd.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.hcn_list_provider_shared_documents(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_list_provider_shared_documents(uuid) TO authenticated;