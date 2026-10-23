-- Codex MMA-CODEX-09 — database concurrency defects.
--
-- CONFIRMED DEFECT (1 of 2) — concurrent official care-plan
-- replacement: record_patient_care_plan() (migration 076) computed
-- the next version via a plain `SELECT max(version)+1` and superseded
-- the prior current plan via a plain UPDATE, with no lock of any
-- kind. Two professional staff concurrently recording a new plan for
-- the SAME patient could both compute the SAME next version number and
-- both insert with is_current=true — leaving two simultaneously
-- "current" plans for one patient, an invariant this table's own
-- design depends on holding.
--
-- Fix, two layers (durable invariant + correct serialized behavior,
-- not merely a crash on conflict):
-- (1) a partial unique index makes "more than one current plan per
--     patient" structurally impossible at the database level,
--     regardless of which code path writes the row;
-- (2) the RPC takes a per-patient advisory transaction lock before
--     computing the next version, so a second concurrent caller
--     cleanly waits for the first to commit and then sees the correct,
--     already-incremented version — a normal sequential outcome, not
--     a raw unique-violation error for whichever caller loses the race.
CREATE UNIQUE INDEX IF NOT EXISTS patient_care_plans_one_current_per_patient
  ON patient_care_plans (patient_id) WHERE is_current = true;

CREATE OR REPLACE FUNCTION public.record_patient_care_plan(
  p_patient_id UUID, p_goals TEXT, p_permitted_tasks TEXT DEFAULT NULL, p_effective_date DATE DEFAULT CURRENT_DATE
) RETURNS patient_care_plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row patient_care_plans; v_next_version INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may author or supersede a care plan';
  END IF;
  IF btrim(COALESCE(p_goals, '')) = '' THEN RAISE EXCEPTION 'Care plan goals are required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('patient_care_plans:' || p_patient_id::text, 0));

  SELECT COALESCE(max(version), 0) + 1 INTO v_next_version FROM patient_care_plans WHERE patient_id = p_patient_id;
  UPDATE patient_care_plans SET is_current = false WHERE patient_id = p_patient_id AND is_current = true;
  INSERT INTO patient_care_plans (patient_id, goals, permitted_tasks, effective_date, version, author_id, is_current)
  VALUES (p_patient_id, p_goals, p_permitted_tasks, p_effective_date, v_next_version, auth.uid(), true)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_patient_care_plan(UUID, TEXT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_care_plan(UUID, TEXT, TEXT, DATE) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_patient_care_plan(UUID, TEXT, TEXT, DATE) FROM anon;

-- CONFIRMED DEFECT (2 of 2) — duplicate open lifecycle requests:
-- account_deletion_requests (migration 088) prevented a duplicate via
-- an application-level `IF EXISTS (...) THEN RAISE EXCEPTION` check in
-- request_account_deletion(), with no database-level backstop. Two
-- concurrent calls from the same account could both pass that check
-- (reading no existing open request) before either INSERT commits,
-- producing two simultaneously open deletion requests for one account
-- — the exact "duplicate open lifecycle requests" scenario this
-- finding names. A partial unique index makes this structurally
-- impossible regardless of the application-level check's own timing.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_open_per_user
  ON account_deletion_requests (target_user_id) WHERE status IN ('requested', 'under_review');
