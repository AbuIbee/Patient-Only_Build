-- CODEX F-16 (P1, release-blocking) — "Genuine direct Therapist
-- journey remains broken." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-16,
-- target commit b362e119.
--
-- Confirmed by reading the actual RLS, a layer deeper than the
-- originally-suspected UI-only bug: a direct (residential) Therapist
-- connection (therapist_relationships, is_active=true) has NEVER had
-- a SELECT policy on patients, medications, mood_entries, or
-- care_partner_notes recognizing it at all. is_authorized_for_patient()
-- (used for messaging/conversations) has always included
-- therapist_relationships, but the raw clinical-record tables
-- themselves never did -- only caregiver_patients, the patient's own
-- row, or staff_patient_assignments (Enterprise-org-scoped) were ever
-- recognized. A real, accepted, active direct Therapist connection
-- therefore had no way to actually read the patient's own clinical
-- record at all, confirmed live: EnterpriseStaffPatientView's own
-- subsequent data-load Promise.all returned a null patientRow and
-- rendered "Something went wrong loading this patient" -- not the
-- access-denied screen (that part is already fixed in this same
-- session, in the component's own access gate), but a genuine RLS
-- gap one layer further in.
--
-- Fix: one additive SELECT policy per table, mirroring the existing
-- "Assigned org staff can view..." pattern exactly, just keyed by
-- therapist_relationships instead of staff_patient_assignments.
DO $$ BEGIN
  CREATE POLICY "Direct-connection therapists can view their patients"
    ON patients FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM therapist_relationships tr WHERE tr.patient_id = patients.id AND tr.therapist_id = auth.uid() AND tr.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Direct-connection therapists can view their patients' meds"
    ON medications FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM therapist_relationships tr WHERE tr.patient_id = medications.patient_id AND tr.therapist_id = auth.uid() AND tr.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Direct-connection therapists can view their patients' moods"
    ON mood_entries FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM therapist_relationships tr WHERE tr.patient_id = mood_entries.patient_id AND tr.therapist_id = auth.uid() AND tr.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Direct-connection therapists can view their patients' notes"
    ON care_partner_notes FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM therapist_relationships tr WHERE tr.patient_id = care_partner_notes.patient_id AND tr.therapist_id = auth.uid() AND tr.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
