-- HCN P0. Nonaffirmative decisions are fail-closed after approval.
-- Null decisions are forbidden; 'expired' was never an accepted decision.
-- The existing Director-only authorization, evidence requirement,
-- membership revocation, patient assignment deactivation, and audit remain.
CREATE OR REPLACE FUNCTION public.record_credential_verification(p_application_id uuid, p_decision text, p_evidence_reference text)
 RETURNS professional_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app professional_applications;
  v_membership organization_memberships;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('independently_verified', 'insufficient', 'rejected', 'requires_reverification') THEN
    RAISE EXCEPTION 'Invalid credential verification decision: %', p_decision;
  END IF;
  IF p_evidence_reference IS NULL OR btrim(p_evidence_reference) = '' THEN
    RAISE EXCEPTION 'An evidence reference describing what was checked is required';
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office = 'director' THEN
    RAISE EXCEPTION 'Director applications have no clinical credential to independently verify';
  END IF;
  IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
    RAISE EXCEPTION 'Only an active director of the target organization may record a credential verification decision';
  END IF;
  IF v_app.applicant_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot verify your own credential';
  END IF;

  UPDATE professional_applications SET
    credential_verification_status = p_decision,
    credential_verified_by = auth.uid(),
    credential_verified_at = now(),
    credential_verification_evidence = p_evidence_reference,
    updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'credential_verification_recorded', auth.uid(), 'director', v_app.status, v_app.status,
    'Credential verification decision: ' || p_decision || ' — ' || p_evidence_reference);

  -- MMA-CODEX-02: a negative/reverification decision against an
  -- already-approved application revokes the real authority it
  -- previously granted, not merely the column.
  IF v_app.status = 'approved' AND p_decision IN ('insufficient', 'requires_reverification', 'rejected') THEN
    SELECT * INTO v_membership FROM organization_memberships
    WHERE organization_id = v_app.target_organization_id AND user_id = v_app.applicant_user_id AND status = 'active'
    FOR UPDATE;

    IF v_membership.id IS NOT NULL THEN
      UPDATE organization_memberships SET status = 'revoked', updated_at = now() WHERE id = v_membership.id;
      UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
      WHERE organization_id = v_app.target_organization_id AND user_id = v_app.applicant_user_id AND is_active = true;

      INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, previous_value, new_value, reason)
      VALUES (v_app.applicant_user_id, v_app.target_organization_id, 'membership_revoked_credential_invalidated', auth.uid(),
        jsonb_build_object('org_role', v_membership.org_role, 'status', 'active', 'credential_verification_status', 'independently_verified'),
        jsonb_build_object('org_role', v_membership.org_role, 'status', 'revoked', 'credential_verification_status', p_decision),
        'Credential verification decision "' || p_decision || '" invalidated prior authority — ' || p_evidence_reference);
    END IF;
  END IF;

  RETURN v_app;
END;
$function$;
