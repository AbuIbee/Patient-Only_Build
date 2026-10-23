-- Codex MMA-CODEX-03 — "current authorization," confirmed gap #1
-- (serious): platform_owner_correct_office_classification() updated
-- ONLY organization_memberships.org_role/status. staff_patient_
-- assignments (the table every real clinical gate actually checks --
-- is_professional_staff_for_patient()/has_patient_access()/
-- is_authorized_for_patient() all read staff_patient_assignments.
-- is_active, never organization_memberships.status) was never touched.
--
-- Confirmed scenario: the Platform Owner reclassifies a medical
-- professional down to 'caregiver', or revokes their membership
-- outright via THIS function (p_new_status='revoked') rather than via
-- remove_org_member() (director-only) -- every staff_patient_
-- assignments row this user already held kept org_role=
-- 'medical_professional', is_active=true. is_professional_staff_for_
-- patient() still returned true for every previously-assigned patient:
-- a platform-owner-revoked or reclassified user retained full
-- professional-only clinical write authority indefinitely. The other
-- two existing revocation paths (remove_org_member, migration 084;
-- record_credential_verification's revocation branch, migration 091)
-- both already do this atomically and correctly -- this was the one
-- path that never got the same treatment.
--
-- Fix: whenever this RPC either (a) sets a non-'active' status, or
-- (b) changes the org_role to something different from what it was,
-- every existing active staff_patient_assignments row for this (org,
-- user) is deactivated in the same transaction, audited. A director
-- may then re-assign the user explicitly under their corrected
-- classification if that is genuinely warranted -- this never
-- silently re-grants anything, only removes stale authority.
CREATE OR REPLACE FUNCTION public.platform_owner_correct_office_classification(
  p_user_id UUID, p_organization_id UUID, p_new_org_role TEXT, p_new_status TEXT, p_reason TEXT
) RETURNS organization_memberships AS $$
DECLARE
  v_before organization_memberships;
  v_after organization_memberships;
  v_deactivated_count INTEGER;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may correct an office classification';
  END IF;
  IF p_new_org_role NOT IN ('director', 'caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
    RAISE EXCEPTION 'Invalid office classification: %', p_new_org_role;
  END IF;
  IF p_new_status NOT IN ('invited', 'active', 'revoked', 'declined') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT * INTO v_before FROM organization_memberships WHERE organization_id = p_organization_id AND user_id = p_user_id FOR UPDATE;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'No such organization membership'; END IF;

  UPDATE organization_memberships SET org_role = p_new_org_role, status = p_new_status, updated_at = now()
  WHERE id = v_before.id RETURNING * INTO v_after;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
  VALUES (p_user_id, p_organization_id, 'office_classification_corrected', auth.uid(),
    jsonb_build_object('org_role', v_before.org_role, 'status', v_before.status),
    jsonb_build_object('org_role', v_after.org_role, 'status', v_after.status), p_reason);

  IF p_new_status != 'active' OR p_new_org_role != v_before.org_role THEN
    UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
    WHERE organization_id = p_organization_id AND user_id = p_user_id AND is_active = true;
    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;
    IF v_deactivated_count > 0 THEN
      INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
      VALUES (p_user_id, p_organization_id, 'office_classification_corrected_assignments_deactivated', auth.uid(),
        jsonb_build_object('active_assignment_count', v_deactivated_count), jsonb_build_object('active_assignment_count', 0),
        'Office classification correction (' || p_reason || ') deactivated ' || v_deactivated_count || ' stale patient assignment(s) recorded under the prior classification');
    END IF;
  END IF;

  RETURN v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_correct_office_classification(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_correct_office_classification(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_owner_correct_office_classification(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;

-- Codex MMA-CODEX-03 — confirmed gap #2 (correctness/availability, not
-- a security hole): migration 087 extended send_message()/
-- get_my_conversations()/search_my_conversations()/
-- get_patient_care_circle() with an is_org_director_for_patient() OR-
-- branch, but never touched is_conversation_participant() itself --
-- the single function the direct-table RLS SELECT policies on
-- conversations/conversation_participants/messages all gate through.
-- A director whose ONLY authorization for a conversation is
-- is_org_director_for_patient() (not independently staff/therapist)
-- would see the conversation in get_my_conversations() (RPC-gated,
-- correct) but get an EMPTY participant list and EMPTY message history
-- when opening it (table-RLS-gated via the unextended function,
-- silently filtered, no error) -- exactly the scenario
-- DirectorCommunicationsView (built this engagement to give directors
-- a real UI for this capability) depends on working.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conversation_id AND public.is_org_director_for_patient(auth.uid(), c.patient_id)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID) FROM anon;
