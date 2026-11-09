-- HCN-STRIPE-CONNECT-001 -- one narrow, additive helper the new
-- hcn-stripe-webhook Edge Function needs for its organization-isolation
-- check: given a quote_id (always server-generated, carried in Stripe
-- object metadata this engagement's own checkout functions set -- never
-- client input), resolve which organization it actually belongs to.
--
-- This is the SAME resolution logic resolve_enterprise_billing_customer()
-- (migration 121) already implements, minus that function's own
-- auth.uid() ownership gate -- which makes sense for an authenticated
-- Director/applicant calling from the browser, but not for a trusted
-- server-to-server webhook call that has no Supabase JWT at all (Stripe
-- signs the request; there is no Supabase session to check). Never
-- granted to anon/authenticated -- service_role only, since it has no
-- per-caller ownership check of its own.
--
-- Does not touch, replace, or alter resolve_enterprise_billing_customer()
-- or any other existing function -- purely additive.
CREATE OR REPLACE FUNCTION public.hcn_resolve_organization_for_quote(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_organization_id UUID;
BEGIN
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

  RETURN v_organization_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_resolve_organization_for_quote(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_resolve_organization_for_quote(UUID) TO service_role;
