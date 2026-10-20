-- 074_r7_ther_staff_assignment_recognition.sql
-- ROUND 7 — CONFIRMED DEFECT, live-reproduced via fresh adversarial
-- testing: migration 072 widened caregiver_invite_therapist()'s own
-- authorization check to recognize an Enterprise staff_patient_
-- assignments row (so a staff-only caregiver, with no caregiver_
-- patients row at all, could send a therapist invitation). But TWO
-- downstream functions in the same workflow were never updated and
-- still check ONLY caregiver_patients:
--
--   1. respond_to_therapist_invite()'s own staleness re-check (migration
--      064, lines ~165-171): when the inviting caregiver no longer has
--      authority over the patient AT ACCEPT TIME, the connection is
--      auto-revoked instead of accepted — by design, for the
--      residential case. But this check only ever looks at
--      caregiver_patients, so EVERY Enterprise-staff-sent invitation
--      auto-revokes the instant the invited therapist tries to accept
--      it, even though the inviting staff member's authority (via
--      staff_patient_assignments) never lapsed. Live-reproduced this
--      round: an Org A staff caregiver (no caregiver_patients row at
--      all) invited a real verified therapist; the therapist's own
--      accept call returned status='revoked', not 'accepted' — the W10
--      workflow was never actually completable for its primary
--      intended Enterprise user, despite the invite step alone having
--      been live-verified and marked PASS in Round 6's matrix.
--   2. revoke_therapist_connection() (migration 065): identical
--      caregiver_patients-only gate — an Enterprise staff member or
--      director could never revoke a connection they or their colleague
--      initiated.
--
-- Fix: both gates now accept the exact same OR-branch already proven
-- in migration 072 for caregiver_invite_therapist() — an active
-- staff_patient_assignments row for the same patient. Every other
-- line — the THER-01 positive-eligibility role check, the FOR UPDATE
-- locks, the accept/decline/revoke branching, the therapist_
-- relationships upsert logic — is preserved byte-for-byte from
-- migrations 064/065.

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
    -- THER-01: positive allowlist re-verified at acceptance too, not
    -- only at invite time.
    IF v_responder_role IS DISTINCT FROM 'therapist' THEN
      RAISE EXCEPTION 'This account has not been verified as a therapist and is not eligible to accept this invitation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM caregiver_patients
      WHERE caregiver_id = v_conn.caregiver_id AND patient_id = v_conn.patient_id
      FOR UPDATE
    ) AND NOT EXISTS (
      SELECT 1 FROM staff_patient_assignments
      WHERE user_id = v_conn.caregiver_id AND patient_id = v_conn.patient_id AND is_active = true
    ) THEN
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
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id;

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

-- LIVE VERIFICATION (this round): re-ran the exact failing scenario
-- after this fix — an Org A staff-only caregiver (no caregiver_
-- patients row) invited a real verified therapist; the therapist's
-- accept call now returns status='accepted' (not 'revoked'); the
-- therapist's subsequent read of the patient and professional-note
-- write both succeeded; the same staff caregiver's revoke call then
-- succeeded, and the therapist's access was immediately removed. A
-- residential caregiver's (caregiver_patients-only, no staff_patient_
-- assignments) identical scenario was re-confirmed unaffected
-- (regression-checked against the existing round4TherapistEligibility
-- and round5NoteForgeryAndEligibilityRevocation unit test suites).
