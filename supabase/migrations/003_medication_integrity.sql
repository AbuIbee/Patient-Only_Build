-- 003_medication_integrity.sql
-- F03 (medication schedule), F04 (dose logging), F05 (undo dose).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.

-- ── F03: PatientMedications.tsx (handleSaveMed/mapRow, lines ~74,441,573-589) ──
-- ── reads/writes a `schedule` JSON array column directly on `medications`. ────
-- ── The tracked 001 migration models schedule via a separate               ────
-- ── `medication_schedules` child table instead. Chosen repair: keep the    ────
-- ── already-in-use JSONB-on-row shape (lowest migration risk, matches what ────
-- ── the shipped code already reads/writes); leave medication_schedules in  ────
-- ── place untouched (unknown consumers; do not drop per engineering        ────
-- ── discipline rules). ──────────────────────────────────────────────────────
ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS schedule JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── F04: PatientMedications.tsx:logDose upserts onConflict ────────────────
-- ── 'medication_id,date,scheduled_time' — this requires a matching         ────
-- ── UNIQUE/EXCLUDE constraint, which the tracked medication_logs table      ────
-- ── does not have (only a PK on id). Also needs medication_name, which the ────
-- ── code reads/writes (mapLogRow, logDose) but which isn't in the tracked  ────
-- ── schema either. ──────────────────────────────────────────────────────────
ALTER TABLE medication_logs
  ADD COLUMN IF NOT EXISTS medication_name TEXT;

DO $$ BEGIN
  ALTER TABLE medication_logs
    ADD CONSTRAINT medication_logs_dose_identity_unique
    UNIQUE (medication_id, date, scheduled_time);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── F05: undo dose. No blanket UPDATE/DELETE is granted — see the RLS note ──
-- ── below. Reversal goes through this SECURITY DEFINER RPC instead, which  ──
-- ── verifies the caller owns (as patient) or is an approved caregiver for  ──
-- ── the row, and performs a soft reversal (status -> 'pending' + an audit ──
-- ── trail) rather than a hard delete, per "maintain audit semantics" in   ──
-- ── the work order. ─────────────────────────────────────────────────────────
ALTER TABLE medication_logs
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS undone_by UUID REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION public.undo_medication_dose(
  p_medication_id UUID,
  p_date DATE,
  p_scheduled_time TEXT
) RETURNS void AS $$
DECLARE
  v_log medication_logs;
BEGIN
  SELECT * INTO v_log
  FROM medication_logs
  WHERE medication_id = p_medication_id
    AND date = p_date
    AND scheduled_time = p_scheduled_time
  FOR UPDATE;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'No matching dose log found';
  END IF;

  -- Ownership check performed explicitly here (this function runs as
  -- SECURITY DEFINER, bypassing RLS) rather than relying on a table-level
  -- UPDATE/DELETE grant, which the work order explicitly prohibits
  -- ("never grant blanket UPDATE/DELETE"). The patient-self clause mirrors
  -- 004_patient_self_access_rls.sql's ownership model
  -- (patients.id = auth.uid() for patients created via patientService.createPatient).
  IF NOT (
    v_log.patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id = v_log.patient_id AND cp.caregiver_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to undo this dose';
  END IF;

  UPDATE medication_logs
  SET status = 'pending',
      taken_time = NULL,
      undone_at = now(),
      undone_by = auth.uid()
  WHERE id = v_log.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.undo_medication_dose(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_medication_dose(UUID, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.undo_medication_dose IS 'F05: soft-reversal RPC; do not replace with a table-level UPDATE/DELETE grant on medication_logs.';
