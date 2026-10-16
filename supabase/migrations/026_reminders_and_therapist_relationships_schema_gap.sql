-- 026_reminders_and_therapist_relationships_schema_gap.sql
-- MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 / Phase A+B.
--
-- PROPOSAL ONLY — NOT EXECUTED. Written against live-schema evidence
-- (MyMemoria_Production_Audit/04_SUPABASE_SECURITY_AND_SCHEMA.md's full
-- 29-table production catalog) plus this repo's own generated client types
-- (src/types/supabase.ts), not a live connection from this file itself.
--
-- GAP: two tables the application reads/writes have no tracked migration
-- anywhere in 001-025, and the production audit's full table catalog
-- confirms both are genuinely absent from production (neither appears in
-- its 29-table list) — this is not a "guessed name" situation, it is a
-- confirmed hole:
--   1. `reminders` — read by src/pages/patient/PatientLayout.tsx
--      (`.from('reminders').select('id, patient_id, title, message, type,
--      time, days_of_week, is_active, sound, vibrate, created_at,
--      created_by').eq('patient_id', patientId).eq('is_active',
--      true).limit(100)`), dispatched into AppContext state, and consumed
--      by PatientReminders.tsx's calendar/notification-sync UI. No tracked
--      write path exists anywhere in src/ — this table is read-only from
--      the application's own perspective today, so this migration grants
--      no INSERT/UPDATE/DELETE policy beyond the patient's own row (there
--      is no confirmed caller needing more, and inventing a write UI is out
--      of scope).
--   2. `therapist_relationships` — read by src/pages/patient/
--      PatientCareTeam.tsx (`.from('therapist_relationships').select(
--      'therapist_id, relationship_type, is_active').eq('patient_id',
--      patientId).eq('is_active', true)`, the patient's own "my care team"
--      screen) and by src/services/patientService.ts's
--      getTherapistPatients()/assignTherapistToPatient()/
--      removeTherapistFromPatient()/getPatientTherapists() — all backend
--      service functions with NO confirmed UI caller anywhere in src/pages
--      (grep -rn "getTherapistPatients|assignTherapistToPatient|
--      removeTherapistFromPatient|getPatientTherapists" src/pages — zero
--      hits). Per MYMEMORIA-GITHUB-SUPABASE-COMPAT-001's explicit
--      instruction not to treat dormant backend functionality as a working
--      frontend capability, this migration creates the table and the
--      SAME-SHAPED policies every other caregiver-linked table in this
--      schema already uses (read: migrations 001-025's own "Caregivers can
--      view/manage X for their patients" pattern, and the production
--      audit's own confirmed policy-naming convention for sibling tables)
--      — not because a caregiver/therapist UI is being added here, but
--      because PatientCareTeam.tsx's READ-ONLY query is a genuinely
--      reachable, currently-broken (table-does-not-exist) path that must
--      work once this ships, and the table must support the SAME
--      authorization shape every sibling patient-data table already has
--      so a future, separately-approved caregiver/therapist UI is not
--      blocked by a table built narrower than its neighbors. No new RPC,
--      no new admin/caregiver UI screen is added by this file.
--
-- Column shapes below match src/types/supabase.ts exactly (the generated
-- client types this engagement already produced from confirmed application
-- read/write evidence), not a fresh guess.

-- ============================================================
-- 1. reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  title         TEXT,
  message       TEXT,
  type          TEXT,
  time          TEXT,
  days_of_week  INTEGER[],
  is_active     BOOLEAN DEFAULT true,
  sound         TEXT,
  vibrate       BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Same shape as every other `<patient-data>` table in this schema: the
-- patient reads/manages their own row directly (CLAUDE.md: "built for
-- patients only" — the live, confirmed call site is always
-- patient_id = the logged-in patient's own id), and a linked caregiver may
-- read/manage on the patient's behalf, matching e.g. medications'
-- "Caregivers can view/manage medications for their patients" policies.
DO $$ BEGIN
  CREATE POLICY "Patients can view their own reminders"
    ON reminders FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can manage their own reminders"
    ON reminders FOR ALL
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view reminders for their patients"
    ON reminders FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = reminders.patient_id AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can manage reminders for their patients"
    ON reminders FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = reminders.patient_id AND cp.caregiver_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = reminders.patient_id AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. therapist_relationships
-- ============================================================
CREATE TABLE IF NOT EXISTS therapist_relationships (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  therapist_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id        UUID REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  relationship_type TEXT NOT NULL DEFAULT 'primary'
                      CHECK (relationship_type IN ('primary', 'consulting', 'supervising', 'secondary')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE therapist_relationships ENABLE ROW LEVEL SECURITY;

-- Patient's own read access — the one confirmed live consumer
-- (PatientCareTeam.tsx's read-only "my care team" screen).
DO $$ BEGIN
  CREATE POLICY "Patients can view their own therapist relationships"
    ON therapist_relationships FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Therapist's own read access — matches getTherapistPatients()'s existing
-- `.eq('therapist_id', therapistId)` query shape (dormant UI-wise, but the
-- service function's own authorization expectation already assumes this).
DO $$ BEGIN
  CREATE POLICY "Therapists can view their own relationships"
    ON therapist_relationships FOR SELECT
    USING (therapist_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Caregiver manages the relationship on their patient's behalf — same
-- authorization shape as every other caregiver-linked table in this
-- schema (e.g. care_team_members' "Caregivers can manage care team").
-- assignTherapistToPatient()/removeTherapistFromPatient() already assume
-- this; no UI currently calls them, but the policy itself is not new
-- authorization — it mirrors every sibling table's established pattern.
DO $$ BEGIN
  CREATE POLICY "Caregivers can manage therapist relationships for their patients"
    ON therapist_relationships FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = therapist_relationships.patient_id AND cp.caregiver_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = therapist_relationships.patient_id AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin bypass, matching the established inline EXISTS pattern used
-- throughout 009-024 (not a helper-function name, since neither this
-- engagement's local migrations nor this file can confirm whether
-- production's real `is_admin_check()` helper or this project's own
-- `is_admin()` (024) is the one actually safe to depend on here).
DO $$ BEGIN
  CREATE POLICY "Admins can view all therapist relationships"
    ON therapist_relationships FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- STAGING-ONLY VERIFICATION (described for the owner/ChatGPT to run against
-- the isolated staging project; NOT executed by this migration file)
-- ============================================================
-- V1: after applying, `SELECT * FROM reminders LIMIT 1` and `SELECT * FROM
--   therapist_relationships LIMIT 1` as a service-role/owner connection
--   succeed (tables exist, zero rows expected on a clean staging DB).
-- V2 (positive): synthetic patient A inserts a synthetic reminder row with
--   patient_id = A's own id (as A). Expected: succeeds. A reads it back via
--   the exact PatientLayout.tsx query shape. Expected: one row returned.
-- V3 (negative): synthetic patient B (unrelated to A) attempts
--   `SELECT * FROM reminders WHERE patient_id = '<A>'`. Expected: zero rows
--   (RLS filters it out, not an error — PostgREST SELECT policies filter,
--   they do not raise).
-- V4 (positive): a caregiver C linked to patient A via caregiver_patients
--   reads A's reminders. Expected: rows returned.
-- V5/V6: identical V2-V4 shape for therapist_relationships using the
--   patient's own SELECT and a linked caregiver's manage access; a
--   synthetic therapist T may additionally confirm `SELECT * FROM
--   therapist_relationships WHERE therapist_id = auth.uid()` returns only
--   T's own rows.
