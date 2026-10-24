-- OWNER DIRECTIVE MMA-ENT-SALES-006 — closes a real integration gap
-- found while wiring the Director-facing amendment-payment UI on top
-- of migration 113. create_enterprise_billing_account(),
-- get_my_enterprise_billing_status(), and the "An applicant can view
-- their own enterprise billing account" RLS policy all recognize
-- ownership of a quote through exactly one path: a
-- professional_applications row whose application_details->
-- >'originatingQuoteId' matches. An amendment quote (migration 113)
-- has NO such application -- it is linked only through
-- organization_amendment_requests.resulting_quote_id. Left unpatched,
-- a Director attempting to pay for an approved, quoted amendment
-- would be rejected by the exact same checkout flow that otherwise
-- works identically for an initial-activation quote.
--
-- Fix: every one of these three checks now recognizes EITHER path --
-- the original application-ownership check (unchanged, still the only
-- path for a brand-new organization's first quote) OR a 'quoted'
-- organization_amendment_requests row referencing the quote where the
-- caller is a currently active director of that request's
-- organization (not just the original requester -- any active
-- director of the same org may complete payment, consistent with
-- is_active_org_director() being the authority check used everywhere
-- else an org's directors act on the org's behalf).
DROP POLICY IF EXISTS "An applicant can view their own enterprise billing account" ON enterprise_billing_accounts;
CREATE POLICY "An applicant or amendment-org director can view the billing account"
  ON enterprise_billing_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM professional_applications pa
      WHERE pa.applicant_user_id = auth.uid()
        AND pa.application_details->>'originatingQuoteId' = enterprise_billing_accounts.quote_id::text
    )
    OR EXISTS (
      SELECT 1 FROM organization_amendment_requests oar
      WHERE oar.resulting_quote_id = enterprise_billing_accounts.quote_id
        AND oar.status = 'quoted'
        AND is_active_org_director(oar.organization_id)
    )
  );

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

  -- billing_cadence is deliberately free-text (migration 107 -- no
  -- invented fixed vocabulary); map only the two values Stripe's
  -- `recurring.interval` actually accepts, and fail closed rather than
  -- guess for anything else.
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
  ON CONFLICT (quote_id) DO UPDATE SET
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

CREATE OR REPLACE FUNCTION get_my_enterprise_billing_status(p_quote_id UUID)
RETURNS SETOF enterprise_billing_accounts
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT eba.* FROM enterprise_billing_accounts eba
  WHERE eba.quote_id = p_quote_id
    AND (
      EXISTS (
        SELECT 1 FROM professional_applications pa
        WHERE pa.application_details->>'originatingQuoteId' = eba.quote_id::text AND pa.applicant_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM organization_amendment_requests oar
        WHERE oar.resulting_quote_id = eba.quote_id AND oar.status = 'quoted' AND is_active_org_director(oar.organization_id)
      )
    );
$$;
REVOKE ALL ON FUNCTION get_my_enterprise_billing_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_enterprise_billing_status(UUID) TO authenticated;
