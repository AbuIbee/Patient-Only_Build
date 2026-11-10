-- HCN-CLINICAL-MASTER-002 release-hardening SEC-006.
-- Block direct client-side clinical approval, metadata mutation,
-- and retention of uploaded-document access after patient assignment revocation.
-- All clinical reviews continue through authenticated, scope-checked SECURITY
-- DEFINER RPCs; service_role may still submit verified external documents.

REVOKE UPDATE, DELETE ON TABLE public.hcn_clinical_documents FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Org directors and owners update clinical documents" ON public.hcn_clinical_documents;
DROP POLICY IF EXISTS "Org directors and owners delete clinical documents" ON public.hcn_clinical_documents;
DROP POLICY IF EXISTS "Org directors and owners insert clinical documents" ON public.hcn_clinical_documents;
DROP POLICY IF EXISTS "Patient-authorized internal users can upload clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Authorized uploader submits unreviewed clinical document"
ON public.hcn_clinical_documents
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND uploader_external_label IS NULL
  AND review_status = 'received_unreviewed'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND review_notes IS NULL
  AND EXISTS (
    SELECT 1 FROM public.covered_patient_memberships c
    JOIN public.organization_licenses l ON l.organization_id = c.organization_id
    WHERE c.patient_id = hcn_clinical_documents.patient_id
      AND c.organization_id = hcn_clinical_documents.organization_id
      AND c.status = 'active'
      AND l.status = 'active'
  )
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
-- SECURITY DEFINER routines retain their privileges for valid administrative
-- review / clinical approval; direct PostgREST PATCH and DELETE do not.

CREATE OR REPLACE FUNCTION public.hcn_can_view_clinical_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v_doc public.hcn_clinical_documents;
BEGIN
  SELECT * INTO v_doc FROM public.hcn_clinical_documents WHERE id = p_document_id;
  IF v_doc.id IS NULL THEN RETURN false; END IF;

  -- Being the uploader is insufficient after assignment/representation loss.
  IF v_doc.uploaded_by = auth.uid()
     AND public.has_patient_access(v_doc.patient_id)
  THEN RETURN true; END IF;

  -- Pending documents must never masquerade as approved caregiver instructions.
  IF v_doc.classification = 'caregiver_approved_instructions'
     AND v_doc.review_status NOT IN ('accepted', 'clinical_approved')
  THEN
    RETURN public.is_active_org_director(v_doc.organization_id)
      OR public.is_organization_owner(v_doc.organization_id)
      OR public.hcn_is_qualified_clinician_for_patient(v_doc.organization_id, v_doc.patient_id);
  END IF;

  IF v_doc.classification IN ('general_care_coordination', 'caregiver_approved_instructions', 'patient_shared_document') THEN
    -- Directors/Owners oversee all currently covered patients of their
    -- organization even without an explicit staff_patient_assignments row.
    RETURN public.has_patient_access(v_doc.patient_id)
      OR (
        (public.is_active_org_director(v_doc.organization_id)
          OR public.is_organization_owner(v_doc.organization_id))
        AND EXISTS (
          SELECT 1 FROM public.covered_patient_memberships c
          JOIN public.organization_licenses l ON l.organization_id = c.organization_id
          WHERE c.organization_id = v_doc.organization_id
            AND c.patient_id = v_doc.patient_id
            AND c.status = 'active'
            AND l.status = 'active'
        )
      );
  END IF;

  IF v_doc.classification = 'restricted_clinical_documentation' THEN
    RETURN public.is_active_org_director(v_doc.organization_id)
      OR public.is_organization_owner(v_doc.organization_id)
      OR public.hcn_is_qualified_clinician_for_patient(v_doc.organization_id, v_doc.patient_id);
  END IF;

  RETURN public.hcn_is_qualified_clinician_for_patient(v_doc.organization_id, v_doc.patient_id)
    AND EXISTS (
      SELECT 1 FROM public.hcn_document_grants g
      WHERE g.document_id = p_document_id
        AND g.grantee_type = 'internal_user'
        AND g.grantee_user_id = auth.uid()
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    );
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_can_view_clinical_document(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_clinical_document(UUID) TO authenticated;
