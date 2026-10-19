-- 044_professional_documentation_notes.sql
-- FINAL INTEGRATION CORRECTIONS item 3 — Therapist "care goals and
-- documentation" and Medical Professional "clinical messages and
-- follow-ups / appropriate professional notes and observations."
--
-- Reuses the EXISTING patient_notes table (already the home of general/
-- medical/behavior/mood/activity/care_partner_personal notes) rather than
-- inventing a new clinical-records table — "implement minimum necessary
-- new structures." Two new note_type values are added, each gated by its
-- OWN role-specific RLS, written via the existing author_id column (the
-- same column the patient's own personal notes already use — caregiver
-- notes keep using the separate caregiver_id column per the existing
-- author_xor_caregiver CHECK).
--
-- Visibility: a patient's caregiver(s) already see every note_type except
-- 'care_partner_personal' via the existing (migration 038-corrected)
-- SELECT policy, so therapist_session/clinical_observation notes are
-- automatically visible to the caregiver with NO new policy needed —
-- exactly the "reuse existing, already-correct security semantics"
-- principle. What's missing, and what this migration adds, is: (1) the
-- new note_type values themselves, (2) a way for the AUTHORING
-- therapist/medical professional to write and later read/update their
-- own notes, scoped to patients they are actually, currently authorized
-- for (via staff_patient_assignments OR the legacy therapist_relationships
-- table).
--
-- "Never grant medical ordering, prescribing, clinical administration or
-- other regulated privileges solely through the selected job title": this
-- migration only ever grants write access to a free-text NOTE field, the
-- same shape every other note_type already uses — nothing here creates,
-- or could be mistaken for, an order, a prescription, or any clinical
-- action.
--
-- STAGING-TARGETED. Not yet applied to production.

ALTER TABLE public.patient_notes DROP CONSTRAINT patient_notes_note_type_check;
ALTER TABLE public.patient_notes ADD CONSTRAINT patient_notes_note_type_check
  CHECK (note_type = ANY (ARRAY['general'::text, 'medical'::text, 'behavior'::text, 'mood'::text, 'activity'::text, 'care_partner_personal'::text, 'therapist_session'::text, 'clinical_observation'::text]));

CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id UUID)
RETURNS boolean AS $$
  SELECT
    EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND org_role = 'therapist' AND is_active = true)
    OR EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_therapist_for_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_therapist_for_patient(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_medical_professional_for_patient(p_patient_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_patient_assignments
    WHERE user_id = auth.uid() AND patient_id = p_patient_id AND org_role = 'medical_professional' AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_medical_professional_for_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_medical_professional_for_patient(UUID) TO authenticated;

DO $$ BEGIN
  CREATE POLICY "Therapists can create session notes for their patients"
    ON public.patient_notes FOR INSERT
    WITH CHECK (note_type = 'therapist_session' AND author_id = auth.uid() AND public.is_therapist_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Therapists can view and manage their own session notes"
    ON public.patient_notes FOR SELECT
    USING (note_type = 'therapist_session' AND public.is_therapist_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Therapists can update their own session notes"
    ON public.patient_notes FOR UPDATE
    USING (note_type = 'therapist_session' AND author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Medical professionals can create clinical observations for their patients"
    ON public.patient_notes FOR INSERT
    WITH CHECK (note_type = 'clinical_observation' AND author_id = auth.uid() AND public.is_medical_professional_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Medical professionals can view their own clinical observations"
    ON public.patient_notes FOR SELECT
    USING (note_type = 'clinical_observation' AND public.is_medical_professional_for_patient(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Medical professionals can update their own clinical observations"
    ON public.patient_notes FOR UPDATE
    USING (note_type = 'clinical_observation' AND author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
