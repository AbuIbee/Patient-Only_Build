-- S2 — non-destructive registration cancellation / deletion lifecycle
-- fencing (Senior Architect Execution Contract, Section 2).
--
-- The existing deletion lock (migration 049) is a plain timestamp:
-- caregiver_begin_registration_deletion sets deletion_locked_at = now();
-- caregiver_finish_registration_deletion only checks
-- `deletion_locked_at IS NOT NULL`. That check is not bound to a
-- specific lock-acquisition event — a delayed finish/cancel call from an
-- earlier, now-stale attempt (one that already exceeded the 2-minute
-- staleness window and had its lock superseded by a second,
-- independent begin call) could still succeed against whichever lock
-- happens to be set when it finally arrives, rather than being rejected
-- as belonging to a different operation. For this specific pair of
-- operations the end state is the same either way (both callers want
-- the registration deleted), so this was not an exploitable data-
-- integrity bug, but it is exactly the ambiguity a fencing token
-- exists to remove, and is tightened here as hardening rather than in
-- response to a reproduced exploit.
--
-- Adds deletion_operation_id, a fresh server-generated UUID written by
-- begin and required (exact match, never trusted from a stale caller)
-- by finish and cancel. A late call from a superseded operation is now
-- rejected outright rather than silently acting on whatever lock
-- happens to be current.

ALTER TABLE pending_caregiver_registrations
  ADD COLUMN IF NOT EXISTS deletion_operation_id UUID;

CREATE OR REPLACE FUNCTION public.caregiver_begin_registration_deletion(p_registration_id uuid)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
  v_op_id UUID := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid()
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration has already been claimed and linked to a patient record — it cannot be deleted this way';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL AND v_reg.deletion_locked_at > now() - INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'A deletion is already in progress for this registration';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_locked_at = now(), deletion_operation_id = v_op_id
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.caregiver_finish_registration_deletion(p_registration_id uuid, p_operation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'An operation id is required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND caregiver_id = auth.uid()
    AND consumed_at IS NULL
    AND deletion_locked_at IS NOT NULL
    AND deletion_operation_id = p_operation_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No matching in-progress deletion found for this registration and operation id — it may have been superseded by a newer attempt, already finished, or never begun';
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.caregiver_cancel_registration_deletion_lock(p_registration_id uuid, p_operation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'An operation id is required';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_locked_at = NULL, deletion_operation_id = NULL
  WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL
    AND deletion_operation_id = p_operation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'No matching in-progress deletion found for this registration and operation id — it may have already been superseded, finished, or cancelled';
  END IF;

  RETURN true;
END;
$function$;
