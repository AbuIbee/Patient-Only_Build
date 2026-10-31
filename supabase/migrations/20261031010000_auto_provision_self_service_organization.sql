-- Owner-directed acceptance requirement, 2026-10-31: "A new customer
-- must be able to register, create an organization, execute required
-- agreements, satisfy payment or promotional eligibility, receive
-- automatic activation, and sign in as Director without routine
-- Platform Owner approval."
--
-- GAP CONFIRMED BY READING THE ACTUAL CODE, NOT ASSUMED: migration 163
-- already fully automates APPLICATION verification
-- (start_self_service_application() -> run_automated_application_
-- verification() moves a non-duplicate application straight to
-- 'agreements_pending' with zero Platform Owner involvement). But
-- ORGANIZATION creation itself -- the organizations row, the Director's
-- organization_memberships row, the organization_licenses row, and
-- professional_applications.target_organization_id -- was, until now,
-- created ONLY by platform_owner_approve_director_application(), which
-- is_platform_owner()-gated. A self-service applicant who passed
-- automated verification still could not proceed to real billing/
-- agreements against a real organization without a human Platform
-- Owner manually "approving" first -- exactly the "routine approval"
-- this directive asks to remove for the ordinary (non-exception) case.
--
-- WHAT THIS DOES NOT CHANGE, and could not even if asked to: this
-- engagement has no e-signature provider integrated anywhere in the
-- repository (confirmed by a full-repo search, consistent with every
-- prior round's own finding) -- self-service agreement EXECUTION
-- remains impossible to automate honestly and is NOT touched here.
-- platform_owner_create_contract()/present_contract()/
-- record_contract_execution() remain exactly as Platform-Owner-gated
-- as before. ApplicationStatusPage's own agreements_pending copy
-- ("Agreement signing is not yet available in this workspace") is
-- accurate before and after this migration. This is a real,
-- documented BLOCKER on the full acceptance requirement, not something
-- bypassed, faked, or silently marked passing.
--
-- WHAT ELSE DOES NOT CHANGE: activate_enterprise_license_from_quote()
-- (Issue #3 P0-01, migration 20261031000100) still independently
-- re-verifies confirmed annual billing, confirmed monthly billing
-- authorization when applicable, and BOTH executed agreements before
-- issuing a license or promoting the Director's membership past
-- 'invited'. admin_set_organization_license_status() (Issue #3 P0-02)
-- still cannot activate a license directly. This migration only
-- removes the human click for the ORGANIZATION-CREATION step of a
-- verified, non-exception self-service application -- it creates the
-- membership as 'invited', identically to the Platform-Owner path,
-- never 'active'. Nothing downstream of that is weakened.
--
-- Reusing the EXISTING 'approved' status (not a new status value) is
-- deliberate: every downstream consumer (activate_enterprise_license_
-- from_quote's own application lookup, the Director-dashboard resolver)
-- already recognizes 'approved' + target_organization_id IS NOT NULL
-- as "this application has a real organization, awaiting billing/
-- agreements" -- introducing a parallel status here would duplicate,
-- not reconcile with, the existing state machine the repository's own
-- prior migrations explicitly warn against.
--
-- ============================================================================
-- auto_provision_director_organization(): the shared provisioning step,
-- factored out so BOTH the "clean, no exception" path AND the "a human
-- Platform Owner just resolved the one exception case (suspected
-- duplicate name) as genuinely distinct" path provision identically --
-- without this, the manual_review resolution path would still need a
-- SECOND, separate manual click to create the organization, defeating
-- the point. No auth check of its own: this is an internal helper,
-- never granted to authenticated/anon, callable only from within
-- another SECURITY DEFINER function in this same migration set (the
-- same pattern platform_owner_approve_director_application already
-- uses when it internally PERFORMs activate_enterprise_license_from_
-- quote, itself also never granted to authenticated).
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_provision_director_organization(p_app professional_applications)
RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org organizations;
  v_app professional_applications;
  v_result JSONB;
BEGIN
  INSERT INTO organizations (name, package_type, created_by)
  VALUES (p_app.proposed_organization_name, p_app.proposed_package_type, p_app.applicant_user_id)
  RETURNING * INTO v_org;

  -- 'invited', not 'active' -- Issue #3 P0-01 is unaffected. Operational
  -- Director authority is still granted ONLY by activate_enterprise_
  -- license_from_quote(), once confirmed billing and both executed
  -- agreements independently verify.
  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, p_app.applicant_user_id, 'director', 'invited', p_app.applicant_user_id);

  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  v_result := COALESCE(p_app.auto_verification_result, '{}'::jsonb) || jsonb_build_object('organization_auto_provisioned', true, 'organization_provisioned_at', now());
  -- platform_owner_approved_by is deliberately left NULL -- an honest
  -- audit signal that no human approved this, never fabricated as if
  -- a human had acted.
  UPDATE professional_applications SET
    status = 'approved', approved_office = 'director', target_organization_id = v_org.id,
    platform_owner_approved_by = NULL, platform_owner_approved_at = now(),
    auto_verification_result = v_result, updated_at = now()
  WHERE id = p_app.id RETURNING * INTO v_app;
  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_app.id, 'auto_provisioned', NULL, 'system', p_app.status, 'approved', 'Organization ' || v_org.name || ' auto-provisioned without Platform Owner review. Director membership invited, pending verified billing and executed agreements.');

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION auto_provision_director_organization(professional_applications) FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION run_automated_application_verification(p_application_id UUID)
RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_duplicate_count INTEGER;
  v_result JSONB;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status <> 'auto_verification_pending' THEN
    RAISE EXCEPTION 'This application is not awaiting automated verification (current status: %)', v_app.status;
  END IF;

  SELECT count(*) INTO v_duplicate_count FROM organizations WHERE lower(btrim(name)) = lower(btrim(v_app.proposed_organization_name));
  SELECT v_duplicate_count + count(*) INTO v_duplicate_count FROM professional_applications
    WHERE id <> v_app.id AND requested_office = 'director'
      AND status NOT IN ('rejected', 'withdrawn', 'draft', 'canceled')
      AND lower(btrim(proposed_organization_name)) = lower(btrim(v_app.proposed_organization_name));

  IF v_duplicate_count > 0 THEN
    v_result := jsonb_build_object(
      'checked_at', now(), 'decision', 'manual_review',
      'duplicate_name_check', 'flagged', 'duplicate_count', v_duplicate_count
    );
    UPDATE professional_applications SET
      status = 'manual_review', auto_verification_result = v_result,
      exception_review_reason = 'A business with the same or a very similar name already exists in this system. A Platform Owner must confirm this is a genuinely distinct organization before proceeding.',
      updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'auto_verification_flagged', NULL, 'system', 'auto_verification_pending', 'manual_review', 'Duplicate organization name detected');
    RETURN v_app;
  END IF;

  v_result := jsonb_build_object('checked_at', now(), 'decision', 'verified', 'duplicate_name_check', 'pass');
  UPDATE professional_applications SET auto_verification_result = v_result WHERE id = p_application_id RETURNING * INTO v_app;
  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'auto_verified', NULL, 'system', 'auto_verification_pending', 'approved', 'Automated verification passed');

  -- Verified, no exception -- auto-provision the organization now,
  -- without any Platform Owner action.
  RETURN auto_provision_director_organization(v_app);
