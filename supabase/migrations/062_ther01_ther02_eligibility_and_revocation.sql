-- THER-01/THER-02 — therapist professional eligibility and stale-
-- invitation/revocation closure (Codex-confirmed P1).
--
-- THER-01 CONFIRMED DEFECT: neither caregiver_invite_therapist() nor
-- respond_to_therapist_invite() ever checked the recipient's own
-- profiles.role before creating an active therapist_relationships row
-- — a patient-role account could accept a therapist invitation and
-- then write a therapist_session professional note, because
-- is_therapist_for_patient() (the function the patient_notes RLS
-- policies actually depend on) only checks relationship existence,
-- never the underlying account's role. Confirmed zero existing
-- therapist_relationships rows currently have a patient-role
-- therapist_id — no data migration/classification was needed.
--
-- This project has no profiles.role value for "therapist" at all, and
-- no credential/license-verification infrastructure anywhere
-- (confirmed again this round) — professional identity is otherwise
-- only ever established through Enterprise organization membership
-- (staff_patient_assignments/organization_memberships), which this
-- residential invite/accept path deliberately does not require (a
-- prior round's own report already disclosed this honestly in the UI
-- rather than fabricating verification). Per "if the approved
-- verification infrastructure is unavailable, deny professional-only
-- privileges until verification can be established": the minimal,
-- non-speculative fix is an explicit denylist on the one role this
-- schema actually uses that must never hold therapist privileges —
-- 'patient' — checked at invite time, at acceptance time, AND
-- (critically) at the actual RLS enforcement point itself
-- (is_therapist_for_patient), so a relationship row alone can never
-- grant privileges to an account whose CURRENT role fails this check,
-- even if the role changed after the relationship was created.
--
-- THER-02 CONFIRMED DEFECTS: revoke_therapist_connection() (migration
-- 059) already marks a matching pending_therapist_connections row
-- 'revoked' when an ACCEPTED relationship is revoked, but a still-
-- PENDING invitation for the same (patient, therapist) pair that was
-- never accepted is untouched by revocation (there is nothing to
-- revoke if nothing was ever accepted) and also by
-- caregiver_invite_therapist's "idempotent — already invited, awaiting
-- response" return-existing-row behavior, which never re-verifies the
-- INVITER still has current authority over the patient. Traced through
-- the actual acceptance window: respond_to_therapist_invite() took no
-- row lock on caregiver_patients (the inviter's own authority), so two
-- concurrent accept attempts against the SAME connection_id could
-- interleave — the FOR UPDATE lock on pending_therapist_connections
-- itself serializes two accepts on the SAME row, but nothing re-checked
-- that the inviting caregiver still owned the patient at the moment of
-- acceptance, only at the moment of invitation.

-- THER-01 fix, part 1: the authoritative RLS-enforcement point. Both
-- Enterprise-staff and residential-relationship paths now additionally
-- require the therapist account's CURRENT role to not be 'patient' —
-- re-checked live on every call, not cached from invite/accept time.
CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (
      EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND org_role = 'therapist' AND is_active = true)
      OR EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true)
    )
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient');
$function$;

-- THER-01 fix, part 2: reject at invite time.
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
  -- THER-01: this platform has no credential/license verification
  -- infrastructure for this residential invite path — deny the one
  -- role that must never hold therapist privileges rather than
  -- fabricate a verification this account never actually received.
  IF v_therapist_role = 'patient' THEN
    RAISE EXCEPTION 'This account is registered as a patient and is not eligible to be invited as a therapist';
  END IF;

  IF EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id AND is_active = true) THEN
    RAISE EXCEPTION 'This person is already an active therapist for this patient';
  END IF;

  SELECT * INTO v_existing FROM pending_therapist_connections WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN v_existing; -- idempotent — already invited, awaiting response
    END IF;
    -- A prior declined/revoked connection — re-invite by resetting it.
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

-- THER-01 fix, part 3 / THER-02 fix: reject patient-role acceptance;
-- re-verify the INVITER still has current authority over the patient
-- at the exact moment of acceptance (not merely at invite time); hold
-- a row lock on the inviter's caregiver_patients link for the duration
-- of the transaction so a concurrent revocation of that caregiver's
-- own relationship to the patient cannot race past this check.
CREATE OR REPLACE FUNCTION public.respond_to_therapist_invite(p_connection_id uuid, p_accept boolean)
RETURNS pending_therapist_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conn pending_therapist_connections;
  v_existing_rel_id UUID;
  v_responder_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_conn FROM pending_therapist_connections WHERE id = p_connection_id FOR UPDATE;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'No such invitation';
  END IF;
  IF v_conn.therapist_id != auth.uid() THEN
    RAISE EXCEPTION 'This invitation is not addressed to you';
  END IF;
  IF v_conn.status != 'pending' THEN
    RAISE EXCEPTION 'This invitation has already been responded to';
  END IF;

  IF p_accept THEN
    SELECT role INTO v_responder_role FROM profiles WHERE id = auth.uid();
    IF v_responder_role = 'patient' THEN
      RAISE EXCEPTION 'This account is registered as a patient and is not eligible to accept a therapist invitation';
    END IF;

    -- THER-02: re-verify, at this exact moment, that the inviting
    -- caregiver still has current authority over the patient — not
    -- merely that they did when the invitation was created. Row-locked
    -- so a concurrent revocation of the caregiver's own link cannot
    -- commit in between this check and the relationship being created.
    IF NOT EXISTS (
      SELECT 1 FROM caregiver_patients
      WHERE caregiver_id = v_conn.caregiver_id AND patient_id = v_conn.patient_id
      FOR UPDATE
    ) THEN
      -- Deliberately RETURN rather than RAISE here: an uncaught
      -- RAISE EXCEPTION aborts the whole transaction, which would roll
      -- back this very UPDATE along with it — the revocation would
      -- never actually persist. Returning the now-revoked row (status
      -- = 'revoked', not 'accepted') lets the caller detect the
      -- failure to accept from the returned row itself, while the
      -- revocation is genuinely committed.
      UPDATE pending_therapist_connections SET status = 'revoked', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
      RETURN v_conn;
    END IF;

    SELECT id INTO v_existing_rel_id FROM therapist_relationships
      WHERE therapist_id = v_conn.therapist_id AND patient_id = v_conn.patient_id
      LIMIT 1;
    IF v_existing_rel_id IS NOT NULL THEN
      UPDATE therapist_relationships SET is_active = true, relationship_type = v_conn.relationship_type, updated_at = now()
      WHERE id = v_existing_rel_id;
    ELSE
      INSERT INTO therapist_relationships (therapist_id, patient_id, caregiver_id, relationship_type, is_active)
      VALUES (v_conn.therapist_id, v_conn.patient_id, v_conn.caregiver_id, v_conn.relationship_type, true);
    END IF;
    UPDATE pending_therapist_connections SET status = 'accepted', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
  ELSE
    UPDATE pending_therapist_connections SET status = 'declined', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
  END IF;

  RETURN v_conn;
END;
$function$;
