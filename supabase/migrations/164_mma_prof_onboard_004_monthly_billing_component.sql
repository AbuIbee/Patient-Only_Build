-- MMA-PROF-ONBOARD-004 P0-2 Phase 6 -- the second, distinct commercial
-- obligation: a monthly active-patient subscription, separate from the
-- annual license charge, deferred to the first calendar day of the
-- month following activation, in an explicitly disclosed timezone.
--
-- enterprise_billing_accounts (migration 110) was 1:1 with a quote
-- (UNIQUE(quote_id)) because, until now, every quote only ever had ONE
-- commercial obligation. This migration adds billing_component so the
-- SAME table, SAME webhook dedupe mechanism
-- (enterprise_billing_events), and SAME status vocabulary now track
-- TWO independent obligations per quote -- never a second, parallel
-- billing table.
ALTER TABLE enterprise_billing_accounts
  ADD COLUMN IF NOT EXISTS billing_component TEXT NOT NULL DEFAULT 'annual_license'
    CHECK (billing_component IN ('annual_license', 'monthly_patients'));

ALTER TABLE enterprise_billing_accounts DROP CONSTRAINT IF EXISTS enterprise_billing_accounts_quote_id_key;
ALTER TABLE enterprise_billing_accounts ADD CONSTRAINT enterprise_billing_accounts_quote_component_key UNIQUE (quote_id, billing_component);

-- stripe_subscription_id/stripe_checkout_session_id already exist and
-- stay per-row -- the annual and monthly components now each carry
-- their OWN Stripe subscription id, never shared.

COMMENT ON COLUMN enterprise_billing_accounts.billing_component IS
  'annual_license = the yearly tier fee (coupon-eligible). monthly_patients = the graduated active-patient subscription, billing_cycle_anchor/trial_end deferred to the first of the next calendar month.';

