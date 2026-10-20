-- ROUND 5 — ENTERPRISE CAREGIVER PORTAL foundation, item 1 of many:
-- extend base clinical-record RLS to recognize staff_patient_assignments.
--
-- CONFIRMED GAP: every base clinical table's RLS (migration 001 and
-- later) only ever recognized `caregiver_patients` (the RESIDENTIAL
-- caregiver↔patient link) as a read-authorization source. The existing
-- EnterpriseStaffPatientView.tsx already queries medications,
-- mood_entries, and care_partner_notes directly for an org staff member
-- (therapist/medical_professional), under the assumption that an active
-- `staff_patient_assignments` row is sufficient — but none of these
-- tables' RLS policies ever granted that. The result: a staff member's
-- query for an assigned patient's medications/mood/notes was silently
-- DENIED by RLS and returned zero rows, rendered identically to "this
-- patient genuinely has none" (confirmed by reading the component: the
-- empty-state branch is indistinguishable from an RLS-denied empty
-- result). This is exactly the "no empty/error conflation" defect the
-- locked Enterprise Caregiver Portal requirements explicitly warn
-- against, and the root blocker for nearly every P01–P22 record-tab
-- requirement for the new dedicated Enterprise Caregiver record view
-- this round adds.
--
-- FIX: a read-only (SELECT) policy is added to each base clinical table
-- below, granting access when the caller holds an ACTIVE
-- staff_patient_assignments row for that patient — mirroring the
-- existing caregiver_patients-based SELECT policies already on each
-- table, changing nothing about who may INSERT/UPDATE/DELETE. Clinical
-- write access for professional staff continues to go through the
-- existing, purpose-built, author-attributed paths (patient_notes'
-- note_type-gated policies from migrations 006/044/066 for
-- professional documentation) rather than this migration widening
-- write access to any of these base tables.
--
-- Scope is deliberately `is_active = true` on staff_patient_assignments
-- only — a revoked or ended assignment loses this access immediately,
-- the same guarantee caregiver_patients already provides for revoked
-- caregivers.

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view medications for their patients"
    ON medications FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = medications.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view medication schedules for their patients"
    ON medication_schedules FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM medications m
        JOIN staff_patient_assignments spa ON spa.patient_id = m.patient_id
        WHERE m.id = medication_schedules.medication_id AND spa.user_id = auth.uid() AND spa.is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view medication logs for their patients"
    ON medication_logs FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = medication_logs.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view tasks for their patients"
    ON tasks FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = tasks.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view mood entries for their patients"
    ON mood_entries FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = mood_entries.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view appointments for their patients"
    ON appointments FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = appointments.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view document uploads for their patients"
    ON patient_document_uploads FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = patient_document_uploads.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view A-G check-ins for their patients"
    ON care_partner_checkins FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_checkins.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view A-G care partner notes for their patients"
    ON care_partner_notes FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = care_partner_notes.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view HELP activation history for their patients"
    ON help_activations FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = help_activations.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Patients table itself: EnterpriseStaffPatientView already queries
-- `patients` directly for the header — confirm/add the same staff-read
-- policy there too, since migration 001's only SELECT policy on
-- `patients` is caregiver_patients-based.
DO $$ BEGIN
  CREATE POLICY "Assigned org staff can view their assigned patients"
    ON patients FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.patient_id = patients.id AND spa.user_id = auth.uid() AND spa.is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
