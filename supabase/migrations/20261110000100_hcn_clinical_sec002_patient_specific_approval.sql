-- HCN-CLINICAL-MASTER-002-CONTINUATION SEC-002 -- clinical approval
-- authority must be patient-specific, not merely "holds an eligible
-- role somewhere in this organization." Reuses EXISTING authorization
-- primitives rather than inventing a new delegation table:
-- staff_patient_assignments already ties a specific user to a specific
-- patient under a specific org_role (medical_professional/therapist);
-- organization_owner_capability_grants already covers an Organization
-- Owner who has self-assigned that capability (the same alternate path
-- is_authorized_for_patient() itself already recognizes). "Clinical
-- supervisor" has no per-patient assignment row by design (it is an
-- organization-wide oversight role, per its own existing org_role
-- definition) -- scoped instead to active org-wide membership, which
-- is the documented organization-policy authorization the directive
-- allows for as an alternative to a per-patient assignment.
CREATE OR REPLACE FUNCTION public.hcn_clinical_approve_document(p_document_id UUID, p_notes TEXT)
RETURNS public.hcn_clinical_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row hcn_clinical_documents; v_is_qualified BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM hcn_clinical_documents WHERE id = p_document_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such document'; END IF;
  IF v_row.review_status <> 'forwarded_for_clinical_review' THEN
    RAISE EXCEPTION 'This document has not been forwarded for clinical review (status: %)', v_row.review_status;
  END IF;

  SELECT
    -- Medical Professional / Therapist: org-wide role membership is
    -- NOT enough on its own -- also require an ACTIVE assignment to
    -- THIS SPECIFIC patient under that same role.
    EXISTS (
      SELECT 1 FROM organization_memberships m
      JOIN staff_patient_assignments a ON a.organization_id = m.organization_id AND a.user_id = m.user_id AND a.org_role = m.org_role
      WHERE m.organization_id = v_row.organization_id AND m.user_id = auth.uid() AND m.status = 'active'
        AND m.org_role IN ('medical_professional', 'therapist')
        AND a.patient_id = v_row.patient_id AND a.is_active = true
    )
    -- An Organization Owner who has self-assigned the matching
    -- capability (organization_owner_capability_grants, migration 144)
    -- -- the SAME alternate authorization path is_authorized_for_patient()
    -- already treats as equivalent to a real assignment.
    OR EXISTS (
      SELECT 1 FROM organizations o
      JOIN organization_owner_capability_grants g ON g.organization_id = o.id AND g.user_id = auth.uid()
        AND g.capability IN ('medical_professional', 'therapist') AND g.status = 'active'
      WHERE o.id = v_row.organization_id
    )
    -- Clinical Supervisor: an organization-wide oversight role by its
    -- own existing definition (no per-patient assignment concept
    -- exists for it) -- active org-wide membership is the documented
    -- organization-policy authorization for this one role only.
    OR EXISTS (
      SELECT 1 FROM organization_memberships m
      WHERE m.organization_id = v_row.organization_id AND m.user_id = auth.uid() AND m.status = 'active' AND m.org_role = 'clinical_supervisor'
    )
  INTO v_is_qualified;

  IF NOT v_is_qualified THEN
    RAISE EXCEPTION 'You are not authorized to clinically approve this document -- an eligible clinical role alone is not sufficient without a current assignment to this specific patient (or Clinical Supervisor oversight)';
  END IF;

  UPDATE hcn_clinical_documents SET review_status = 'clinical_approved', reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = p_notes, updated_at = now()
  WHERE id = p_document_id RETURNING * INTO v_row;

  PERFORM hcn_record_request_event(r.id, 'clinical_review', auth.uid(), NULL, jsonb_build_object('document_id', p_document_id))
  FROM hcn_clinical_request_documents rd JOIN hcn_clinical_requests r ON r.id = rd.request_id WHERE rd.document_id = p_document_id;

  RETURN v_row;
END;
$$;
-- Signature unchanged from the foundation migration -- CREATE OR
-- REPLACE correctly replaces the existing single overload, no DROP
-- needed (confirmed: same (UUID, TEXT) parameter list as before).
