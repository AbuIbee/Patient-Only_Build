-- MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave A — account access/deletion
-- auditing, lifecycle case 8 ("suspension/revocation of an active
-- professional"). remove_org_member() (migration 035) already implements
-- this capability (director-only, revokes the membership and deactivates
-- every staff_patient_assignments row for that user in the same
-- transaction) and is already wired into the Director dashboard UI. It
-- predates migration 083's account_management_audit table, so a real
-- director-initiated revocation of an active staff member currently
-- leaves no row in that audit trail — every OTHER account-governance
-- action this engagement built (application review, office-classification
-- correction) is audited; this one, the most consequential of them, was
-- not. This migration closes that specific gap without changing
-- remove_org_member's signature, authorization check, or any existing
-- caller's behavior.
CREATE OR REPLACE FUNCTION public.remove_org_member(
  p_org_id UUID,
  p_user_id UUID
) RETURNS boolean AS $$
DECLARE
  v_before organization_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may remove staff';
  END IF;

  SELECT * INTO v_before FROM organization_memberships
  WHERE organization_id = p_org_id AND user_id = p_user_id FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'No such organization membership';
  END IF;
  IF v_before.org_role = 'director' THEN
    RAISE EXCEPTION 'A director cannot be removed through this action';
  END IF;

  UPDATE organization_memberships SET status = 'revoked', updated_at = now()
  WHERE id = v_before.id;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id AND is_active = true;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (p_user_id, p_org_id, 'staff_member_removed', auth.uid(),
    jsonb_build_object('org_role', v_before.org_role, 'status', v_before.status),
    jsonb_build_object('org_role', v_before.org_role, 'status', 'revoked'),
    'Removed by organization director');

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.remove_org_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_org_member(UUID, UUID) TO authenticated;
