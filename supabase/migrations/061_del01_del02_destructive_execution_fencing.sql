-- DEL-01/DEL-02 — a point-of-no-return state for destructive Auth
-- deletion, and trusted-only finalization (Codex-confirmed P0/P1).
--
-- CONFIRMED DEFECT (traced through the existing code, not reproduced
-- against a real Auth account — see the final report for why): between
-- caregiver_begin_registration_deletion() (which returns a fencing
-- operation id) and the Edge Function's actual, external
-- adminClient.auth.admin.deleteUser() call, nothing in the database
-- prevents a legitimate caregiver_cancel_registration_deletion_lock()
-- call (using that same, still-valid operation id) from clearing
-- deletion_locked_at — which immediately reopens the registration for
-- caregiver_claim_new_patient() (that function's only protection is
-- `deletion_locked_at IS NOT NULL`, which cancel just cleared). If a
-- real claim then succeeds (creating a genuine patients row +
-- caregiver_patients link for that same provisioned Auth user id)
-- WHILE the original worker's already-in-flight, already-dispatched
-- deleteUser() HTTP call is still pending (slow network, Edge Function
-- scheduling delay, etc.), that worker's deletion still executes when
-- it finally resolves — destroying a now-legitimately-claimed Auth
-- account. The existing fencing (migration 055) correctly prevents the
-- REGISTRATION ROW from being incorrectly removed by the stale worker
-- (caregiver_finish_registration_deletion's operation-id check would
-- reject it), but that is cold comfort once the Auth account itself is
-- already gone.
--
-- Fix: a new, explicit, irreversible "destructive execution
-- authorized" transition, committed to the database BEFORE the Edge
-- Function may make the external deleteUser() call. Once set:
--   - cancel is permanently refused for that operation (no path back
--     to a claimable state once destructive execution has been
--     authorized — Codex's own stated invariant).
--   - a NEW begin is refused regardless of lock staleness (a timeout
--     must not be read as "the external action did not happen").
-- A second new RPC records the actual, resolved external outcome
-- (confirmed_deleted, or requires_manual_review for anything else —
-- an error, a timeout, an ambiguous result). finish() now additionally
-- requires deletion_outcome = 'confirmed_deleted', closing DEL-02's
-- "ordinary clients cannot forge completion" requirement structurally:
-- finish can never succeed unless a trusted, operation-id-bound outcome
-- was already recorded through the one RPC that itself requires
-- destructive execution to have already been authorized.
--
-- Protected-account precondition (DEL-02 §4.1): consumed_at IS NULL is
-- already the complete predicate for "this registration is safe to
-- destructively delete" in this schema, by construction — patients,
-- caregiver_patients, therapist_relationships and every clinical table
-- are foreign-keyed to patients.id, and the ONLY code path that ever
-- creates a patients row for a given id also atomically sets
-- consumed_at on the registration in the same operation
-- (caregiver_claim_new_patient). There is no other way for a
-- provisioned Auth user to have acquired a protected relationship while
-- consumed_at is still NULL. This migration adds an explicit, redundant
-- defensive check anyway (authorize_destructive_deletion independently
-- re-verifies no patients row exists for the provisioned id) rather
-- than relying solely on that reasoning.

ALTER TABLE pending_caregiver_registrations
  ADD COLUMN IF NOT EXISTS deletion_destructive_authorized_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deletion_outcome TEXT
    CHECK (deletion_outcome IS NULL OR deletion_outcome IN ('confirmed_deleted', 'requires_manual_review'));

-- begin(): additionally refuses, regardless of staleness, once
-- destructive execution has been authorized and not yet reconciled —
-- an unresolved worker must not coexist with a state that would let a
-- second, competing operation start.
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
  IF v_reg.deletion_destructive_authorized_at IS NOT NULL AND v_reg.deletion_outcome IS NULL THEN
    RAISE EXCEPTION 'A previous deletion attempt for this registration reached an unresolved state and requires administrator reconciliation before any new attempt can begin';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL AND v_reg.deletion_locked_at > now() - INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'A deletion is already in progress for this registration';
  END IF;

  UPDATE pending_caregiver_registrations SET
    deletion_locked_at = now(), deletion_operation_id = v_op_id,
    deletion_destructive_authorized_at = NULL, deletion_outcome = NULL
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$function$;

-- NEW: the point-of-no-return. Called by the Edge Function AFTER begin
-- and BEFORE the external deleteUser() call — committed to the
-- database first, so a concurrent cancel/claim attempt is serialized
-- against this exact transition via the row lock and must observe it.
CREATE OR REPLACE FUNCTION public.caregiver_authorize_destructive_deletion(p_registration_id uuid, p_operation_id uuid)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'An operation id is required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid()
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration has already been claimed — destructive deletion cannot be authorized';
  END IF;
  IF v_reg.deletion_locked_at IS NULL OR v_reg.deletion_operation_id IS DISTINCT FROM p_operation_id THEN
    RAISE EXCEPTION 'No matching in-progress deletion found for this registration and operation id';
  END IF;
  IF v_reg.deletion_destructive_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Destructive deletion was already authorized for this operation';
  END IF;

  -- Defensive, redundant re-check (see migration header): confirm no
  -- patients row exists for the provisioned id, independent of the
  -- consumed_at reasoning above.
  IF v_reg.provisioned_auth_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM patients WHERE id = v_reg.provisioned_auth_user_id) THEN
    RAISE EXCEPTION 'A patient record already exists for the provisioned account — destructive deletion cannot be authorized';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_destructive_authorized_at = now()
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$function$;

