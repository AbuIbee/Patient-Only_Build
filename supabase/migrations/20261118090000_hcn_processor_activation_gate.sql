-- Historical deferred activations are immutable evidence, never processor proof.
DROP TRIGGER IF EXISTS hcn_post_agreement_director_activation ON public.professional_applications;
CREATE OR REPLACE FUNCTION public.hcn_activate_signed_self_service_director(p_app public.professional_applications)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT false; $$;
REVOKE ALL ON FUNCTION public.hcn_activate_signed_self_service_director(public.professional_applications) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hcn_quote_activation_ready(p_quote_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM sales_quotes q WHERE q.id=p_quote_id AND q.status IN ('sent','accepted')
   AND (q.annual_license_fee=0 OR EXISTS(SELECT 1 FROM enterprise_billing_accounts b WHERE b.quote_id=q.id AND b.billing_component='annual_license' AND b.status='active' AND b.stripe_subscription_id IS NOT NULL))
   AND NOT EXISTS(SELECT 1 FROM (VALUES('saas_license'),('baa')) r(t) WHERE NOT EXISTS(
     SELECT 1 FROM enterprise_contracts c WHERE c.quote_id=q.id AND c.contract_type=r.t AND c.status='executed'
       AND NOT EXISTS(SELECT 1 FROM enterprise_contracts x WHERE x.supersedes_contract_id=c.id)))
   AND (NOT EXISTS(SELECT 1 FROM professional_applications a WHERE a.application_details->>'originatingQuoteId'=q.id::text AND a.selected_tier_code IS NOT NULL)
        AND NOT EXISTS(SELECT 1 FROM enterprise_billing_accounts b WHERE b.quote_id=q.id AND b.billing_component='monthly_patients')
     OR EXISTS(SELECT 1 FROM enterprise_billing_accounts b WHERE b.quote_id=q.id AND b.billing_component='monthly_patients' AND b.status='active' AND nullif(btrim(b.stripe_subscription_id),'') IS NOT NULL)));
$$;
REVOKE ALL ON FUNCTION public.hcn_quote_activation_ready(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_quote_activation_ready(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_enforce_processor_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_quote uuid; BEGIN
 IF TG_TABLE_NAME='organization_licenses' THEN
   IF NEW.status<>'active' OR (TG_OP='UPDATE' AND OLD.status='active') THEN RETURN NEW; END IF;
   SELECT (a.application_details->>'originatingQuoteId')::uuid INTO v_quote FROM professional_applications a WHERE a.target_organization_id=NEW.organization_id AND a.application_details ? 'originatingQuoteId' LIMIT 1;
 ELSE
   IF NEW.org_role<>'director' OR NEW.status<>'active' OR (TG_OP='UPDATE' AND OLD.status='active' AND OLD.org_role='director') THEN RETURN NEW; END IF;
   SELECT (a.application_details->>'originatingQuoteId')::uuid INTO v_quote FROM professional_applications a WHERE a.target_organization_id=NEW.organization_id AND a.applicant_user_id=NEW.user_id AND a.application_details ? 'originatingQuoteId' LIMIT 1;
 END IF;
 IF v_quote IS NOT NULL AND NOT public.hcn_quote_activation_ready(v_quote) THEN RAISE EXCEPTION 'Activation requires verified processor outcomes for all chargeable components'; END IF;
 IF v_quote IS NULL AND auth.uid() IS NOT NULL THEN
   IF TG_TABLE_NAME='organization_licenses' THEN RAISE EXCEPTION 'Use the approved organization purchase and processor confirmation workflow'; END IF;
   IF NOT EXISTS(SELECT 1 FROM organization_licenses WHERE organization_id=NEW.organization_id AND status='active') THEN RAISE EXCEPTION 'Director office requires an activated organization license'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_enforce_processor_activation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hcn_license_processor_gate BEFORE INSERT OR UPDATE OF status ON public.organization_licenses FOR EACH ROW EXECUTE FUNCTION public.hcn_enforce_processor_activation();
CREATE TRIGGER hcn_director_processor_gate BEFORE INSERT OR UPDATE OF status,org_role ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.hcn_enforce_processor_activation();
CREATE OR REPLACE FUNCTION public.hcn_prevent_unverified_application_activation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 BEGIN
 IF TG_TABLE_NAME='hcn_deferred_billing_activations' THEN RAISE EXCEPTION 'Deferred processor bypass is retired; historical records are retained'; END IF;
 IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status<>'active') AND NEW.application_details ? 'originatingQuoteId' AND NOT public.hcn_quote_activation_ready((NEW.application_details->>'originatingQuoteId')::uuid) THEN RAISE EXCEPTION 'Application activation requires confirmed processor outcomes'; END IF;
 RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.hcn_prevent_unverified_application_activation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hcn_application_processor_gate BEFORE INSERT OR UPDATE OF status ON public.professional_applications FOR EACH ROW EXECUTE FUNCTION public.hcn_prevent_unverified_application_activation();
CREATE TRIGGER hcn_retire_deferred_activation BEFORE INSERT ON public.hcn_deferred_billing_activations FOR EACH ROW EXECUTE FUNCTION public.hcn_prevent_unverified_application_activation();

CREATE OR REPLACE FUNCTION public.activate_enterprise_license_from_quote(p_quote_id UUID)
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
  v_already_active BOOLEAN := false;
BEGIN
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'No such quote (%)', p_quote_id;
  END IF;

  IF NOT public.hcn_quote_activation_ready(p_quote_id) THEN RAISE EXCEPTION 'Both executed agreements and confirmed processor outcomes for all chargeable components are required'; END IF;

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
    AND status IN ('approved', 'agreements_executed', 'payment_authorization_pending', 'payment_verified', 'provisioning_pending', 'active') AND target_organization_id IS NOT NULL
  ORDER BY platform_owner_approved_at DESC
  LIMIT 1;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No approved Director application with an organization references quote % yet -- license cannot activate before approval', p_quote_id;
  END IF;

  SELECT * INTO v_license FROM organization_licenses WHERE organization_id = v_app.target_organization_id FOR UPDATE;
  IF v_license.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration row exists for organization %', v_app.target_organization_id;
  END IF;

  v_already_active := (v_license.status = 'active' AND v_license.license_number IS NOT NULL);

  -- P0-01 FIX, and ORDERING FIX: promote the Director's own membership
  -- to 'active' BEFORE the organization_licenses UPDATE below, not
  -- after. trg_notify_license_status() (migration 141) fires
  -- synchronously on that UPDATE and looks up an org_role='director'
  -- membership with status='active' to notify -- if the promotion
  -- happened afterward, that lookup would always find none yet and
  -- the "your license is active" notification would silently never
  -- fire (caught and reproduced via enterpriseNotifications.test.ts
  -- while verifying this migration). WHERE status='invited' is
  -- deliberate and exhaustive -- a no-op for an already-active
  -- membership (idempotent replay) and it can NEVER match a 'revoked'
  -- or 'declined' row (required negative scenario 5: a revoked
  -- Director cannot be resurrected by a payment retry).
  UPDATE organization_memberships SET status = 'active', updated_at = now()
  WHERE organization_id = v_app.target_organization_id
    AND user_id = v_app.applicant_user_id
    AND org_role = 'director'
    AND status = 'invited';

  IF NOT v_already_active THEN
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
  END IF;

  UPDATE professional_applications SET status='active',updated_at=now() WHERE id=v_app.id AND status<>'active';
  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_enterprise_license_from_quote(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.activate_enterprise_license_from_quote(UUID) TO service_role;

