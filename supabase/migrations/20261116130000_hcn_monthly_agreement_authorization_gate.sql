-- Apply the initial-purchase agreement prerequisite to the monthly component
-- as well as annual billing. A legacy annual row is not signature evidence.
CREATE OR REPLACE FUNCTION public.create_enterprise_monthly_billing_component(p_quote_id UUID, p_billing_timezone TEXT DEFAULT 'America/Chicago')
RETURNS public.enterprise_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_quote sales_quotes;
  v_app professional_applications;
  v_estimated_cents INTEGER;
  v_anchor RECORD;
  v_row enterprise_billing_accounts;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id AND status = 'sent';
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'No sent quote found for that id'; END IF;
  SELECT * INTO v_app FROM professional_applications
    WHERE application_details->>'originatingQuoteId' = p_quote_id::text AND applicant_user_id = auth.uid();
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'You do not have an application referencing this quote'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES ('saas_license'), ('baa')) AS required(contract_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM enterprise_contracts ec
      WHERE ec.quote_id = p_quote_id AND ec.contract_type = required.contract_type AND ec.status = 'executed'
        AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
    )
  ) THEN
    RAISE EXCEPTION 'Both the SaaS License Agreement and Business Associate Agreement must be executed before billing authorization can begin for this application';
  END IF;

  v_estimated_cents := calculate_monthly_patient_fee_cents(COALESCE(v_app.initial_expected_active_patients, 0));
  IF v_estimated_cents IS NULL THEN
    RAISE EXCEPTION 'An organization with over 1,000 expected active patients requires a custom Enterprise quote for monthly billing -- it cannot be set up through self-service checkout';
  END IF;
  SELECT * INTO v_anchor FROM compute_next_month_billing_anchor(p_billing_timezone);
  INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, billing_component, created_by)
  VALUES (p_quote_id, (SELECT billing_contact_email FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'annual_license'), 'usd', v_estimated_cents, 'month', 'monthly_patients', auth.uid())
  ON CONFLICT (quote_id, billing_component) DO UPDATE SET unit_amount_cents = EXCLUDED.unit_amount_cents, updated_at = now()
  RETURNING * INTO v_row;
  UPDATE professional_applications SET
    application_details = jsonb_set(jsonb_set(application_details, '{monthlyBillingAnchorDate}', to_jsonb(v_anchor.anchor_date::text)), '{monthlyBillingTimezone}', to_jsonb(p_billing_timezone))
    WHERE id = v_app.id;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_enterprise_monthly_billing_component(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_monthly_billing_component(UUID,TEXT) TO authenticated;
