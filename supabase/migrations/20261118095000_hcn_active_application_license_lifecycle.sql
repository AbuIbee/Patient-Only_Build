CREATE OR REPLACE FUNCTION set_enterprise_license_status_for_quote(p_quote_id UUID, p_status TEXT)
RETURNS organization_licenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_license organization_licenses;
BEGIN
  IF p_status NOT IN ('expired', 'canceled', 'unpaid') THEN
    RAISE EXCEPTION 'set_enterprise_license_status_for_quote only handles non-activating transitions, got %', p_status;
  END IF;

  SELECT * INTO v_app FROM professional_applications
  WHERE application_details->>'originatingQuoteId' = p_quote_id::text
    AND status IN ('approved','agreements_executed','payment_authorization_pending','payment_verified','provisioning_pending','active') AND target_organization_id IS NOT NULL
  ORDER BY platform_owner_approved_at DESC
  LIMIT 1;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No approved Director application with an organization references quote %', p_quote_id;
  END IF;

  UPDATE organization_licenses SET status = p_status, updated_at = now()
  WHERE organization_id = v_app.target_organization_id
  RETURNING * INTO v_license;
  IF v_license.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration row exists for organization %', v_app.target_organization_id;
  END IF;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'enterprise_license_status_changed', NULL, 'system', v_app.status, v_app.status,
    'License set to ' || p_status || ' for organization ' || v_app.target_organization_id);

  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION set_enterprise_license_status_for_quote(UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION set_enterprise_license_status_for_quote(UUID, TEXT) TO service_role;

