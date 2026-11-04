
-- HCN 2026-11-04: Owner-directed removal of the post-signature Stripe hold.
-- Preserve executed agreements and pricing. Do NOT mark an invoice paid or
-- invent a Stripe subscription. Only automatically verified, auto-provisioned
-- self-service Director organizations with BOTH live signed contracts qualify.
CREATE TABLE IF NOT EXISTS public.hcn_deferred_billing_activations (
  application_id uuid PRIMARY KEY REFERENCES public.professional_applications(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE RESTRICT,
  annual_fee_at_activation numeric NOT NULL CHECK (annual_fee_at_activation >= 0),
  authorization_basis text NOT NULL DEFAULT 'Owner-authorized bypass of Stripe activation hold, 2026-11-04',
  provider_payment_confirmed boolean NOT NULL DEFAULT false CHECK (provider_payment_confirmed = false),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hcn_deferred_billing_activations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_deferred_billing_activations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hcn_deferred_billing_activations TO service_role;
COMMENT ON TABLE public.hcn_deferred_billing_activations IS
'Explicit auditable deferred-billing activation. A row NEVER means a Stripe payment, stored payment authorization, or settled invoice. Only the approved post-agreement activation trigger may create one.';

CREATE OR REPLACE FUNCTION public.hcn_activate_signed_self_service_director(p_app public.professional_applications)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_quote public.sales_quotes;
  v_license public.organization_licenses;
  v_tier public.license_tier_catalog;
  v_quote_id uuid;
  v_member_status text;
  v_required text;
  v_prefix text;
  v_seq integer;
  v_year integer;
  v_license_number text;
BEGIN
  -- A deliberately narrow owner-approved payment-provider bypass, not a
  -- generic license activation, role escalation, or a payment verification.
  IF p_app.status <> 'agreements_executed'
     OR p_app.requested_office <> 'director'
     OR p_app.approved_office <> 'director'
     OR p_app.selected_tier_code NOT IN ('essential','plus','complete')
     OR p_app.target_organization_id IS NULL
     OR p_app.auto_verification_result->>'organization_auto_provisioned' IS DISTINCT FROM 'true'
  THEN
    RETURN false;
  END IF;

  v_quote_id := NULLIF(p_app.application_details->>'originatingQuoteId','')::uuid;
  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'HCN activation requires a real originating quote';
  END IF;

  SELECT * INTO v_quote FROM public.sales_quotes WHERE id = v_quote_id FOR SHARE;
  IF NOT FOUND OR v_quote.status NOT IN ('sent','accepted')
     OR v_quote.package_type IS DISTINCT FROM p_app.proposed_package_type THEN
    RAISE EXCEPTION 'HCN activation rejected: quote missing, invalid, or mismatched';
  END IF;

  SELECT * INTO v_tier FROM public.license_tier_catalog
  WHERE tier_code=p_app.selected_tier_code AND is_published=true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HCN activation rejected: tier not published';
  END IF;

  SELECT * INTO v_license FROM public.organization_licenses
  WHERE organization_id=p_app.target_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HCN activation rejected: organization license missing';
  END IF;
  IF v_license.status='active' AND v_license.license_number IS NOT NULL THEN
    -- Idempotent re-entry: never reactivate revoked/declined members.
    IF EXISTS (SELECT 1 FROM public.organization_memberships
       WHERE organization_id=p_app.target_organization_id
       AND user_id=p_app.applicant_user_id AND org_role='director' AND status='active')
    THEN RETURN true; END IF;
    RAISE EXCEPTION 'HCN activation rejected: active license without active applicant Director';
  END IF;
  IF v_license.status <> 'proposed' THEN
    RAISE EXCEPTION 'HCN activation rejected: cannot restore % license', v_license.status;
  END IF;

  SELECT status INTO v_member_status FROM public.organization_memberships
  WHERE organization_id=p_app.target_organization_id AND user_id=p_app.applicant_user_id
    AND org_role='director' FOR UPDATE;
  IF v_member_status IS DISTINCT FROM 'invited' THEN
    RAISE EXCEPTION 'HCN activation rejected: Director membership is not an eligible invitation';
  END IF;

  FOREACH v_required IN ARRAY ARRAY['saas_license','baa'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.enterprise_contracts c
      WHERE c.quote_id=v_quote_id AND c.contract_type=v_required
        AND c.status='executed'
        AND NOT EXISTS (SELECT 1 FROM public.enterprise_contracts replacement
                        WHERE replacement.supersedes_contract_id=c.id)
    ) THEN
      RAISE EXCEPTION 'HCN activation rejected: required executed agreement % missing', v_required;
    END IF;
  END LOOP;

  -- This exception applies ONLY while there is no processor billing account.
  -- Existing billing records must be reconciled through their actual provider.
  IF EXISTS (SELECT 1 FROM public.enterprise_billing_accounts WHERE quote_id=v_quote_id) THEN
    RAISE EXCEPTION 'HCN deferred-billing activation rejected: existing billing account must be reconciled';
  END IF;

  v_prefix := CASE p_app.selected_tier_code WHEN 'essential' THEN 'MMA-ES'
              WHEN 'plus' THEN 'MMA-PL' WHEN 'complete' THEN 'MMA-CO' END;
  v_year := EXTRACT(YEAR FROM now())::integer;
  INSERT INTO public.enterprise_license_sequences(year,prefix,next_value)
    VALUES(v_year,v_prefix,1)
  ON CONFLICT (year,prefix) DO UPDATE
    SET next_value=public.enterprise_license_sequences.next_value + 1
  RETURNING next_value INTO v_seq;
  v_license_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text,6,'0');

  INSERT INTO public.hcn_deferred_billing_activations
    (application_id,organization_id,quote_id,annual_fee_at_activation)
  VALUES (p_app.id,p_app.target_organization_id,v_quote_id,v_quote.annual_license_fee);

  -- Membership first: the existing license-status notification trigger needs
  -- the active Director. Changes are transaction-atomic with the license.
  UPDATE public.organization_memberships
     SET status='active',updated_at=now()
   WHERE organization_id=p_app.target_organization_id
     AND user_id=p_app.applicant_user_id AND org_role='director' AND status='invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HCN activation failed: invitation promotion did not occur';
  END IF;

  UPDATE public.organization_licenses SET
    status='active', license_number=v_license_number,
    licensed_seats=v_quote.proposed_licensed_seats,
    covered_patient_capacity=v_quote.proposed_covered_patient_capacity,
    annual_license_fee=v_quote.annual_license_fee,
    license_tier_code=p_app.selected_tier_code,
    specialist_slot_count=v_tier.specialist_slot_count,
    legacy_package_type_at_issuance=v_quote.package_type,
    monthly_billing_anchor_date=NULLIF(p_app.application_details->>'monthlyBillingAnchorDate','')::date,
    monthly_billing_timezone=NULLIF(p_app.application_details->>'monthlyBillingTimezone',''),
    activated_by=p_app.applicant_user_id, activated_at=now(),updated_at=now()
  WHERE id=v_license.id AND status='proposed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HCN activation failed: license changed concurrently';
  END IF;

  INSERT INTO public.professional_application_events
    (application_id,event_type,actor_user_id,actor_role,from_status,to_status,notes)
  VALUES(p_app.id,'hcn_owner_deferred_billing_activation',NULL,'system',
         'agreements_executed','active',
         'Owner-authorized processor bypass 2026-11-04. Both contracts executed; license and Director activated. No payment or recurring authorization represented as confirmed.');
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.hcn_activate_signed_self_service_director(public.professional_applications)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_activate_signed_self_service_director(public.professional_applications)
  TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_advance_application_after_agreements()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- BEFORE, not AFTER: change NEW in-place without a recursive same-row UPDATE.
  IF NEW.status='agreements_executed'
     AND public.hcn_activate_signed_self_service_director(NEW)
  THEN
    NEW.status := 'active';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_advance_application_after_agreements() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hcn_post_agreement_director_activation
  ON public.professional_applications;
CREATE TRIGGER hcn_post_agreement_director_activation
  BEFORE UPDATE OF status ON public.professional_applications
  FOR EACH ROW
  WHEN (NEW.status='agreements_executed')
  EXECUTE FUNCTION public.hcn_advance_application_after_agreements();

-- Repair already-executed applications. Rewriting the same status intentionally
-- fires the BEFORE trigger; it changes the resulting NEW.status to 'active'.
-- Only auto-provisioned Director applications with both contracts and all other
-- server-verified invariants above are eligible.
UPDATE public.professional_applications p SET status='agreements_executed'
WHERE p.status IN ('agreements_executed','payment_authorization_pending')
  AND p.requested_office='director' AND p.approved_office='director'
  AND p.selected_tier_code IN ('essential','plus','complete')
  AND p.auto_verification_result->>'organization_auto_provisioned'='true';
