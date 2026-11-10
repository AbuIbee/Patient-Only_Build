-- HCN-CLINICAL-MASTER-002-CONTINUATION SEC-003 -- clinical document
-- visibility previously collapsed to a single check (has_patient_access)
-- for every internal viewer, AND the Director/Owner's separate "manage"
-- policy granted unrestricted SELECT regardless of content sensitivity
-- -- meaning any patient-assigned caregiver, and any Director, could
-- read every clinical document for that patient, including specially
-- sensitive ones, merely by holding a generic patient-access role.
-- This migration introduces an explicit classification with a
-- real access matrix, enforced identically for the table itself and
-- for the underlying Storage objects (closing the "read it via a
-- different API/the raw Storage object" bypass the directive calls
-- out by name).

ALTER TABLE public.hcn_clinical_documents
  ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'general_care_coordination' CHECK (classification IN (
    'general_care_coordination', 'caregiver_approved_instructions', 'patient_shared_document',
    'restricted_clinical_documentation', 'specially_protected_documentation'
  ));

-- Shared primitive: does this user currently hold a clinical role
-- (Medical Professional / Therapist) with an ACTIVE assignment to this
-- SPECIFIC patient, an equivalent Organization Owner capability grant,
-- or Clinical Supervisor oversight -- the same patient-specific
-- standard SEC-002 established for clinical approval, reused here so
-- "who may approve" and "who may view restricted content" stay
-- consistent rather than drifting into two different definitions of
-- "qualified clinician."
CREATE OR REPLACE FUNCTION public.hcn_is_qualified_clinician_for_patient(p_organization_id UUID, p_patient_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM organization_memberships m
      JOIN staff_patient_assignments a ON a.organization_id = m.organization_id AND a.user_id = m.user_id AND a.org_role = m.org_role
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid() AND m.status = 'active'
        AND m.org_role IN ('medical_professional', 'therapist')
        AND a.patient_id = p_patient_id AND a.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM organization_owner_capability_grants g
      WHERE g.organization_id = p_organization_id AND g.user_id = auth.uid()
        AND g.capability IN ('medical_professional', 'therapist') AND g.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid() AND m.status = 'active' AND m.org_role = 'clinical_supervisor'
    );
$$;
REVOKE ALL ON FUNCTION public.hcn_is_qualified_clinician_for_patient(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_is_qualified_clinician_for_patient(UUID, UUID) TO authenticated;

-- The single access decision, consulted by BOTH the table's own RLS
-- and the storage.objects RLS below, so the two can never drift apart.
CREATE OR REPLACE FUNCTION public.hcn_can_view_clinical_document(p_document_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v_doc hcn_clinical_documents;
BEGIN
  SELECT * INTO v_doc FROM hcn_clinical_documents WHERE id = p_document_id;
  IF v_doc.id IS NULL THEN RETURN false; END IF;

  IF v_doc.uploaded_by = auth.uid() THEN RETURN true; END IF;

  IF v_doc.classification IN ('general_care_coordination', 'caregiver_approved_instructions', 'patient_shared_document') THEN
    RETURN public.has_patient_access(v_doc.patient_id);
  END IF;

  IF v_doc.classification = 'restricted_clinical_documentation' THEN
    RETURN public.is_active_org_director(v_doc.organization_id) OR public.is_organization_owner(v_doc.organization_id)
      OR public.hcn_is_qualified_clinician_for_patient(v_doc.organization_id, v_doc.patient_id);
  END IF;

  -- specially_protected_documentation: a qualifying clinical role is
  -- NECESSARY but NOT SUFFICIENT -- an explicit per-document sharing
  -- grant is additionally required, and the Director/Owner's usual
  -- broad administrative reach does NOT bypass this -- they need the
  -- same explicit grant as anyone else. This is the extra protection
  -- layer for specially sensitive content (e.g. psychotherapy notes).
  RETURN public.hcn_is_qualified_clinician_for_patient(v_doc.organization_id, v_doc.patient_id)
    AND EXISTS (
      SELECT 1 FROM hcn_document_grants g
      WHERE g.document_id = p_document_id AND g.grantee_type = 'internal_user' AND g.grantee_user_id = auth.uid()
        AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
    );
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_can_view_clinical_document(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_clinical_document(UUID) TO authenticated;

-- Split the prior single "FOR ALL" Director/Owner policy: their
-- administrative reach (create/update/delete for review workflows)
-- is preserved in full, but plain SELECT is no longer unconditional --
-- it now goes through the same classification-aware check as every
-- other internal viewer.
DROP POLICY IF EXISTS "Org directors and owners manage clinical documents" ON public.hcn_clinical_documents;
DROP POLICY IF EXISTS "Org directors and owners insert clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Org directors and owners insert clinical documents" ON public.hcn_clinical_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
DROP POLICY IF EXISTS "Org directors and owners update clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Org directors and owners update clinical documents" ON public.hcn_clinical_documents
  FOR UPDATE TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id))
  WITH CHECK (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));
DROP POLICY IF EXISTS "Org directors and owners delete clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Org directors and owners delete clinical documents" ON public.hcn_clinical_documents
  FOR DELETE TO authenticated
  USING (public.is_active_org_director(organization_id) OR public.is_organization_owner(organization_id));

DROP POLICY IF EXISTS "Patient-authorized internal users can view clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Classification-aware clinical document visibility" ON public.hcn_clinical_documents
  FOR SELECT TO authenticated
  USING (public.hcn_can_view_clinical_document(id));

-- Non-director uploaders may only self-classify into the three
-- broadly-visible tiers unless they are themselves a qualified
-- clinician for this patient (e.g. a treating therapist uploading
-- their own notes directly as specially-protected).
DROP POLICY IF EXISTS "Patient-authorized internal users can upload clinical documents" ON public.hcn_clinical_documents;
CREATE POLICY "Patient-authorized internal users can upload clinical documents" ON public.hcn_clinical_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_patient_access(patient_id) AND uploaded_by = auth.uid()
    AND (
      classification IN ('general_care_coordination', 'caregiver_approved_instructions', 'patient_shared_document')
      OR public.hcn_is_qualified_clinician_for_patient(organization_id, patient_id)
    )
  );

-- storage.objects: identical decision, so a direct Storage read can
-- never see more than the table-level policy already permits.
DROP POLICY IF EXISTS "Patient-authorized internal users can read clinical document objects" ON storage.objects;
CREATE POLICY "Classification-aware clinical document object reads" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hcn-clinical-documents'
    AND EXISTS (SELECT 1 FROM public.hcn_clinical_documents d WHERE d.storage_path = storage.objects.name AND public.hcn_can_view_clinical_document(d.id))
  );
