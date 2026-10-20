-- ROUND 4 — separate request authority (A) from destructive-execution
-- authority (B) and outcome-attestation authority (C) for the
-- registration-deletion lifecycle (Codex-reproduced P0/P1).
--
-- CONFIRMED EXPLOIT CHAIN (traced through migration 061's grants, not
-- merely assumed): caregiver_authorize_destructive_deletion,
-- caregiver_record_deletion_outcome, and
-- caregiver_finish_registration_deletion were ALL granted to
-- `authenticated` — meaning the ordinary caregiver who owns a
-- registration could call every step of the "trusted" orchestration
-- directly via RPC, bypassing delete-pending-registration's Edge
-- Function sequencing entirely. Concretely: begin -> authorize ->
-- then call record_deletion_outcome() AS THE CALLER to fabricate
-- 'requires_manual_review' (or 'confirmed_deleted' outright) -> age
-- the lock -> begin a replacement operation (blocked by the Round 3
-- fix only because the FABRICATED outcome still left
-- deletion_outcome NOT NULL — an attacker fabricating
-- 'confirmed_deleted' directly skips that gate entirely and can
-- proceed straight to a forged finish) -> cancel the replacement ->
-- claim the registration — all while the ORIGINAL external
-- auth.admin.deleteUser() call (if actually dispatched by a genuine
-- Edge Function invocation) could still be in flight. The Round 3
-- fencing closed timing-based races; it never closed the fact that
-- the attestation step itself was directly callable by the party with
-- the strongest incentive to lie about its outcome.
--
-- FIX: capability B (caregiver_authorize_destructive_deletion) and
-- capability C (caregiver_record_deletion_outcome) are no longer
-- reachable by `authenticated` at all — REVOKE'd from PUBLIC, anon,
-- AND authenticated, GRANT'd to `service_role` only. The Edge Function
-- (the only holder of the service-role key) now calls these using the
-- ADMIN client, never the caller's own session. Capability A
-- (caregiver_begin_registration_deletion,
-- caregiver_cancel_registration_deletion_lock) remains caller-
-- accessible — a caregiver legitimately requesting or backing out of
-- their own deletion request grants no destructive capability by
-- itself. caregiver_finish_registration_deletion is ALSO moved to
-- service_role-only: an ordinary client calling it directly can never
-- supply a trusted outcome in the first place now, but restricting the
-- grant too is cheap, correct defense in depth exactly matching "do
-- not rely on an application-layer check alone."
--
-- Because these three functions are now service_role-only, they no
-- longer check auth.uid() for ownership — a service-role call carries
-- no meaningful end-user JWT, so that check would always fail. Trust
-- instead flows entirely through the unguessable, single-use
-- deletion_operation_id: it was only ever issued to whoever
-- successfully called begin() under THEIR OWN verified ownership
-- moments earlier in the same request.
--
-- DEL-02 §5.4 (never-provisioned registration): caregiver_finish_
-- registration_deletion now has an explicit second path —
-- provisioned_auth_user_id IS NULL — requiring no outcome attestation
-- at all, since there is no external operation whose outcome needs
-- confirming. The Edge Function no longer attempts (and ignores the
-- failure of) an outcome-recording call for this case.
--
-- §4.5 NULL validation: caregiver_record_deletion_outcome's previous
-- `p_outcome NOT IN (...)` check was NULL-unsafe — `NULL NOT IN (...)`
-- evaluates to NULL, and `IF NULL THEN` is false in plpgsql, so a NULL
-- outcome would have been silently accepted and stored. Now rejected
-- by an explicit `IF p_outcome IS NULL` check before the allowlist
-- comparison runs at all.
--
-- §4.2/5.2 protected-account predicate: authorize_destructive_deletion
-- now ALSO checks profiles.must_change_password = false (a completed
-- activation) independent of patients-row existence — "do not rely
-- exclusively on the existence of a patient table row."

