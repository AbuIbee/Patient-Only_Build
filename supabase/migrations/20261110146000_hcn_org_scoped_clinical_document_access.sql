-- HCN-CLINICAL-MASTER-002: tenant-correct patient authorization.
-- has_patient_access(patient_id) is a valid legacy shared-patient helper,
-- but it does not identify the organization. A user assigned to the same
-- patient in organization A must not see organization B's documents.
CREATE FUNCTION public.hcn_has_current_org_patient_access(p_org uuid,p_patient uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.hcn_is_active_covered_patient(p_org,p_patient)
    AND (
      auth.uid()=p_patient
      OR public.is_active_org_director(p_org)
      OR public.is_organization_owner(p_org)
      OR EXISTS (
        SELECT 1 FROM public.staff_patient_assignments a
        JOIN public.organization_memberships m
          ON m.organization_id=a.organization_id AND m.user_id=a.user_id
          AND m.status='active' AND m.org_role=a.org_role
        WHERE a.organization_id=p_org AND a.patient_id=p_patient
          AND a.user_id=auth.uid() AND a.is_active=true
      )
      OR EXISTS (
        SELECT 1 FROM public.patient_representatives r
        WHERE r.organization_id=p_org AND r.patient_id=p_patient
          AND r.representative_user_id=auth.uid() AND r.status='active'
      )
      OR EXISTS (
        SELECT 1 FROM public.organization_owner_capability_grants g
        WHERE g.organization_id=p_org AND g.user_id=auth.uid()
          AND g.capability IN ('caregiver','medical_professional','therapist')
          AND g.status='active'
      )
    );
$$;
REVOKE ALL ON FUNCTION public.hcn_has_current_org_patient_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_has_current_org_patient_access(uuid,uuid) TO authenticated;

-- A Director's upload, a patient-representative upload, and a
-- patient-assigned Caregiver upload are scoped to the documented org.
-- All of SEC-006's review/status/author checks remain mandatory.
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
  AND public.hcn_has_current_org_patient_access(organization_id,patient_id)
  AND (
    classification IN ('general_care_coordination','patient_shared_document')
    OR public.is_active_org_director(organization_id)
    OR public.is_organization_owner(organization_id)
    OR public.hcn_is_qualified_clinician_for_patient(organization_id,patient_id)
  )
);

-- The original function's own row lookup is VOLATILE to preserve
-- PostgREST INSERT ... RETURNING visibility (SEC-006). It cannot
-- accidentally recognize a different organization's authorization.
CREATE OR REPLACE FUNCTION public.hcn_can_view_clinical_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' VOLATILE AS $
DECLARE v_doc public.hcn_clinical_documents;
BEGIN
  SELECT * INTO v_doc FROM public.hcn_clinical_documents WHERE id = p_document_id;
  IF v_doc.id IS NULL THEN RETURN false; END IF;
  -- Cross-organization access to the same patient is not permission to
  -- open this organization's document. License and coverage must be active.
  IF NOT public.hcn_is_active_covered_patient(v_doc.organization_id,v_doc.patient_id) THEN
    RETURN false;
  END IF;

  -- Being the uploader is insufficient after assignment/representation loss.
  IF v_doc.uploaded_by = auth.uid()
     AND public.hcn_has_current_org_patient_access(v_doc.organization_id, v_doc.patient_id)
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
    RETURN public.hcn_has_current_org_patient_access(v_doc.organization_id, v_doc.patient_id)
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
REVOKE ALL ON FUNCTION public.hcn_can_view_clinical_document(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_clinical_document(uuid) TO authenticated;