-- create_enterprise_billing_account(): base body is migration 114's
-- (the LATEST prior version -- it added amendment-quote ownership
-- recognition; migration 110's original body, which my own first
-- attempt here mistakenly started from, would have silently REVERTED
-- that fix for every expansion/renewal/downgrade amendment quote,
-- exactly the regression-by-wrong-base-version class of mistake
-- migration 140's own header comment warns about. Caught by this
-- repository's own pre-existing regression suite
-- (organizationAmendmentRequests.test.ts), not by inspection -- this
-- correction replaces an earlier, incorrect CREATE OR REPLACE in this
-- same migration file before it was ever committed.
--
-- The ONLY real change from migration 114's body: the ON CONFLICT
-- target, which must now match the real UNIQUE(quote_id,
-- billing_component) constraint (this function's own INSERT never
-- names billing_component explicitly, so it always targets the
-- 'annual_license' row via the column's DEFAULT).
CREATE OR REPLACE FUNCTION create_enterprise_billing_account(p_quote_id UUID, p_billing_contact_email TEXT)
RETURNS enterprise_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_quote sales_quotes;
  v_interval TEXT;
  v_amount_cents INTEGER;
  v_row enterprise_billing_accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF btrim(coalesce(p_billing_contact_email, '')) = '' THEN
    RAISE EXCEPTION 'Billing contact email is required';
  END IF;

  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id AND status = 'sent';
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'No sent quote found for that id';
  END IF;

  -- Ownership: the caller must either be the applicant whose own
  -- application references this exact quote (initial activation), or
  -- an active director of the organization whose quoted amendment
  -- request references it (expansion/renewal/downgrade) -- never
  -- trust a client-supplied organization/application/request id for
  -- this check.
  IF NOT EXISTS (
    SELECT 1 FROM professional_applications pa
    WHERE pa.applicant_user_id = auth.uid() AND pa.application_details->>'originatingQuoteId' = p_quote_id::text
  ) AND NOT EXISTS (
    SELECT 1 FROM organization_amendment_requests oar
    WHERE oar.resulting_quote_id = p_quote_id AND oar.status = 'quoted' AND is_active_org_director(oar.organization_id)
  ) THEN
    RAISE EXCEPTION 'You do not have an application or amendment request referencing this quote';
  END IF;

  IF v_quote.annual_license_fee IS NULL THEN
    RAISE EXCEPTION 'This quote has no price yet -- the Platform Owner has not entered commercial terms';
  END IF;

  v_interval := CASE lower(btrim(coalesce(v_quote.billing_cadence, '')))
    WHEN 'monthly' THEN 'month' WHEN 'month' THEN 'month'
    WHEN 'annual' THEN 'year' WHEN 'annually' THEN 'year' WHEN 'yearly' THEN 'year' WHEN 'year' THEN 'year'
    ELSE NULL
  END;
  IF v_interval IS NULL THEN
    RAISE EXCEPTION 'This quote''s billing cadence (%) is not one Stripe checkout can bill -- the Platform Owner must set it to monthly or annual', v_quote.billing_cadence;
  END IF;

  v_amount_cents := ROUND(v_quote.annual_license_fee * 100)::INTEGER;

  INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, created_by)
  VALUES (p_quote_id, lower(btrim(p_billing_contact_email)), 'usd', v_amount_cents, v_interval, auth.uid())
  ON CONFLICT (quote_id, billing_component) DO UPDATE SET
    billing_contact_email = EXCLUDED.billing_contact_email,
    currency = EXCLUDED.currency,
    unit_amount_cents = EXCLUDED.unit_amount_cents,
    billing_interval = EXCLUDED.billing_interval,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION create_enterprise_billing_account(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_enterprise_billing_account(UUID, TEXT) TO authenticated;

-- ============================================================================
-- compute_next_month_billing_anchor(): "the first day of the next
-- calendar month in an explicitly defined billing timezone" (the
-- owner's own proposed deterministic default from the governing
-- directive). Returns BOTH the wall-clock date (for disclosure/display)
-- and the precise UTC instant (for Stripe's trial_end / billing_cycle_anchor,
-- which require a Unix timestamp) -- computed in SQL, never in
-- JavaScript, so there is one authoritative definition of "next
-- calendar month" for every caller.
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_next_month_billing_anchor(p_timezone TEXT DEFAULT 'America/Chicago')
RETURNS TABLE(anchor_date DATE, anchor_instant TIMESTAMP WITH TIME ZONE, anchor_unix BIGINT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_local_first_of_next_month TIMESTAMP;
  v_instant TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_timezone IS NULL OR btrim(p_timezone) = '' THEN
    RAISE EXCEPTION 'A billing timezone is required';
  END IF;
  -- Validates the timezone name itself fails closed on a typo/invalid
  -- IANA zone rather than silently falling back to UTC.
  PERFORM now() AT TIME ZONE p_timezone;

  v_local_first_of_next_month := date_trunc('month', (now() AT TIME ZONE p_timezone) + interval '1 month');
  v_instant := v_local_first_of_next_month AT TIME ZONE p_timezone;

  RETURN QUERY SELECT v_local_first_of_next_month::date, v_instant, extract(epoch FROM v_instant)::bigint;
END;
$$;
REVOKE ALL ON FUNCTION compute_next_month_billing_anchor(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compute_next_month_billing_anchor(TEXT) TO authenticated, service_role;

-- ============================================================================
-- create_enterprise_monthly_billing_component(): the monthly
-- counterpart to create_enterprise_billing_account() (migration 110),
-- which remains exactly as-is for the annual component. Re-derives the
-- CURRENT monthly fee from calculate_monthly_patient_fee_cents()
-- against the application's own initial_expected_active_patients --
-- an ESTIMATE establishing the recurring authorization amount at
-- checkout time, never a fixed quote: the actual monthly INVOICE
-- amount is always recomputed server-side from the real census at
-- each billing cycle (a separate, not-yet-built scheduled job -- see
-- the report's documented remaining gap), exactly as a Stripe
-- subscription item's price can be updated before each renewal without
-- re-collecting payment authorization.
--
-- Persists the computed anchor date/timezone onto organization_licenses
-- (migration 162's own columns) so it is disclosed identically
-- everywhere (checkout UI, the activation email, the Owner's own
-- billing-status view) from one authoritative source, set once at
-- checkout and never silently recomputed to a different "next month"
-- later if the real checkout happens to straddle a month boundary.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_enterprise_monthly_billing_component(p_quote_id UUID, p_billing_timezone TEXT DEFAULT 'America/Chicago')
RETURNS enterprise_billing_accounts
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

  IF NOT EXISTS (
    SELECT 1 FROM professional_applications pa
    WHERE pa.applicant_user_id = auth.uid() AND pa.application_details->>'originatingQuoteId' = p_quote_id::text
  ) THEN
    RAISE EXCEPTION 'You do not have an application referencing this quote';
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE application_details->>'originatingQuoteId' = p_quote_id::text AND applicant_user_id = auth.uid();

  v_estimated_cents := calculate_monthly_patient_fee_cents(COALESCE(v_app.initial_expected_active_patients, 0));
  IF v_estimated_cents IS NULL THEN
    RAISE EXCEPTION 'An organization with over 1,000 expected active patients requires a custom Enterprise quote for monthly billing -- it cannot be set up through self-service checkout';
  END IF;

  SELECT * INTO v_anchor FROM compute_next_month_billing_anchor(p_billing_timezone);

  INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, billing_component, created_by)
  VALUES (p_quote_id, (SELECT billing_contact_email FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'annual_license'), 'usd', v_estimated_cents, 'month', 'monthly_patients', auth.uid())
  ON CONFLICT (quote_id, billing_component) DO UPDATE SET
    unit_amount_cents = EXCLUDED.unit_amount_cents, updated_at = now()
  RETURNING * INTO v_row;

  UPDATE professional_applications SET
    application_details = jsonb_set(jsonb_set(application_details, '{monthlyBillingAnchorDate}', to_jsonb(v_anchor.anchor_date::text)), '{monthlyBillingTimezone}', to_jsonb(p_billing_timezone))
  WHERE id = v_app.id;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION create_enterprise_monthly_billing_component(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_enterprise_monthly_billing_component(UUID, TEXT) TO authenticated;

-- Persist the anchor onto organization_licenses too, at the moment the
-- license actually activates (not just the application) -- this is
-- the field the Owner's billing-status view and the activation email
-- read from, since an application's own JSONB is not guaranteed to
-- survive indefinitely as the organization's own operational record of
-- truth once it is a real, active license.
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
  IF EXISTS (SELECT 1 FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'monthly_patients')
     AND NOT EXISTS (SELECT 1 FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'monthly_patients' AND status IN ('active', 'incomplete') AND stripe_subscription_id IS NOT NULL) THEN
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
