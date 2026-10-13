-- 004_patient_self_access_core.sql
-- F03/F04/F05 (medications, medication_logs), F07 (mood_entries, tasks),
-- F11 (tasks). NOT gated on a named SEC-* dependency in the work order —
-- unlike F06 (see 005_memories_patient_self_access_PENDING_SEC-003.sql).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- Root cause (see MyMemoria_Functional_Remediation_001/_audit_group_A.md):
-- every RLS policy in the tracked 001 migration on these tables is gated on
-- `EXISTS (... caregiver_patients cp ... cp.caregiver_id = auth.uid())`.
-- There is no policy letting a patient read/write their OWN rows. The app
-- is patient-only (CLAUDE.md), and patients created via
-- patientService.createPatient() have `patients.id = auth.uid()` by
-- construction (the same id returned from auth.signUp is used as both the
-- auth user id and the patients.id — patientService.ts:112,128 in the
-- pre-remediation code). These policies key off that invariant. They are
-- ADDITIVE (alongside the existing caregiver policies, not replacing them)
-- and use the least-privilege shape the work order requires: ownership by
-- exact id/patient_id match, never a broad grant.

-- medications: needed for F03/F04 (patients must be able to read their own
-- medications, not just caregivers).
DO $$ BEGIN
  CREATE POLICY "Patients can view their own medications"
    ON medications FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can manage their own medications"
    ON medications FOR ALL
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- medication_logs: needed for F04 (log own dose). Deliberately SELECT +
-- INSERT only — no UPDATE/DELETE policy is added here. Reversal is the
-- undo_medication_dose() SECURITY DEFINER RPC from 003_medication_integrity.sql,
-- not a direct grant, per the work order's "never grant blanket UPDATE/DELETE".
DO $$ BEGIN
  CREATE POLICY "Patients can view their own medication logs"
    ON medication_logs FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can create their own medication logs"
    ON medication_logs FOR INSERT
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tasks: needed for F07 and F11 (PatientRoutine.handleAppTaskComplete now
-- persists to this table and needs patient-self UPDATE).
DO $$ BEGIN
  CREATE POLICY "Patients can view their own tasks"
    ON tasks FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can update their own tasks"
    ON tasks FOR UPDATE
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- mood_entries: needed for F07 (PatientMoodTracker.submitMood).
DO $$ BEGIN
  CREATE POLICY "Patients can view their own mood entries"
    ON mood_entries FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can create their own mood entries"
    ON mood_entries FOR INSERT
    WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- patients table itself: a logged-in patient needs to be able to read (and,
-- for profile-editing flows, update) their own row — the tracked 001
-- migration's `patients` policies are caregiver-only (lines 91-124), with no
-- self clause, which would block PatientLayout's own profile reads today if
-- live RLS matches tracked RLS.
DO $$ BEGIN
  CREATE POLICY "Patients can view their own patient record"
    ON patients FOR SELECT
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Patients can update their own patient record"
    ON patients FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
