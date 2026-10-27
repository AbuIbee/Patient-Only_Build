-- MMA-P1-CODEX-002 P1-03 — "A Caregiver can delete a clinical note
-- despite an active legal hold." Independent Codex audit, reproduced
-- exactly: patient_legal_holds (migration 146) was only ever checked
-- inside archive_eligible_closed_patients() -- it was never wired into
-- any DELETE policy anywhere. Every existing ordinary DELETE path
-- (patient's own note, caregiver's own note, document uploads) remained
-- fully destructive regardless of an active hold.
--
-- SCOPE DECISION, recorded: this protects genuinely CLINICAL record
-- tables -- patient_notes, patient_document_uploads, medications,
-- medication_logs -- not every patient_id-bearing table in the schema.
-- Personal/consumer journaling tables (memories, mood_entries,
-- care_partner_logs, media_uploads) are not clinical evidence in the
-- sense Section 8.4/the audit's P1-03 finding addresses, and restricting
-- them without evidence they are in scope would itself be inventing a
-- requirement. care_team_members/caregiver_patients/tasks/appointments
-- are relationship/scheduling records, not clinical content, and are
-- also left out of this specific fix for the same reason.
--
-- MECHANISM: a RESTRICTIVE policy (Postgres ANDs every RESTRICTIVE
-- policy with the OR of all PERMISSIVE policies for the same command) on
-- each table's DELETE command. This closes EVERY existing and future
-- client-reachable DELETE path uniformly -- patient's own, caregiver's,
-- any future role -- without having to individually edit each existing
-- PERMISSIVE policy. A SECURITY DEFINER RPC bypasses RLS entirely by
-- design (it runs as the function owner) and is unaffected by this
-- policy; no RPC is capable of hard-deleting these specific tables'
-- client-facing rows (DELETE access to all four tables is exclusively
-- through RLS-governed REST calls, confirmed by grep: no RPC named
-- *delete*note*/*delete*medication*/*delete*document* exists).
DO $$ BEGIN
  CREATE POLICY "Active legal hold blocks patient_notes deletion"
    ON patient_notes AS RESTRICTIVE FOR DELETE
    USING (NOT EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = patient_notes.patient_id AND h.status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active legal hold blocks patient_document_uploads deletion"
    ON patient_document_uploads AS RESTRICTIVE FOR DELETE
    USING (NOT EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = patient_document_uploads.patient_id AND h.status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active legal hold blocks medications deletion"
    ON medications AS RESTRICTIVE FOR DELETE
    USING (NOT EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = medications.patient_id AND h.status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active legal hold blocks medication_logs deletion"
    ON medication_logs AS RESTRICTIVE FOR DELETE
    USING (NOT EXISTS (SELECT 1 FROM patient_legal_holds h WHERE h.patient_id = medication_logs.patient_id AND h.status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Non-destructive correction (UPDATE) is deliberately NOT restricted --
-- "distinguish permitted non-destructive corrections from destruction of
-- preserved evidence." A therapist/medical professional correcting their
-- own note's content while under hold is not prohibited by this fix.