REVOKE ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) TO authenticated;

-- NEW: records the resolved external outcome. Requires destructive
-- execution to already be authorized for this exact operation — so
-- this can never be called "early" to forge a path around
-- authorization, and finish() below can never succeed without an
-- outcome recorded through here first.
CREATE OR REPLACE FUNCTION public.caregiver_record_deletion_outcome(p_registration_id uuid, p_operation_id uuid, p_outcome text)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_outcome NOT IN ('confirmed_deleted', 'requires_manual_review') THEN
    RAISE EXCEPTION 'Invalid deletion outcome: %', p_outcome;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid()
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.deletion_operation_id IS DISTINCT FROM p_operation_id THEN
    RAISE EXCEPTION 'No matching deletion operation found for this registration and operation id';
  END IF;
  IF v_reg.deletion_destructive_authorized_at IS NULL THEN
    RAISE EXCEPTION 'Destructive deletion was never authorized for this operation';
  END IF;
  IF v_reg.deletion_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'An outcome was already recorded for this operation';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_outcome = p_outcome
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$function$;

REVOKE ALL ON FUNCTION public.caregiver_record_deletion_outcome(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_record_deletion_outcome(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.caregiver_record_deletion_outcome(uuid, uuid, text) TO authenticated;

-- cancel(): now permanently refused once destructive execution has
-- been authorized — "a client cannot cancel it into a claimable
-- registration state."
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
    AND deletion_operation_id = p_operation_id
    AND deletion_destructive_authorized_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'No cancelable deletion found for this registration and operation id — it may have already been superseded, finished, cancelled, or already authorized for destructive execution and can no longer be cancelled';
  END IF;

  RETURN true;
END;
$function$;

-- finish(): now additionally requires a recorded, confirmed outcome —
-- an ordinary client can never forge completion merely by calling
-- finish with a valid-looking operation id; it also needs
-- deletion_outcome = 'confirmed_deleted', which only
-- record_deletion_outcome() can set, which itself requires destructive
-- execution to already be authorized.
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
    AND deletion_operation_id = p_operation_id
    AND deletion_destructive_authorized_at IS NOT NULL
    AND deletion_outcome = 'confirmed_deleted';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No matching, confirmed-deleted deletion operation found for this registration and operation id';
  END IF;

  RETURN true;
END;
$function$;

-- NEW: admin-only reconciliation for the "requires_manual_review"
-- blocked recovery state — never automated, since only a human
-- confirming the real Supabase Auth dashboard state can safely resolve
-- it. p_confirmed_deleted = true means an operator has independently
-- confirmed the Auth account is actually gone (safe to finish the
-- database cleanup); false means the operator confirmed the account
-- still exists and the whole deletion attempt should be abandoned,
-- restoring the registration to a normal, claimable state.
CREATE OR REPLACE FUNCTION public.admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may reconcile a stuck deletion operation';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.deletion_outcome IS DISTINCT FROM 'requires_manual_review' THEN
    RAISE EXCEPTION 'This registration is not in a state requiring manual reconciliation';
  END IF;

  IF p_confirmed_deleted THEN
    UPDATE pending_caregiver_registrations SET deletion_outcome = 'confirmed_deleted' WHERE id = p_registration_id;
    DELETE FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND consumed_at IS NULL AND deletion_outcome = 'confirmed_deleted';
  ELSE
    UPDATE pending_caregiver_registrations SET
      deletion_locked_at = NULL, deletion_operation_id = NULL,
      deletion_destructive_authorized_at = NULL, deletion_outcome = NULL
    WHERE id = p_registration_id;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id;
  RETURN v_reg;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reconcile_stuck_registration_deletion(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reconcile_stuck_registration_deletion(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_stuck_registration_deletion(uuid, boolean) TO authenticated;
