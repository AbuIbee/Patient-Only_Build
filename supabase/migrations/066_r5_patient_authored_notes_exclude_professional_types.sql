-- ROUND 5 — new finding (NOTE-01, P1), discovered by this round's own
-- adversarial testing of THER-01's revocation invariant ("removing
-- eligibility must immediately remove effective professional
-- authorization... regardless of whether a historical relationship
-- row remains" — applied here to professional-note reading).
--
-- CONFIRMED DEFECT #1 (reproduced live, local isolated environment):
-- migration 006's "Patients can create their own authored notes"
-- INSERT policy is `WITH CHECK (author_id = auth.uid() AND patient_id
-- = auth.uid())` — no note_type restriction at all. An ordinary
-- PATIENT-role account, with zero therapist relationship and zero
-- professional eligibility, successfully inserted a row with
-- note_type = 'therapist_session' for themselves (201 Created) —
-- fabricating what reads, to every other authorized viewer
-- (caregivers, the patient's real therapist), as genuine professional
-- clinical documentation.
--
-- CONFIRMED DEFECT #2 (reproduced live, same session): migration 006's
-- "Patients can view their own authored notes" SELECT policy is
-- `USING (author_id = auth.uid())` — also no note_type restriction.
-- A real therapist who authored a real therapist_session note, then
-- had their relationship revoked via revoke_therapist_connection(),
-- could still read that note afterward — the dedicated
-- "Therapists can view and manage their own session notes" policy
-- (USING note_type = 'therapist_session' AND is_therapist_for_patient())
-- correctly re-evaluates to false post-revocation, but RLS policies
-- are permissive-OR'd, and this unrelated, more broadly-worded policy
-- (written for the 'care_partner_personal' self-note case) still
-- matched and granted access on its own.
--
-- FIX: both policies are narrowed to explicitly exclude the
-- professional note types (therapist_session, clinical_observation).
-- Patients retain full, unchanged self-authoring/reading of their own
-- personal notes (care_partner_personal — the only type the tracked
-- frontend, src/pages/patient/PatientDocuments.tsx, ever uses for
-- patient-authored notes) and the pre-existing general/medical/
-- behavior/mood/activity types, in case any other self-authored use
-- exists. Professional note types remain reachable ONLY through their
-- own dedicated, eligibility-gated policies.

DROP POLICY IF EXISTS "Patients can create their own authored notes" ON patient_notes;
CREATE POLICY "Patients can create their own authored notes"
  ON patient_notes FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND patient_id = auth.uid()
    AND note_type NOT IN ('therapist_session', 'clinical_observation')
  );

DROP POLICY IF EXISTS "Patients can view their own authored notes" ON patient_notes;
CREATE POLICY "Patients can view their own authored notes"
  ON patient_notes FOR SELECT
  USING (
    author_id = auth.uid()
    AND note_type NOT IN ('therapist_session', 'clinical_observation')
  );

-- "Patients can delete their own authored notes" (USING author_id =
-- auth.uid()) is left unchanged: a patient can still only ever delete
-- a row they themselves authored (their own id in author_id) — never
-- a real therapist's or medical professional's note, since those
-- carry the professional's own author_id, not the patient's. No
-- forgery-enabling gap exists there.
