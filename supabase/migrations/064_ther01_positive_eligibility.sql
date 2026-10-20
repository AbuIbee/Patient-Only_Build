-- COMMIT C — ROUND 4 — positive therapist professional eligibility
-- (Codex-reproduced P1, THER-01).
--
-- CONFIRMED DEFECT: migration 062's fix was a denylist (reject
-- role = 'patient' only). Codex demonstrated that an ordinary
-- CAREGIVER-role account — not denied by that check — could accept a
-- therapist invitation, obtain an active therapist relationship, and
-- read/write professional notes. "A patient-role denylist is not
-- professional verification."
--
-- DISCOVERY: this schema already has a genuine, administrator-
-- controlled therapist role that was simply never wired into the
-- eligibility checks. migration 001's original profiles.role CHECK
-- constraint already includes 'therapist' as a first-class value (the
-- live constraint, re-confirmed this round:
-- role = ANY (ARRAY['patient','admin','superadmin','caregiver',
-- 'therapist','pending'])). migration 012 already revoked ordinary
-- authenticated clients' ability to write profiles.role AT ALL
-- (REVOKE UPDATE/INSERT, regranted only a non-privileged column list
-- that excludes role) and built admin_set_role(p_user_id, p_role) —
-- a SECURITY DEFINER RPC that only an existing admin/superadmin may
-- call, and which explicitly refuses to let a caller change their own
-- role. This is exactly the "trusted, administrator-controlled
-- therapist role and additional verification state" the fix needs —
-- it was simply never consulted by the therapist-invitation path.
--
-- FIX: replace the role = 'patient' denylist with a positive
-- allowlist — role = 'therapist' — enforced at invite time, at
-- acceptance time, AND (the authoritative point) inside
-- is_therapist_for_patient() itself for the residential-relationship
-- branch. The Enterprise staff_patient_assignments branch is left
-- untouched: organization-staff therapist status is already its own,
-- separately admin-controlled mechanism (a director assigns org_role
-- via organization_memberships/staff_patient_assignments), genuinely
-- independent of profiles.role.
--
-- CONSEQUENCE, STATED HONESTLY: zero admin accounts and zero
-- profiles.role = 'therapist' accounts currently exist in this
-- project (confirmed live, this round) — meaning no one can currently
-- reach profiles.role = 'therapist' at all, since admin_set_role()
-- requires an existing admin to call it, and none exists. This makes
-- the residential therapist-invite feature correctly UNREACHABLE
-- until an administrator account exists and explicitly promotes a
-- real account to 'therapist' — this is the deliberate, fail-closed
-- consequence of "deny professional-only privileges until
-- verification can be established," not a bug. It was already
-- disclosed in the UI (prior round) that residential connections are
-- not independently verified; this migration makes that disclosure
-- also true in the stronger sense that the path is now actually
-- gated, not merely labeled. Confirmed zero currently-active
-- therapist_relationships rows would be affected by this tightening —
-- nothing existing is broken.

CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND org_role = 'therapist' AND is_active = true)
    OR (
      EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true)
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'therapist')
    );
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
  -- THER-01: positive allowlist, not a denylist. Only an account an
  -- administrator has explicitly set to role='therapist' via
  -- admin_set_role() is eligible — a caregiver-role (or any other
  -- non-therapist-role) account is not, regardless of invitation
  -- possession.
  IF v_therapist_role IS DISTINCT FROM 'therapist' THEN
    RAISE EXCEPTION 'This account has not been verified as a therapist and is not eligible to be invited in that capacity';
  END IF;

  IF EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id AND is_active = true) THEN
    RAISE EXCEPTION 'This person is already an active therapist for this patient';
  END IF;

  SELECT * INTO v_existing FROM pending_therapist_connections WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id;
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
