-- 038_patient_notes_privacy_correction.sql
-- ENTERPRISE CONSOLIDATED DELIVERY — Care Communications item: "Preserve
-- private notes as private. Correct any existing RLS exposure that
-- contradicts the privacy label."
--
-- src/pages/patient/PatientDocuments.tsx explicitly tells the PATIENT
-- these entries are private ("Add private notes to any day", note_type =
-- 'care_partner_personal' — the patient's own personal journal, migrated
-- from a previously local-only localStorage feature). But the existing
-- "Caregivers can view notes for their patients" SELECT policy on
-- patient_notes has no note_type filter at all — it grants a linked
-- caregiver read access to EVERY note row for that patient, including
-- the patient's own personal journal entries. That is a real
-- contradiction between the label shown to the patient and the actual
-- RLS, not a hypothetical one.
--
-- Fix: the caregiver SELECT policy excludes 'care_partner_personal' rows.
-- All other note types (general/medical/behavior/mood/activity) remain
-- caregiver-visible exactly as before — this migration does not touch
-- any policy other than the one proven to contradict its own privacy
-- label.
--
-- STAGING-TARGETED. Not yet applied to production.
DROP POLICY IF EXISTS "Caregivers can view notes for their patients" ON public.patient_notes;

CREATE POLICY "Caregivers can view notes for their patients"
  ON public.patient_notes FOR SELECT
  USING (
    note_type != 'care_partner_personal'
    AND EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id = patient_notes.patient_id AND cp.caregiver_id = auth.uid()
    )
  );
