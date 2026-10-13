-- 006_patient_notes_author.sql
-- F12 (care partner personal notes).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- PatientDocuments.tsx wrote note_type: 'care_partner_personal' (not in the
-- tracked note_type CHECK, which only allows general/medical/behavior/mood/
-- activity) and caregiver_id: patientId — the patient's own id written into
-- a column that is NOT NULL REFERENCES profiles(id), as a workaround to
-- satisfy that constraint without a real caregiver authoring the note. Both
-- call sites (the localStorage-migration insert and addCareNote) now use a
-- dedicated author_id column instead; see src/pages/patient/PatientDocuments.tsx.

ALTER TABLE patient_notes
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id);

ALTER TABLE patient_notes
  ALTER COLUMN caregiver_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE patient_notes DROP CONSTRAINT IF EXISTS patient_notes_note_type_check;
  ALTER TABLE patient_notes
    ADD CONSTRAINT patient_notes_note_type_check
    CHECK (note_type IN ('general', 'medical', 'behavior', 'mood', 'activity', 'care_partner_personal'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'patient_notes_note_type_check not reapplied — reconcile manually against live data before executing.';
END $$;

-- Either a caregiver authored the note (caregiver_id set, author_id null —
-- the pre-existing shape) or the patient authored it themselves (author_id
-- set, caregiver_id null) — never neither, never both.
DO $$ BEGIN
  ALTER TABLE patient_notes
    ADD CONSTRAINT patient_notes_author_xor_caregiver
    CHECK (
      (caregiver_id IS NOT NULL AND author_id IS NULL) OR
      (caregiver_id IS NULL AND author_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Patient-self access for author_id = auth.uid() notes only. This does NOT
-- widen access to caregiver-authored notes — those stay on the existing
-- caregiver_patients-gated policies in 001_initial_schema.sql untouched, per
-- the work order's "do not expand patient_notes SELECT access as a side effect".
DO $$ BEGIN
  CREATE POLICY "Patients can view their own authored notes"
    ON patient_notes FOR SELECT
    USING (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can create their own authored notes"
    ON patient_notes FOR INSERT
    WITH CHECK (author_id = auth.uid() AND patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can delete their own authored notes"
    ON patient_notes FOR DELETE
    USING (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