END;
$$;
REVOKE ALL ON FUNCTION run_automated_application_verification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION run_automated_application_verification(UUID) TO authenticated, service_role;

-- platform_owner_resolve_manual_review(): 'confirmed_distinct' is the
-- one case that genuinely needs a human judgment call (the directive's
-- own "routine approval" removal never applied to the exception path).
-- But once that one judgment is made, the SAME auto-provisioning must
-- follow immediately -- otherwise this path would still need a SECOND,
-- separate manual approval step beyond the exception resolution itself,
-- which is exactly the kind of redundant "routine approval" the
-- directive asks to remove. 'rejected' and 'return_for_correction'
-- are completely unchanged.
CREATE OR REPLACE FUNCTION platform_owner_resolve_manual_review(p_application_id UUID, p_decision TEXT, p_reason TEXT)
RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_app professional_applications;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may resolve an exception review'; END IF;
  IF p_decision NOT IN ('confirmed_distinct', 'rejected', 'return_for_correction') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status <> 'manual_review' THEN RAISE EXCEPTION 'This application is not in exception review'; END IF;

  IF p_decision = 'confirmed_distinct' THEN
    UPDATE professional_applications SET exception_review_reason = NULL, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'manual_review_resolved', auth.uid(), 'platform_owner', 'manual_review', 'approved', COALESCE(p_reason, 'Confirmed as a genuinely distinct organization'));
    v_app := auto_provision_director_organization(v_app);
  ELSIF p_decision = 'rejected' THEN
    IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required to reject'; END IF;
    UPDATE professional_applications SET status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'rejected', auth.uid(), 'platform_owner', 'manual_review', 'rejected', p_reason);
  ELSE
    IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required to return an application for correction'; END IF;
    UPDATE professional_applications SET status = 'info_required', correction_request = p_reason, correction_requested_at = now(), correction_requested_by = auth.uid(), updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'info_requested', auth.uid(), 'platform_owner', 'manual_review', 'info_required', p_reason);
  END IF;

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_resolve_manual_review(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_resolve_manual_review(UUID, TEXT, TEXT) TO authenticated;
