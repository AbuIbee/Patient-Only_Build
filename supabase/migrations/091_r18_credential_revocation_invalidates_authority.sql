-- Codex MMA-CODEX-02 — "Bind credential verification to the specific
-- reviewed evidence revision. Invalidate affected authority when
-- evidence is changed, rejected, expired under approved rules, or
-- revoked."
--
-- CONFIRMED GAP: migration 089's record_credential_verification()
-- gates INITIAL approval (director_approve_application() cannot run
-- until independently_verified), but once an application IS approved
-- and the professional is an active org member, nothing re-checks
-- credential_verification_status again. A director could later record
-- 'requires_reverification', 'rejected', or 'expired' against an
-- ALREADY-APPROVED application (the CHECK constraint permits it; the
-- RPC had no status restriction preventing it) and the professional's
-- organization membership — their actual authority — would remain
-- fully active regardless, with no consequence. The column changed;
-- the authority it was supposed to gate did not.
--
-- Fix: when record_credential_verification() records a decision of
-- 'requires_reverification', 'rejected', or 'expired' against an
-- application whose status is ALREADY 'approved', the corresponding
-- organization_membership is revoked and every active
-- staff_patient_assignments row for that user in that org is
-- deactivated — identical mechanism and audit pattern to
-- remove_org_member() (migration 084) and
-- platform_owner_review_account_deletion() (migration 088) — in the
-- SAME transaction as the credential-status change, so the two can
-- never drift out of sync. A decision against a still-PENDING
-- application (not yet approved) continues to behave exactly as
-- migration 089 left it — there is no membership to revoke yet, only
-- the pre-approval gate matters.
CREATE OR REPLACE FUNCTION public.record_credential_verification(
  p_application_id UUID, p_decision TEXT, p_evidence_reference TEXT
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_membership organization_memberships;
BEGIN
  IF p_decision NOT IN ('independently_verified', 'insufficient', 'rejected', 'requires_reverification') THEN
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
  IF v_app.status = 'approved' AND p_decision IN ('requires_reverification', 'rejected', 'expired') THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.record_credential_verification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_credential_verification(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_credential_verification(UUID, TEXT, TEXT) FROM anon;
