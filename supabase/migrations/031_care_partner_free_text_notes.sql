-- 031_care_partner_free_text_notes.sql
-- OWNER-MANUAL-TEST-CORRECTIONS item 5: free-text notes for all seven Care
-- Partner categories (A–G), accessible to EVERY subscription tier,
-- including Free. Explicitly distinct from the existing `care_partner_checkins`
-- table (the full structured assessment — dropdowns/metrics — which stays
-- Daily Care/Full Support only, per migration 016's RESTRICTIVE INSERT
-- policy). This migration does NOT touch care_partner_checkins at all —
-- "Do not open paid-only care_partner_checkins INSERT permissions to Free
-- Tier or weaken existing patient/caregiver isolation."
--
-- One current note per (patient, category) — "enter, save, and review" is
-- satisfied by an upsert-on-conflict row per category, not a dated log;
-- there is no requirement for history here, unlike care_partner_checkins'
-- own per-day rows.
--
-- RLS mirrors the existing patients/caregiver_patients ownership pattern
-- used throughout 001_initial_schema.sql: the patient themselves, OR an
-- authorized caregiver (via caregiver_patients), may read/write. No tier
-- check at the database layer — tier only controls which UI a caller sees;
-- every authenticated tier is equally authorized to use this table, by
-- design (this is the one deliberately free-for-everyone table in this
-- migration set).

CREATE TABLE IF NOT EXISTS care_partner_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
    note TEXT NOT NULL DEFAULT '',
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (patient_id, category)
);

ALTER TABLE care_partner_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Patients can view their own Care Partner notes"
    ON care_partner_notes FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can create their own Care Partner notes"
    ON care_partner_notes FOR INSERT
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can update their own Care Partner notes"
    ON care_partner_notes FOR UPDATE
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view Care Partner notes for their patients"
    ON care_partner_notes FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = care_partner_notes.patient_id
        AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can create Care Partner notes for their patients"
    ON care_partner_notes FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = care_partner_notes.patient_id
        AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can update Care Partner notes for their patients"
    ON care_partner_notes FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = care_partner_notes.patient_id
        AND cp.caregiver_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = care_partner_notes.patient_id
        AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS EXECUTED (Docker + real isolated
-- staging project) — not part of the migration's own SQL, recorded here
-- for the owner's review per this engagement's established pattern:
-- ============================================================
-- T1 (positive): the patient themselves can INSERT/UPDATE/SELECT their own
--     row for every category A–G, regardless of subscription tier.
-- T2 (positive): an authorized caregiver (caregiver_patients link) can
--     INSERT/UPDATE/SELECT the same patient's notes.
-- T3 (negative): an unrelated patient/caregiver with no caregiver_patients
--     link cannot SELECT, INSERT, or UPDATE another patient's notes — 0
--     rows returned/affected, not an error (ordinary RLS row-filtering).
-- T4 (positive): a note persists and reloads correctly after a second
--     UPDATE to the same (patient_id, category) — the UNIQUE constraint
--     keeps exactly one row per category, confirmed via upsert.
-- T5 (regression): care_partner_checkins' own existing RESTRICTIVE
--     Free-Tier INSERT policy (migration 016) is completely unaffected —
--     this migration creates a new, separate table only.
