-- Codex MMA-CODEX-08 — "old invitations cannot recreate prohibited
-- access" after account closure.
--
-- CONFIRMED GAP: platform_owner_review_account_deletion() (migration
-- 088) only revoked organization_memberships rows with
-- status='active'. A pending INVITED membership (an org director's
-- invite the user had not yet accepted) is a DIFFERENT status value
-- and was left completely untouched. After an account's deletion
-- request is approved — specifically intended to cut off that
-- account's access — the account could still call
-- respond_to_org_invite() on any such stale invitation and become an
-- active member of that organization, fully circumventing the
-- deactivation this exact migration exists to enforce.
--
-- Fix: the same approval now also declines every pending ('invited')
-- membership for the target user, across every organization, in the
-- same transaction and with the same audit pattern as the active-
-- membership revocation above it. respond_to_org_invite() requires
-- status='invited' to accept at all, so once these rows are
-- 'declined' there is no longer anything left to stale-accept.
CREATE OR REPLACE FUNCTION public.platform_owner_review_account_deletion(
  p_request_id UUID, p_approve BOOLEAN, p_notes TEXT
) RETURNS account_deletion_requests AS $$
DECLARE
  v_row account_deletion_requests;
  v_membership RECORD;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may review deletion requests';
  END IF;

  SELECT * INTO v_row FROM account_deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No such deletion request';
  END IF;
  IF v_row.status NOT IN ('requested', 'under_review') THEN
    RAISE EXCEPTION 'This request has already been decided';
  END IF;

  IF NOT p_approve THEN
    UPDATE account_deletion_requests
    SET status = 'denied', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes, updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  FOR v_membership IN SELECT * FROM organization_memberships WHERE user_id = v_row.target_user_id AND status = 'active' LOOP
    UPDATE organization_memberships SET status = 'revoked', updated_at = now() WHERE id = v_membership.id;
    INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
    VALUES (v_row.target_user_id, v_membership.organization_id, 'account_deletion_approved_membership_revoked', auth.uid(),
      jsonb_build_object('org_role', v_membership.org_role, 'status', v_membership.status),
      jsonb_build_object('org_role', v_membership.org_role, 'status', 'revoked'),
      'Account deletion request ' || p_request_id || ' approved');
  END LOOP;

  -- Codex MMA-CODEX-08: cancel every pending invitation too, not only
  -- active memberships, so none can be stale-accepted later.
  FOR v_membership IN SELECT * FROM organization_memberships WHERE user_id = v_row.target_user_id AND status = 'invited' LOOP
    UPDATE organization_memberships SET status = 'declined', updated_at = now() WHERE id = v_membership.id;
    INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
    VALUES (v_row.target_user_id, v_membership.organization_id, 'account_deletion_approved_invitation_cancelled', auth.uid(),
      jsonb_build_object('org_role', v_membership.org_role, 'status', v_membership.status),
      jsonb_build_object('org_role', v_membership.org_role, 'status', 'declined'),
      'Account deletion request ' || p_request_id || ' approved — pending invitation cancelled so it cannot be accepted after closure');
  END LOOP;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE user_id = v_row.target_user_id AND is_active = true;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE therapist_id = v_row.target_user_id AND is_active = true;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (v_row.target_user_id, NULL, 'account_deletion_approved_deactivation_completed', auth.uid(), NULL, NULL,
    'Account deletion request ' || p_request_id || ' approved and safely deactivated (memberships/assignments/relationships/pending invitations revoked; no clinical record or auth identity was deleted)');

  UPDATE account_deletion_requests
  SET status = 'completed', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes, updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_review_account_deletion(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_review_account_deletion(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_owner_review_account_deletion(UUID, BOOLEAN, TEXT) FROM anon;
