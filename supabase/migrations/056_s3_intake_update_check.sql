-- S3 — patient_intake UPDATE association protection (Senior Architect
-- Execution Contract, Section 4).
--
-- CONFIRMED EXPLOITABLE, live-tested against a disposable fixture row
-- (cleaned up immediately after): "Patients and caregivers can update
-- their own intake record" had a USING clause but no explicit WITH
-- CHECK. Postgres then reuses USING as the check for UPDATE — but USING
-- is `created_by = auth.uid() OR patient_profile_id = auth.uid() OR
-- caregiver_profile_id = auth.uid()`, and a caregiver retargeting
-- ONLY patient_profile_id leaves created_by/caregiver_profile_id
-- unchanged, so the reused check still passed regardless of what the
-- NEW patient_profile_id became. Reproduced: a caregiver successfully
-- updated their own intake row's patient_profile_id to point at a
-- completely unrelated, real patient id they have no caregiver_patients
-- link to at all.
--
-- Adds an explicit WITH CHECK that keeps the original three-way
-- ownership condition (so every currently-working legitimate update
-- path — including a caregiver later claiming/linking an originally
-- anonymous intake row via caregiver_profile_id, where created_by can
-- legitimately be NULL — still passes) and additionally requires that
-- IF patient_profile_id is being set to a specific value, it must be
-- the caller's own id or a patient they are actually linked to via
-- caregiver_patients — exactly the same relationship rule the INSERT
-- policy already enforces, now also enforced on UPDATE.

DROP POLICY IF EXISTS "Patients and caregivers can update their own intake record" ON patient_intake;

CREATE POLICY "Patients and caregivers can update their own intake record"
ON patient_intake
FOR UPDATE
TO public
USING (created_by = auth.uid() OR patient_profile_id = auth.uid() OR caregiver_profile_id = auth.uid())
WITH CHECK (
  (created_by = auth.uid() OR patient_profile_id = auth.uid() OR caregiver_profile_id = auth.uid())
  AND (
    patient_profile_id IS NULL
    OR patient_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = patient_intake.patient_profile_id AND cp.caregiver_id = auth.uid())
  )
);
