-- Incomplete Stripe subscriptions do not prove payment authorization.
-- Tier applications must have a monthly component; absence must not bypass it.
-- Existing provider webhook maps authorized trialing subscriptions to active.
CREATE OR REPLACE FUNCTION activate_enterprise_license_from_quote(p_quote_id UUID)
RETURNS organization_licenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_quote sales_quotes;
  v_app professional_applications;
  v_license organization_licenses;
  v_prefix TEXT;
  v_year INTEGER;
  v_seq INTEGER;
  v_license_number TEXT;
  v_required_type TEXT;
  v_tier license_tier_catalog;
  v_anchor_date DATE;
  v_anchor_tz TEXT;
BEGIN
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'No such quote (%)', p_quote_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enterprise_billing_accounts eba WHERE eba.quote_id = p_quote_id AND eba.billing_component = 'annual_license' AND eba.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No confirmed-paid Enterprise billing account exists for quote % -- license cannot activate without confirmed payment', p_quote_id;
  END IF;

  -- The monthly component, when this quote has one (every self-service
  -- tier-based application does; a negotiated manual quote may not),
  -- must ALSO have a confirmed recurring-payment authorization before
  -- activation -- "capture valid recurring-payment authorization"
  -- applies even though its first real invoice is deferred.
  IF (EXISTS (SELECT 1 FROM professional_applications WHERE application_details->>'originatingQuoteId' = p_quote_id::text AND selected_tier_code IS NOT NULL)
      OR EXISTS (SELECT 1 FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'monthly_patients'))
     AND NOT EXISTS (SELECT 1 FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'monthly_patients' AND status = 'active' AND NULLIF(btrim(stripe_subscription_id), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'The monthly active-patient subscription has no confirmed recurring-payment authorization yet for quote %', p_quote_id;
  END IF;

  FOREACH v_required_type IN ARRAY ARRAY['saas_license', 'baa'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM enterprise_contracts ec
      WHERE ec.quote_id = p_quote_id AND ec.contract_type = v_required_type AND ec.status = 'executed'
        AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
    ) THEN
      RAISE EXCEPTION 'A required % agreement for quote % has not yet been executed -- license cannot activate until it is', v_required_type, p_quote_id;
    END IF;
  END LOOP;

  SELECT * INTO v_app FROM professional_applications
  WHERE application_details->>'originatingQuoteId' = p_quote_id::text
    AND status IN ('approved', 'payment_verified', 'provisioning_pending') AND target_organization_id IS NOT NULL
  ORDER BY platform_owner_approved_at DESC
  LIMIT 1;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No approved Director application with an organization references quote % yet -- license cannot activate before approval', p_quote_id;
  END IF;

  SELECT * INTO v_license FROM organization_licenses WHERE organization_id = v_app.target_organization_id FOR UPDATE;
  IF v_license.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration row exists for organization %', v_app.target_organization_id;
  END IF;

  IF v_license.status = 'active' AND v_license.license_number IS NOT NULL THEN
    RETURN v_license;
  END IF;

  IF v_app.selected_tier_code IS NOT NULL THEN
    SELECT * INTO v_tier FROM license_tier_catalog WHERE tier_code = v_app.selected_tier_code;
    v_prefix := CASE v_app.selected_tier_code
      WHEN 'essential' THEN 'MMA-ES' WHEN 'plus' THEN 'MMA-PL' WHEN 'complete' THEN 'MMA-CO' ELSE NULL
    END;
  ELSE
    v_prefix := CASE v_quote.package_type
      WHEN 'integrated_care' THEN 'MMA-FE'
      WHEN 'therapist' THEN 'MMA-TE'
      ELSE NULL
    END;
  END IF;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Unrecognized package type % / tier % on quote % -- cannot issue a license number', v_quote.package_type, v_app.selected_tier_code, p_quote_id;
  END IF;

  v_year := EXTRACT(YEAR FROM now())::INTEGER;

  INSERT INTO enterprise_license_sequences (year, prefix, next_value)
  VALUES (v_year, v_prefix, 1)
  ON CONFLICT (year, prefix) DO UPDATE SET next_value = enterprise_license_sequences.next_value + 1
  RETURNING next_value INTO v_seq;

  v_license_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  v_anchor_date := NULLIF(v_app.application_details->>'monthlyBillingAnchorDate', '')::DATE;
  v_anchor_tz := NULLIF(v_app.application_details->>'monthlyBillingTimezone', '');

  UPDATE organization_licenses SET
    status = 'active', license_number = v_license_number,
    licensed_seats = v_quote.proposed_licensed_seats, covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
    annual_license_fee = v_quote.annual_license_fee,
    license_tier_code = v_app.selected_tier_code,
    specialist_slot_count = COALESCE(v_tier.specialist_slot_count, specialist_slot_count),
    legacy_package_type_at_issuance = v_quote.package_type,
    monthly_billing_anchor_date = v_anchor_date,
    monthly_billing_timezone = v_anchor_tz,
    activated_by = v_app.applicant_user_id, activated_at = now(), updated_at = now()
  WHERE id = v_license.id
  RETURNING * INTO v_license;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'enterprise_license_activated', v_app.applicant_user_id, 'system', v_app.status, v_app.status, 'License activated: ' || v_license_number);

  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION activate_enterprise_license_from_quote(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION activate_enterprise_license_from_quote(UUID) TO service_role;
