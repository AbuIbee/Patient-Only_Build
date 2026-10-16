-- 021_patient_intake_self_access_and_schema_gaps.sql
-- MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 1.4 + PHASE 4.2 — three
-- concrete defects found while tracing every `patient_intake` call site
-- against 009_patient_intake.sql's tracked schema.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- EVIDENCE: 009_patient_intake.sql's `patient_intake` was built ONLY for
-- the public, unauthenticated intake form (/patient-intake —
-- publicPatientIntakeService.ts, anon INSERT) plus admin review
-- (SELECT/UPDATE for role IN ('admin','superadmin')). But four separate,
-- confirmed AUTHENTICATED call sites also depend on this same table for
-- their OWN record:
--   - src/pages/patient/PatientIntakeForm.tsx (the logged-in patient's own
--     self-service intake form) — select/update/upsert by
--     patient_profile_id = auth.uid().
--   - src/pages/patient/PatientProfileSetup.tsx — select/upsert by the
--     same column, same caller.
--   - src/services/patientIntakeService.ts's createPatientIntake() — an
--     authenticated caregiver/patient inserting with created_by =
--     caregiver_profile_id = auth.uid().
--   - src/pages/patient/PatientLayout.tsx's own intake-completion check
--     (`select('intake_completed').eq('patient_profile_id', ...)`), which
--     drives the "Complete Your Profile" reminder popup shown to every
--     patient.
-- None of these has ANY RLS path under the tracked schema: the only
-- SELECT/UPDATE policies are admin-only, there is no `authenticated`
-- INSERT policy at all (the one INSERT policy is `TO anon` specifically),
-- and `intake_completed` is not a column 009 ever creates at all —
-- PatientIntakeForm.tsx's own header comment claims to track completion
-- via it regardless. Confirmed via `grep -rn "from('patient_intake')"
-- src/` across every call site above. Under the tracked schema alone, a
-- logged-in patient's own intake self-service is completely non-
-- functional, and the dashboard's intake-completion reminder can never
-- resolve to true for anyone.

-- ============================================================
-- 1. intake_completed — missing column, additive
-- ============================================================
ALTER TABLE patient_intake
  ADD COLUMN IF NOT EXISTS intake_completed BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. Self/caregiver access — the admin-only and anon-only policies left no
--    path for the record's OWN patient or caregiver
-- ============================================================
-- `created_by` is set to auth.uid() by EVERY confirmed authenticated
-- insert call site (createPatientIntake(), PatientIntakeForm.tsx,
-- PatientProfileSetup.tsx) — the single reliable "this caller owns this
-- row" signal regardless of which of the two profile-id columns is
-- populated (patient_profile_id is null for a caregiver-initiated intake
-- until a later backfill; caregiver_profile_id is null for a patient's
-- own self-service submission). `patient_profile_id`/`caregiver_profile_id`
-- are included too so a row backfilled or reassigned after creation (the
-- "Back-fill intake with the new patient's profile id" UPDATE in
-- patientIntakeService.ts createAndProvisionPatient()) is still reachable
-- by the patient it now actually belongs to, not just by whoever
-- originally created it.
DO $$ BEGIN
  CREATE POLICY "Patients and caregivers can view their own intake record"
    ON patient_intake FOR SELECT
    USING (
      created_by = auth.uid()
      OR patient_profile_id = auth.uid()
      OR caregiver_profile_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Separate, `authenticated`-scoped INSERT policy — does not touch or
-- widen the existing `TO anon` public-form policy from 009, which keeps
-- applying only to the anonymous role exactly as before.
DO $$ BEGIN
  CREATE POLICY "Authenticated patients and caregivers can create their own intake record"
    ON patient_intake FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients and caregivers can update their own intake record"
    ON patient_intake FOR UPDATE
    USING (
      created_by = auth.uid()
      OR patient_profile_id = auth.uid()
      OR caregiver_profile_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. UNIQUE(patient_profile_id) — required for the two confirmed
--    `.upsert(..., { onConflict: 'patient_profile_id' })` call sites
--    (PatientIntakeForm.tsx, PatientProfileSetup.tsx) to work AT ALL
-- ============================================================
-- Postgres raises "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" for an upsert naming a column with no
-- matching unique constraint — neither call site's upsert could ever
-- have succeeded under the tracked schema. NULL values are unaffected by
-- a UNIQUE constraint (multiple NULLs are always allowed), so the
-- caregiver-initiated rows that legitimately have
-- `patient_profile_id IS NULL` until backfilled are not blocked by this.
DO $$ BEGIN
  ALTER TABLE patient_intake
    ADD CONSTRAINT patient_intake_patient_profile_id_unique UNIQUE (patient_profile_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- BLOCKERS (explicitly reported, not resolved by this file)
-- ============================================================
-- 1. If any TWO existing rows already share a non-null
--    `patient_profile_id` (impossible to confirm without a live database),
--    the UNIQUE constraint above would fail to apply — the DO block's
--    `duplicate_object` handler does not catch that case (Postgres raises
--    `unique_violation`, a different SQLSTATE, when existing data
--    violates a new constraint, not `duplicate_object`). This migration
--    does not attempt to de-duplicate or delete any row to force the
--    constraint through — that would be exactly the kind of destructive,
--    unreviewed data operation this engagement avoids. If this
--    constraint fails to apply for that reason, the exact duplicate rows
--    need owner review before it can be added.
--
-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (positive): patient P (role='patient') calls
--   `select intake_completed from patient_intake where
--   patient_profile_id = auth.uid()` for their own prior submission.
--   Expected: returns their row (previously zero rows under the tracked
--   schema).
-- T2 (positive): patient P upserts their own intake record via
--   `.upsert(..., { onConflict: 'patient_profile_id' })` with
--   `patient_profile_id = auth.uid()`, `created_by = auth.uid()`.
--   Expected: succeeds, no ON CONFLICT error, exactly one row for P
--   afterward even if called twice.
-- T3 (negative, cross-account isolation): patient P attempts to select or
--   update a DIFFERENT patient Q's intake row (by id). Expected: denied —
--   none of P's auth.uid() matches any of Q's created_by/
--   patient_profile_id/caregiver_profile_id columns.
-- T4 (positive, admin regression unaffected): an admin's existing
--   SELECT/UPDATE access (009's own policies) is untouched by this file —
--   confirm an admin can still review/update any submission.
-- T5 (positive, anon regression unaffected): the public, unauthenticated
--   /patient-intake form's anon INSERT still succeeds exactly as before —
--   this file adds a SEPARATE `TO authenticated` INSERT policy, it does
--   not touch the `TO anon` one.
-- T6 (regression — existing rows preserved): row-count/id-set snapshot
--   for `patient_intake` before/after. Expected: identical, unless the
--   UNIQUE constraint fails to apply per blocker 1 above, in which case
--   this migration still adds no row and deletes no row either way.