CREATE OR REPLACE FUNCTION public.caregiver_authorize_destructive_deletion(p_registration_id uuid, p_operation_id uuid)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF p_registration_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A registration id and operation id are required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id
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

  IF v_reg.provisioned_auth_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM patients WHERE id = v_reg.provisioned_auth_user_id) THEN
      RAISE EXCEPTION 'A patient record already exists for the provisioned account — destructive deletion cannot be authorized';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = v_reg.provisioned_auth_user_id AND must_change_password = false) THEN
      RAISE EXCEPTION 'The provisioned account has already completed activation — destructive deletion cannot be authorized';
    END IF;
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_destructive_authorized_at = now()
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$function$;

REVOKE ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caregiver_authorize_destructive_deletion(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.caregiver_record_deletion_outcome(p_registration_id uuid, p_operation_id uuid, p_outcome text)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF p_registration_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A registration id and operation id are required';
  END IF;
  IF p_outcome IS NULL THEN
    RAISE EXCEPTION 'An outcome is required';
  END IF;
  IF p_outcome NOT IN ('confirmed_deleted', 'requires_manual_review') THEN
    RAISE EXCEPTION 'Invalid deletion outcome: %', p_outcome;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id
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
REVOKE ALL ON FUNCTION public.caregiver_record_deletion_outcome(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caregiver_record_deletion_outcome(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.caregiver_finish_registration_deletion(p_registration_id uuid, p_operation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF p_registration_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A registration id and operation id are required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND consumed_at IS NULL
    AND deletion_locked_at IS NOT NULL
    AND deletion_operation_id = p_operation_id
    AND (
      (deletion_destructive_authorized_at IS NOT NULL AND deletion_outcome = 'confirmed_deleted')
      OR provisioned_auth_user_id IS NULL
    );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No matching, confirmed-safe-to-finalize deletion operation found for this registration and operation id';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) TO service_role;

-- §4.4 worker quiescence: the original admin_reconcile_stuck_
-- registration_deletion() only ever handled a registration whose
-- outcome was ALREADY recorded as 'requires_manual_review' — which, in
-- this round's corrected design, only ever happens as the second-to-
-- last step the Edge Function takes before it naturally returns, so
-- the worker is already effectively done by the time that state is
-- reachable at all. It had NO path for the more genuinely dangerous
-- case: a worker that crashed or hung BEFORE ever recording any
-- outcome (destructive_authorized_at IS NOT NULL, deletion_outcome
-- IS NULL, forever, since authorize is a one-time transition). That
-- registration was previously unreconcilable by anyone.
--
-- Fix: reconciliation is now also permitted for a never-resolved
-- operation, but ONLY once enough time has passed that any realistic
-- Supabase Edge Function invocation must already have terminated —
-- Edge Functions run under a hard, platform-enforced execution
-- timeout well under the 10-minute margin used here. This is a real,
-- enforced quiescence bound (the platform itself guarantees the
-- function is no longer executing), not merely an administrator's own
-- unverified judgment call — though it is still NOT a true distributed
-- fencing/lease protocol: Supabase Auth's own HTTP API has no
-- awareness of this application's operation id or lease at all, so if
-- the ORIGINAL deleteUser() call were somehow still in flight past
-- this window (e.g. queued on a severely degraded network path), this
-- margin would not detect that. Documented as the explicit, known
-- limit of this mechanism rather than left implicit.
CREATE OR REPLACE FUNCTION public.admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean)
RETURNS pending_caregiver_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg pending_caregiver_registrations;
  v_never_resolved_but_quiescent boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may reconcile a stuck deletion operation';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;

  v_never_resolved_but_quiescent :=
    v_reg.deletion_outcome IS NULL
    AND v_reg.deletion_destructive_authorized_at IS NOT NULL
    AND v_reg.deletion_destructive_authorized_at < now() - INTERVAL '10 minutes';

  IF v_reg.deletion_outcome IS DISTINCT FROM 'requires_manual_review' AND NOT v_never_resolved_but_quiescent THEN
    RAISE EXCEPTION 'This registration is not in a state requiring manual reconciliation, or has not yet been unresolved long enough to safely assume the original worker has terminated';
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
