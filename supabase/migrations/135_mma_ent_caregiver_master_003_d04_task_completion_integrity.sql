-- MMA-ENT-CAREGIVER-MASTER-003, D04 (P1) — "Task completion integrity."
-- Independent runtime audit (MMA_ENT_CAREGIVER_MASTER_002_RUNTIME_AUDIT.md,
-- finding D04 / W02): three confirmed defects, all in the same column:
--
--  1. completed_at was a plain, client-settable column. An ordinary
--     authenticated UPDATE to an already-assigned task was accepted
--     with completed_at='2000-01-01' -- migration 125's
--     enforce_task_status_actor() trigger (BEFORE INSERT OR UPDATE on
--     tasks) already forces status_updated_by/status_updated_at to the
--     real caller/now(), but never touched completed_at at all, so that
--     protection simply didn't cover this column.
--  2. The patient-record TasksTab's own markStatus() (a SEPARATE code
--     path from the workspace Dashboard's markStatus()) never sent
--     completed_at in its UPDATE at all -- marking a task "Done" from
--     the patient record left completed_at NULL even on a legitimate,
--     correctly-authorized completion, while the SAME action from the
--     workspace Dashboard correctly set it. Two UIs, two different
--     outcomes for the identical action.
--  3. There was no way to return a task to its "Not Completed" state
--     once addressed -- H08/W02/N04's own locked requirement text
--     ("Completed, Declined, Not Completed or Not Applicable") names
--     four distinct outcomes; only three had a clickable control
--     (Completed/Declined/N-A). 'pending' already IS the "Not
--     Completed" status value (both dashboards already label it that
--     way) -- it was simply never offered as something a caregiver
--     could explicitly SELECT, only ever a default nobody had touched
--     yet.
--
-- This migration fixes #1 for both dashboards at once (there is no
-- longer anywhere for a client-supplied completed_at to go): extends
-- enforce_task_status_actor() so completed_at is ALWAYS server-derived
-- from the SAME real status transition status_updated_at already
-- re-derives, never trusted from the client, on INSERT and UPDATE
-- alike. #2 is fixed for free the moment this lands, since the trigger
-- now sets completed_at correctly regardless of what any call site
-- sends or omits. #3 is a UI-only fix in the same commit (both
-- markStatus() call sites gain an explicit "Not Completed" control).
CREATE OR REPLACE FUNCTION public.enforce_task_status_actor()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NOT NULL THEN
      NEW.status_updated_by := auth.uid();
      NEW.status_updated_at := now();
    END IF;
    NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_by := auth.uid();
    NEW.status_updated_at := now();
    -- A genuine NEW transition into 'completed' always gets the real
    -- current moment; transitioning to anything else always clears a
    -- previous completion's timestamp rather than letting a stale one
    -- survive a later "actually, Declined" correction.
    NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN now() ELSE NULL END;
  ELSE
    -- No real status change (e.g. only refusal_reason was edited) —
    -- preserve the existing, already-correct attribution/timestamp
    -- exactly as migration 125 already did for status_updated_by/at.
    NEW.status_updated_by := OLD.status_updated_by;
    NEW.status_updated_at := OLD.status_updated_at;
    NEW.completed_at := OLD.completed_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Trigger itself (migration 125) is unchanged — CREATE OR REPLACE
-- FUNCTION is sufficient since it already fires BEFORE INSERT OR UPDATE
-- on tasks for every row.
