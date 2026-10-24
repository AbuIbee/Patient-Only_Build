-- OWNER DIRECTIVE MMA-ENT-SALES-005 — Enterprise organization billing,
-- extending the EXISTING Stripe integration (same Stripe account/
-- secrets, same supabase/functions/stripe-webhook endpoint) rather than
-- a second payment provider or a separately hosted portal. Per the
-- owner's explicit architectural decision: no Enterprise Stripe Price
-- ID is required up front -- checkout is built with Stripe's own
-- dynamic `price_data` (currency/amount/interval computed server-side
-- from the immutable quote, never a pre-created fixed Price object).
--
-- Mandatory separation (owner directive §2): a brand-new pair of
-- tables, never the consumer `subscriptions` table. An Enterprise
-- Stripe event is routed by metadata.billing_type='enterprise' in the
-- webhook (see the accompanying Edge Function changes) and can only
-- ever write here; a consumer event carries no such metadata and can
-- only ever write to `subscriptions`, exactly as before this migration.
--
-- One billing account per quote (not per organization): at checkout
-- time no organization exists yet -- Phase G's
-- platform_owner_approve_director_application() is what actually
-- creates the organization, and only after an application is approved.
-- The quote is the one stable, immutable commercial-terms anchor that
-- exists continuously from checkout through to that later activation.
CREATE TABLE IF NOT EXISTS enterprise_billing_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id              UUID NOT NULL UNIQUE REFERENCES sales_quotes(id),
  billing_contact_email TEXT NOT NULL,
  -- Snapshot of the quote's commercial terms AT THE MOMENT a checkout
  -- session is created -- immutable from here even if the quote itself
  -- is later revised (a revision supersedes the quote with a new row,
  -- per migration 107; this snapshot is what the customer actually
  -- agreed to pay, not whatever the quote says today).
  currency              TEXT NOT NULL DEFAULT 'usd',
  unit_amount_cents     INTEGER NOT NULL CHECK (unit_amount_cents >= 0),
  billing_interval      TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  stripe_customer_id     TEXT,
  stripe_checkout_session_id TEXT,
  stripe_subscription_id TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'incomplete')),
  created_by            UUID NOT NULL REFERENCES profiles(id),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Replay-safe idempotent webhook processing: a Stripe event ID is
-- inserted exactly once; a retried/duplicated delivery hits the UNIQUE
-- constraint and is a deliberate no-op, never a second state change.
-- Append-only audit trail of every Enterprise billing event received,
-- separate from the consumer path (which still has none of this).
CREATE TABLE IF NOT EXISTS enterprise_billing_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id         TEXT NOT NULL UNIQUE,
  event_type              TEXT NOT NULL,
  billing_account_id      UUID REFERENCES enterprise_billing_accounts(id),
  payload                 JSONB NOT NULL,
  processed_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE enterprise_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_billing_events ENABLE ROW LEVEL SECURITY;

-- Platform Owner: full visibility (commercial/audit oversight).
CREATE POLICY "Platform Owner can view all enterprise billing accounts" ON enterprise_billing_accounts
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "Platform Owner can view all enterprise billing events" ON enterprise_billing_events
  FOR SELECT TO authenticated USING (is_platform_owner());

-- The applicant whose application references this quote may read their
-- own billing status (D9 tracking) -- never write directly; every write
-- is RPC-only (create_enterprise_billing_account) or webhook/
-- service-role-only (payment state transitions).
CREATE POLICY "An applicant can view their own enterprise billing account" ON enterprise_billing_accounts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM professional_applications pa
      WHERE pa.applicant_user_id = auth.uid()
        AND pa.application_details->>'originatingQuoteId' = enterprise_billing_accounts.quote_id::text
    )
  );

REVOKE EXECUTE ON FUNCTION is_platform_owner() FROM PUBLIC, anon;

-- create_enterprise_billing_account(): the ONLY client-reachable write
-- path. Re-derives currency/amount/interval from the live quote
-- server-side every time -- the caller-supplied p_billing_contact_email
-- is the only thing taken from the client; amount/currency/term can
-- never be tampered with via a browser request (owner directive §3:
-- "Ensure an applicant cannot change amount, currency, organization,
-- term, or entitlement through browser requests"). Idempotent: calling
-- it again for the same quote updates the one existing row (the UNIQUE
-- quote_id constraint), it never creates a second billing account.
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

  -- Ownership: the caller must be the applicant whose own application
  -- references this exact quote -- never trust a client-supplied
  -- organization/application id for this check.
  IF NOT EXISTS (
    SELECT 1 FROM professional_applications pa
    WHERE pa.applicant_user_id = auth.uid() AND pa.application_details->>'originatingQuoteId' = p_quote_id::text
  ) THEN
    RAISE EXCEPTION 'You do not have an application referencing this quote';
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
  JOIN professional_applications pa ON pa.application_details->>'originatingQuoteId' = eba.quote_id::text
  WHERE eba.quote_id = p_quote_id AND pa.applicant_user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION get_my_enterprise_billing_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_enterprise_billing_status(UUID) TO authenticated;
