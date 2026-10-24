-- CODEX F-14 (P1, release-blocking) — "Residual clinical/task
-- attribution forgery." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-14,
-- target commit b362e119.
--
-- Confirmed by reading the actual code: migration 076's SEC-05 fix
-- (enforce_task_status_actor) only fires BEFORE UPDATE. status_
-- updated_by/status_updated_at (migration 071) are plain client-
-- settable columns; "Caregivers can manage tasks for their patients"
-- (migration 001) is a FOR ALL policy covering INSERT too, with no
-- WITH CHECK restricting these columns. A caregiver (or assigned
-- Enterprise staff) creating a brand-new task row directly -- never
-- going through an UPDATE at all -- could set status='completed',
-- status_updated_by=<anyone else's id>, and completed_at=<any
-- timestamp> all in the single INSERT, with no trigger ever
-- re-deriving them from the real caller. The audit trail SEC-05 built
-- never applied to a task's own creation, only to a later status
-- change.
--
-- Fix: the SAME trigger now ALSO fires BEFORE INSERT, applying the
-- identical rule -- status_updated_by/status_updated_at are always
-- forced to the real caller/now() whenever a row is inserted with a
-- non-NULL status already set (the normal case; every task has a
-- default status), and left NULL otherwise. No client-supplied value
-- for either column can ever reach storage on INSERT, exactly as
-- migration 076 already guaranteed on UPDATE.
CREATE OR REPLACE FUNCTION public.enforce_task_status_actor()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NOT NULL THEN
      NEW.status_updated_by := auth.uid();
      NEW.status_updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_by := auth.uid();
    NEW.status_updated_at := now();
  ELSE
    NEW.status_updated_by := OLD.status_updated_by;
    NEW.status_updated_at := OLD.status_updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_tasks_status_actor ON tasks;
CREATE TRIGGER trg_tasks_status_actor
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_status_actor();

-- Same class of defect, same finding (F-14 names both migrations
-- 076:346 and 079:122): enforce_patient_safety_plan_provenance()
-- (migration 079) correctly re-validates the professional-tier
-- authorization check on BOTH INSERT and UPDATE for code_status, but
-- only ever forces code_status_updated_by to the real caller `IF TG_OP
-- = 'UPDATE'` -- a professional (or, for communication_needs, ANYONE
-- at all) inserting a patient row with these fields already set could
-- forge who the attribution column names, and communication_needs on
-- INSERT had no authorization check or attribution forcing
-- whatsoever (the entire v_comm_touch block was `IF TG_OP = 'UPDATE'`
-- only).
CREATE OR REPLACE FUNCTION public.enforce_patient_safety_plan_provenance()
RETURNS TRIGGER AS $$
DECLARE
  v_code_status_touch BOOLEAN;
  v_comm_touch BOOLEAN;
BEGIN
  v_code_status_touch := TG_OP = 'INSERT' OR NEW.code_status IS DISTINCT FROM OLD.code_status OR NEW.code_status_source IS DISTINCT FROM OLD.code_status_source;
  IF v_code_status_touch THEN
    IF (
      NEW.code_status_source IN ('verified_source', 'professional_observation')
      OR (TG_OP = 'UPDATE' AND OLD.code_status_source IN ('verified_source', 'professional_observation'))
    ) AND NOT public.is_professional_staff_for_patient(NEW.id) THEN
      RAISE EXCEPTION 'Only an assigned therapist or medical professional may set or modify a verified code status';
    END IF;
    NEW.code_status_updated_by := auth.uid();
  END IF;

  v_comm_touch := TG_OP = 'INSERT' OR NEW.communication_needs IS DISTINCT FROM OLD.communication_needs OR NEW.communication_needs_source IS DISTINCT FROM OLD.communication_needs_source;
  IF v_comm_touch THEN
    IF (
      COALESCE(NEW.communication_needs_source, 'unknown') IN ('verified_source', 'professional_observation')
      OR (TG_OP = 'UPDATE' AND COALESCE(OLD.communication_needs_source, 'unknown') IN ('verified_source', 'professional_observation'))
    ) AND NOT public.is_professional_staff_for_patient(NEW.id) THEN
      RAISE EXCEPTION 'Only an assigned therapist or medical professional may record or modify a professionally-sourced communication need';
    END IF;
    NEW.communication_needs_updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
