-- S6 — serialize organization seat-capacity checks against concurrent
-- invites (Senior Architect Execution Contract, Section 7).
--
-- invite_org_member read licensed_seats and counted active/invited
-- memberships via plain SELECTs with no row lock, then compared and
-- inserted. Two concurrent calls for the same organization could both
-- read the same pre-insert count, both pass the capacity check, and
-- both insert — exceeding the licensed seat count. This migration adds
-- FOR UPDATE to the licensed_seats lookup: a second concurrent caller's
-- identical SELECT ... FOR UPDATE now blocks until the first caller's
-- transaction commits (or rolls back), after which it re-reads under
-- READ COMMITTED semantics and correctly sees the first caller's
-- already-committed membership row before deciding whether a seat is
-- still available.
--
-- NOTE on evidence: this is a reasoned fix using the standard Postgres
-- locking pattern for exactly this class of check-then-act race, not an
-- empirically reproduced two-session race — reproducing the original
-- bug honestly would require temporarily rigging a deliberate delay
-- inside the function to widen the window, which was judged not worth
-- the additional invasive, reversed-afterward change for this fix.
-- Verified instead with the standard non-concurrent positive/negative
-- cases: reject at capacity, succeed under capacity, reject an invalid
-- role, reject a non-director caller.

CREATE OR REPLACE FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text)
RETURNS organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_user_id UUID;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_row organization_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may invite staff';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
    RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
  END IF;

  SELECT id INTO v_target_user_id FROM profiles WHERE lower(email) = lower(btrim(p_email));
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first, then invite them.', p_email;
  END IF;

  -- S6 FIX: lock the license row first so a concurrent invite for the
  -- same organization serializes on this statement rather than racing
  -- the capacity check.
  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_org_id, v_target_user_id, p_org_role, 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = EXCLUDED.org_role,
    status = CASE WHEN organization_memberships.status = 'revoked' THEN 'invited' ELSE organization_memberships.status END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
