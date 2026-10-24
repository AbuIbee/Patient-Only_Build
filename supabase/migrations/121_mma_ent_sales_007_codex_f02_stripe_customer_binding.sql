-- CODEX F-02 (P0, release-blocking) — "Cross-organization Stripe
-- customer association." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-02,
-- target commit b362e119.
--
-- Confirmed root cause by reading the actual code:
-- create-enterprise-checkout-session/index.ts found-or-created a
-- Stripe customer by searching Stripe GLOBALLY for ANY customer with
-- the caller-supplied billingContactEmail and a generic
-- metadata.billing_type === 'enterprise' tag -- no organization, quote
-- owner, or billing-principal match required at all. Two organizations
-- whose billing contacts share (or an attacker who guesses) the same
-- email would be bound to the SAME Stripe customer, and that customer
-- id is later used to open a Billing Portal session -- a real
-- cross-tenant leak (payment methods, invoice history).
--
-- Fix: move the resolution out of the Edge Function and into a real,
-- independently testable, ownership-checked RPC -- consistent with
-- this engagement's dominant architecture (business logic as SQL
-- RPCs, Edge Functions as thin Stripe-calling wrappers) and unlike the
-- Edge Function itself, directly coverable by this migration's own
-- integration test. Mirrors create_enterprise_billing_account()'s own
-- ownership check exactly (migration 114): the caller must either be
-- the applicant whose own application references this exact quote, or
-- an active director of the organization whose quoted amendment
-- request references it -- never a client-supplied organization id.
--
-- Once ownership is confirmed, the ONLY Stripe customer this function
-- will ever offer to reuse is one already recorded against a PRIOR
-- billing account belonging to the SAME resolved organization (a
-- renewal/upgrade/re-quote for an org that already has one) -- never
-- a global email search. A brand-new application has no organization
-- yet (one is created only at Director approval) and correctly
-- resolves to NULL, meaning the Edge Function must create a fresh
-- Stripe customer -- there is nothing yet to bind to, and nothing to
-- leak.
CREATE OR REPLACE FUNCTION public.resolve_enterprise_billing_customer(p_quote_id UUID)
RETURNS TABLE (organization_id UUID, reusable_stripe_customer_id TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_organization_id UUID;
  v_customer_id TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM professional_applications pa
    WHERE pa.applicant_user_id = auth.uid() AND pa.application_details->>'originatingQuoteId' = p_quote_id::text
  ) AND NOT EXISTS (
    SELECT 1 FROM organization_amendment_requests oar
    WHERE oar.resulting_quote_id = p_quote_id AND oar.status = 'quoted' AND is_active_org_director(oar.organization_id)
  ) THEN
    RAISE EXCEPTION 'You do not have an application or amendment request referencing this quote';
  END IF;

  SELECT pa.target_organization_id INTO v_organization_id
  FROM professional_applications pa
  WHERE pa.application_details->>'originatingQuoteId' = p_quote_id::text AND pa.target_organization_id IS NOT NULL
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    SELECT oar.organization_id INTO v_organization_id
    FROM organization_amendment_requests oar
    WHERE oar.resulting_quote_id = p_quote_id
    LIMIT 1;
  END IF;

  IF v_organization_id IS NOT NULL THEN
    SELECT eba.stripe_customer_id INTO v_customer_id
    FROM enterprise_billing_accounts eba
    WHERE eba.stripe_customer_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM professional_applications pa2
          WHERE pa2.application_details->>'originatingQuoteId' = eba.quote_id::text AND pa2.target_organization_id = v_organization_id
        )
        OR EXISTS (
          SELECT 1 FROM organization_amendment_requests oar2
          WHERE oar2.resulting_quote_id = eba.quote_id AND oar2.organization_id = v_organization_id
        )
      )
    ORDER BY eba.created_at DESC
    LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_organization_id, v_customer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_enterprise_billing_customer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_enterprise_billing_customer(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_enterprise_billing_customer(UUID) FROM anon;
