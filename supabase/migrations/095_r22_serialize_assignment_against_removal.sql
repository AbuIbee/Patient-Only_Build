-- Codex MMA-CODEX-03 — "Serialize conflicting assignment/removal
-- operations."
--
-- CONFIRMED GAP: assign_staff_to_patient() (migration 035) checked the
-- target's organization_memberships row via a plain `SELECT ...
-- EXISTS`, never locking it. remove_org_member() (migration 084) DOES
-- lock its own target row with FOR UPDATE before revoking. Under
-- READ COMMITTED (Postgres's default), a concurrent
-- assign_staff_to_patient() call could read the membership as active
-- in its EXISTS check, then still proceed to INSERT an active
-- staff_patient_assignments row even if remove_org_member() revoked
-- that exact membership in the gap between the check and the insert —
-- a real, narrow TOCTOU race, not merely a theoretical one, since
-- nothing serialized the two operations against each other.
--
-- Fix: assign_staff_to_patient() now takes the SAME FOR UPDATE lock on
-- the target's organization_memberships row remove_org_member()
-- already takes. Whichever of the two operations starts first holds
-- the lock until it commits; the other blocks until then and
-- re-reads the now-current state — so a concurrent removal can never
-- be silently raced by an assignment (or vice versa) for the same
-- membership row.
CREATE OR REPLACE FUNCTION public.assign_staff_to_patient(
  p_org_id UUID,
  p_user_id UUID,
  p_patient_id UUID,
  p_org_role TEXT
) RETURNS staff_patient_assignments AS $$
DECLARE
  v_row staff_patient_assignments;
  v_membership organization_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may assign staff to a patient';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional') THEN
    RAISE EXCEPTION 'Invalid staff role: %', p_org_role;
  END IF;

  SELECT * INTO v_membership FROM organization_memberships
  WHERE organization_id = p_org_id AND user_id = p_user_id
  FOR UPDATE;
  IF v_membership.id IS NULL OR v_membership.status != 'active' OR v_membership.org_role != p_org_role THEN
    RAISE EXCEPTION 'The target user is not an active % member of this organization', p_org_role;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'This patient is not actively covered by this organization';
  END IF;

  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, p_user_id, p_patient_id, p_org_role, auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET
    org_role = EXCLUDED.org_role, is_active = true, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.assign_staff_to_patient(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_staff_to_patient(UUID, UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_staff_to_patient(UUID, UUID, UUID, TEXT) FROM anon;
