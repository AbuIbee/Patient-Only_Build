-- MMA-P1-FINAL-CLOSURE — corrective fix for a real regression introduced
-- by migration 154 (already pushed; not rewritten in place, per this
-- repository's own established convention of never rewriting an applied
-- migration — see migration 147's identical precedent against migration
-- 039). Migration 154 added four new PERMISSIVE SELECT policies
-- (medications/appointments/caregiver_visits/tasks, keyed on
-- has_patient_access()) with no `TO` clause, which defaults to PUBLIC —
-- every role, including `anon`.
--
-- CONFIRMED REAL REGRESSION this session: migration 106's own
-- established lesson (re-scope every policy touching these functions to
-- `TO authenticated`, never leave it PUBLIC) was not followed here.
-- `anon` has no EXECUTE grant on has_patient_access() — a plain
-- unauthenticated REST read of any of these four tables now raises a
-- hard 42501 permission error instead of the correct empty-result
-- behavior every other table in this schema (post-migration-106) gives
-- an anonymous caller. Reproduced directly: `SET ROLE anon; SELECT 1
-- FROM medications;` -- confirmed to fail identically before this fix.
--
-- `TO authenticated` does not change which AUTHENTICATED caller sees
-- which rows at all — it only changes how an unauthenticated caller is
-- denied (correct empty result, not an error), exactly migration 106's
-- own precedent.
DROP POLICY IF EXISTS "has_patient_access covers medications (APR/Owner/staff, migration 154)" ON medications;
CREATE POLICY "has_patient_access covers medications (APR/Owner/staff, migration 154)"
  ON medications FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));

DROP POLICY IF EXISTS "has_patient_access covers appointments (APR/Owner/staff, migration 154)" ON appointments;
CREATE POLICY "has_patient_access covers appointments (APR/Owner/staff, migration 154)"
  ON appointments FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));

DROP POLICY IF EXISTS "has_patient_access covers caregiver_visits (APR/Owner/staff, migration 154)" ON caregiver_visits;
CREATE POLICY "has_patient_access covers caregiver_visits (APR/Owner/staff, migration 154)"
  ON caregiver_visits FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));

DROP POLICY IF EXISTS "has_patient_access covers tasks (APR/Owner/staff, migration 154)" ON tasks;
CREATE POLICY "has_patient_access covers tasks (APR/Owner/staff, migration 154)"
  ON tasks FOR SELECT TO authenticated
  USING (public.has_patient_access(patient_id));
