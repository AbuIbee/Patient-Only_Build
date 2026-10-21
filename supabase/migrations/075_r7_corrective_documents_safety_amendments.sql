-- 075_r7_corrective_documents_safety_amendments.sql
-- ROUND 7 CORRECTIVE — closes P15/W12 (secure document download/upload),
-- P01 (communication needs), P16 (preferred hospital/code status/safety
-- instructions), W14 (note amendments), O05 (a caregiver's own sent
-- therapist-invitation history), P13 (overnight HELP acknowledgment).

-- ============================================================================
-- P15/W12 — DISCOVERED THIS ROUND: patient_document_uploads' own DB-row
-- RLS was already staff-scoped (migrations 067/071), but the
-- 'patient-documents' STORAGE BUCKET's own storage.objects policies
-- (migration 007) were only ever extended for caregiver_patients, never
-- staff_patient_assignments — so no Enterprise staff member could ever
-- actually read or write the real file bytes, despite the DB row
-- policy looking staff-ready. Mirrors the exact caregiver_patients
-- pattern already proven in migration 007, extended the same way every
-- other table in this engagement has been.
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can read their patients' document storage objects"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'patient-documents'
      AND EXISTS (
        SELECT 1 FROM staff_patient_assignments spa
        WHERE spa.patient_id::text = (storage.foldername(name))[1]
          AND spa.user_id = auth.uid() AND spa.is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can upload their patients' document storage objects"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'patient-documents'
      AND EXISTS (
        SELECT 1 FROM staff_patient_assignments spa
        WHERE spa.patient_id::text = (storage.foldername(name))[1]
          AND spa.user_id = auth.uid() AND spa.is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- P01 — communication needs, free text, same provenance pattern as
-- migration 070's clinical-record tables (source gated server-side).
-- ============================================================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS communication_needs TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS communication_needs_source TEXT
  CHECK (communication_needs_source IS NULL OR communication_needs_source IN ('verified_source', 'caregiver_report', 'professional_observation', 'unknown'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS communication_needs_updated_by UUID REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION public.record_communication_needs(
  p_patient_id UUID, p_communication_needs TEXT, p_source TEXT DEFAULT 'caregiver_report'
) RETURNS patients AS $$
DECLARE
  v_row patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
  END IF;
  UPDATE patients SET
    communication_needs = p_communication_needs, communication_needs_source = p_source, communication_needs_updated_by = auth.uid()
  WHERE id = p_patient_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_communication_needs(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_communication_needs(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- P16 — preferred hospital / safety instructions / code status. Code
-- status defaults to 'unknown' (NEVER a specific code by default — no
-- misrepresentation risk) and setting it to the verified tier requires
-- the same professional gate as a professional_observation claim
-- elsewhere in this schema.
-- ============================================================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS preferred_hospital TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS safety_response_instructions TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS code_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (code_status IN ('unknown', 'full_code', 'dnr'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS code_status_source TEXT NOT NULL DEFAULT 'unknown'
  CHECK (code_status_source IN ('verified_source', 'caregiver_report', 'professional_observation', 'unknown'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS code_status_updated_by UUID REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION public.record_patient_safety_plan(
  p_patient_id UUID, p_preferred_hospital TEXT DEFAULT NULL, p_safety_response_instructions TEXT DEFAULT NULL,
  p_code_status TEXT DEFAULT NULL, p_code_status_source TEXT DEFAULT 'caregiver_report'
) RETURNS patients AS $$
DECLARE
  v_row patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_code_status IS NOT NULL AND p_code_status_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may verify a code status';
  END IF;
  UPDATE patients SET
    preferred_hospital = COALESCE(p_preferred_hospital, preferred_hospital),
    safety_response_instructions = COALESCE(p_safety_response_instructions, safety_response_instructions),
    code_status = COALESCE(p_code_status, code_status),
    code_status_source = CASE WHEN p_code_status IS NOT NULL THEN p_code_status_source ELSE code_status_source END,
    code_status_updated_by = CASE WHEN p_code_status IS NOT NULL THEN auth.uid() ELSE code_status_updated_by END
  WHERE id = p_patient_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_patient_safety_plan(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_safety_plan(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- W14 — append-only note amendment. The ORIGINAL note is never
-- updated or deleted; an amendment is a new row referencing it, so
-- "distinguish original from corrected record" is a structural
-- guarantee, not a UI label that could drift from the data.
-- ============================================================================
ALTER TABLE patient_notes ADD COLUMN IF NOT EXISTS amends_note_id UUID REFERENCES patient_notes(id);

CREATE OR REPLACE FUNCTION public.record_note_amendment(
  p_original_note_id UUID, p_corrected_note TEXT
) RETURNS patient_notes AS $$
DECLARE
  v_original patient_notes;
  v_row patient_notes;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_original FROM patient_notes WHERE id = p_original_note_id;
  IF v_original.id IS NULL THEN RAISE EXCEPTION 'No such note'; END IF;
  IF v_original.author_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the original author may amend this note';
  END IF;
  -- Re-verify the SAME authorization tier the original note type
  -- requires, exactly as patient_notes' own INSERT policies already
  -- gate authorship — an amendment is never a weaker-authority path
  -- than the original authorship itself.
  IF v_original.note_type = 'therapist_session' AND NOT public.is_therapist_for_patient(v_original.patient_id) THEN
    RAISE EXCEPTION 'Not authorized to amend this therapist session note';
  ELSIF v_original.note_type = 'clinical_observation' AND NOT public.is_medical_professional_for_patient(v_original.patient_id) THEN
    RAISE EXCEPTION 'Not authorized to amend this clinical observation note';
  END IF;

  INSERT INTO patient_notes (patient_id, author_id, caregiver_id, note, note_type, amends_note_id)
  VALUES (v_original.patient_id, auth.uid(), v_original.caregiver_id, p_corrected_note, v_original.note_type, p_original_note_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_note_amendment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_note_amendment(UUID, TEXT) TO authenticated;

-- ============================================================================
-- O05 — pending_therapist_connections has RLS ENABLED but ZERO
-- policies (confirmed this round via direct pg_policy inspection) —
-- every read/write today goes exclusively through the SECURITY
-- DEFINER RPC family, so even the inviting caregiver has never had a
-- direct read of their own sent invitation's status history. This
-- adds exactly that — the inviting caregiver or the invited therapist
-- may read their own connection rows; nothing else changes.
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "The inviting caregiver or invited therapist can view their own connection"
    ON pending_therapist_connections FOR SELECT
    USING (caregiver_id = auth.uid() OR therapist_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- P13 — a minimal, narrow acknowledgment for an overnight HELP
-- activation, mirroring the already-proven shift-handoff acknowledgment
-- shape exactly (migration 068's acknowledge_shift_handoff). Does NOT
-- touch record_help_activation()'s own atomicity/notification_status
-- logic (migration 050, a prior P0 fix) at all.
-- ============================================================================
ALTER TABLE help_activations ADD COLUMN IF NOT EXISTS staff_acknowledged_by UUID REFERENCES profiles(id);
ALTER TABLE help_activations ADD COLUMN IF NOT EXISTS staff_acknowledged_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.acknowledge_help_activation(p_help_activation_id UUID)
RETURNS help_activations AS $$
DECLARE
  v_row help_activations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM help_activations WHERE id = p_help_activation_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such HELP activation'; END IF;
  IF NOT public.has_patient_access(v_row.patient_id) THEN
    RAISE EXCEPTION 'Not authorized for this patient';
  END IF;
  UPDATE help_activations SET staff_acknowledged_by = auth.uid(), staff_acknowledged_at = now()
  WHERE id = p_help_activation_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.acknowledge_help_activation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_help_activation(UUID) TO authenticated;

-- LIVE VERIFICATION (this round): see 36_ROUND7_CORRECTIVE_IMPLEMENTATION_REPORT.md
-- for the exact fixture, curl transcripts, and Playwright results for
-- every function/policy above, including cross-tenant negative tests.
