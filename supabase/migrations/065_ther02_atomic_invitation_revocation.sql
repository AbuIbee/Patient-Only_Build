-- COMMIT D — ROUND 4 — atomic therapist-invitation revocation (THER-02, P1).
--
-- CONFIRMED DEFECT: migration 059's revoke_therapist_connection() only
-- marks the pending_therapist_connections row 'revoked' WHEN
-- status = 'accepted'. A row still sitting at status = 'pending' for
-- the same (patient_id, therapist_id) pair — e.g. an outstanding
-- invite the caregiver wants to cancel, or one that survives because
-- the caregiver revoked a DIFFERENT prior acceptance window — is left
-- completely untouched. Because pending_therapist_connections has a
-- UNIQUE (patient_id, therapist_id) constraint (migration 051), that
-- surviving 'pending' row is the SAME row the therapist can still call
-- respond_to_therapist_invite() against, AFTER the revocation has
-- already committed — recreating an active therapist_relationships row
-- and completely undoing the revocation's intent. "Concurrent
-- acceptance can establish an active relationship after revocation
-- commits."
--
-- FIX: revoke_therapist_connection() now invalidates the connection
-- regardless of whether it is currently 'pending' or 'accepted' — a
-- revoke always means "this therapist's authority over this patient,
-- actionable or active, ends now," not merely "end whatever happens to
-- already be accepted." The row is locked FOR UPDATE before being
-- revoked, giving explicit, visible serialization against a concurrent
-- respond_to_therapist_invite() call on the exact same row (Postgres
-- already serializes UPDATE/SELECT-FOR-UPDATE on the same row
-- implicitly; this makes that guarantee explicit and auditable rather
-- than incidental).
--
-- Whichever of revoke_therapist_connection() / respond_to_therapist_invite()
-- acquires the row lock first determines ordering; the other blocks
-- until the first commits, then re-evaluates the row's post-commit
-- state under its own status check:
--   - If revoke wins the race: the row is 'revoked'; the therapist's
--     subsequent respond_to_therapist_invite() call sees
--     status != 'pending' and is rejected ("already been responded to").
--   - If accept wins the race: the row becomes 'accepted' and an active
--     relationship is created; revoke's now-unblocked UPDATE still
--     matches status IN ('pending','accepted'), so it proceeds and both
--     ends the just-created active relationship AND marks the
--     connection 'revoked'. The caregiver's revoke intent is never
--     silently lost regardless of which operation happened to reach
--     Postgres first — this is the "common concurrency boundary"
--     (row-level locking on the actual authorization record), not a
--     client-side read-then-write race.
--
-- caregiver_invite_therapist()'s re-invite branch (resetting a
-- previously declined/revoked row back to 'pending') is also given an
-- explicit FOR UPDATE lock on its existing-row read, for the same
-- reason: a reinvite and a revoke racing the same row now serialize
-- through the identical mechanism rather than two independent,
-- unlocked read-then-write statements agreeing only by accident.
--
-- Scenarios exercised live this round via disclosed SET ROLE identity
-- simulation (two-session interleaving, both orderings) — see this
-- round's handoff report for the exact commands and results:
--   1. pending-revoke-vs-accept
--   2. accepted-revoke-vs-accept
--   3. caregiver-authorization-removal-vs-accept (already covered by
--      migration 064's FOR UPDATE re-check inside respond_to_therapist_invite
--      on caregiver_patients — re-verified here, not re-implemented)
--   4. duplicate-accept-vs-accept (already covered by
--      respond_to_therapist_invite's own FOR UPDATE + status != 'pending'
--      check — re-verified here, not re-implemented)
--   5. reinvite-vs-revoke

CREATE OR REPLACE FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conn pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id;

  -- THER-02: lock the connection row explicitly, then revoke it
  -- regardless of its current status (pending OR accepted) — a revoke
  -- ends ALL actionable authority for this therapist/patient pair, not
  -- only an already-accepted one. This UPDATE's row lock is what
  -- serializes against a concurrent respond_to_therapist_invite() call
  -- on the identical row.
  SELECT * INTO v_conn FROM pending_therapist_connections
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id
  FOR UPDATE;

  IF v_conn.id IS NOT NULL AND v_conn.status IN ('pending', 'accepted') THEN
    UPDATE pending_therapist_connections SET status = 'revoked', responded_at = now()
    WHERE id = v_conn.id;
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text DEFAULT 'consulting'::text)
RETURNS pending_therapist_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_therapist_id UUID;
  v_therapist_role TEXT;
  v_existing pending_therapist_connections;
  v_row pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid()) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;
  IF p_relationship_type NOT IN ('primary','consulting','supervising','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT id, role INTO v_therapist_id, v_therapist_role FROM profiles WHERE lower(email) = lower(btrim(p_therapist_email));
  IF v_therapist_id IS NULL THEN
    RAISE EXCEPTION 'No account was found for that email. Ask them to create a My Memoria Ally account first, then invite them.';
  END IF;
  IF v_therapist_id = p_patient_id THEN
    RAISE EXCEPTION 'The patient cannot be invited as their own therapist';
  END IF;
  IF v_therapist_role IS DISTINCT FROM 'therapist' THEN
    RAISE EXCEPTION 'This account has not been verified as a therapist and is not eligible to be invited in that capacity';
  END IF;

  IF EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id AND is_active = true) THEN
    RAISE EXCEPTION 'This person is already an active therapist for this patient';
  END IF;

  -- THER-02: explicit FOR UPDATE — serializes the reinvite decision
  -- against a concurrent revoke_therapist_connection() call on the
  -- identical row, instead of two independent, unlocked statements.
  SELECT * INTO v_existing FROM pending_therapist_connections
  WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN v_existing;
    END IF;
    UPDATE pending_therapist_connections SET
      caregiver_id = auth.uid(), relationship_type = p_relationship_type, status = 'pending',
      created_at = now(), responded_at = NULL
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO pending_therapist_connections (patient_id, caregiver_id, therapist_id, relationship_type)
  VALUES (p_patient_id, auth.uid(), v_therapist_id, p_relationship_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
