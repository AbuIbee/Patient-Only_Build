-- 047_caregiver_medical_record_access.sql
-- CRITICAL OWNER-REPORTED REMEDIATION Correction E — "Expand the existing
-- caregiver's patient view into a comprehensive Patient Care Record...
-- Identify missing authorized caregiver access and incorrect reliance on
-- auth.uid() as the patient identity."
--
-- Confirmed by auditing every medically-relevant table's actual RLS
-- (not assumed): appointments, care_team_members, medication_logs,
-- care_partner_checkins and patient_document_uploads ALL already have a
-- working "Caregivers can view ... for their patients" policy via
-- caregiver_patients — they were simply never queried by
-- CaregiverPatientView.tsx. Two tables, however, genuinely have NO
-- caregiver access at all — only `patient_id = auth.uid()` /
-- `*_profile_id = auth.uid()` policies, exactly the "incorrect reliance
-- on auth.uid() as the patient identity" the owner flagged:
--
--   - patient_emergency_contacts: only "Patients own their emergency
--     contacts" (patient_id = auth.uid()). A caregiver viewing a
--     DIFFERENT patient's record has no path to this table at all.
--   - patient_intake: only created_by/patient_profile_id/
--     caregiver_profile_id = auth.uid() — so a caregiver who did NOT
--     personally submit a given patient's intake (e.g. the patient
--     filled it in themselves, or a different caregiver did) cannot
--     read it even though they are that patient's authorized caregiver.
--
-- This migration adds exactly those two missing SELECT policies, reusing
-- the identical caregiver_patients-based pattern already proven correct
-- on every other table above. Nothing is granted beyond SELECT; nothing
-- else about either table changes.
--
-- STAGING-TARGETED. Not yet applied to production.
DO $$ BEGIN
  CREATE POLICY "Caregivers can view their patients' emergency contacts"
    ON public.patient_emergency_contacts FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = patient_emergency_contacts.patient_id AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view their patients' intake records"
    ON public.patient_intake FOR SELECT
    USING (
      patient_profile_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = patient_intake.patient_profile_id AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
