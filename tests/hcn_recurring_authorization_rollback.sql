-- NEGATIVE gate tests only. SYNTHETIC billing fixtures are not payment evidence.
-- Run only in staging. Every row is rolled back; no external provider is called.
BEGIN;
DO $$
DECLARE
  actor uuid; prospect uuid; quote uuid; app uuid;
  scenario text; expected text; actual text; tier text; annual_cents integer;
BEGIN
  SELECT id INTO actor FROM public.profiles LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Test needs an existing staging profile'; END IF;
  FOREACH tier IN ARRAY ARRAY['essential','plus','complete'] LOOP
  annual_cents := CASE tier WHEN 'essential' THEN 39900 WHEN 'plus' THEN 59900 ELSE 79900 END;
  INSERT INTO public.sales_prospects(contact_name,contact_email,prospective_organization_name,created_by)
    VALUES ('SYNTHETIC ROLLBACK TEST','rollback@example.invalid','SYNTHETIC ROLLBACK TEST',actor) RETURNING id INTO prospect;
  INSERT INTO public.sales_quotes(prospect_id,package_type,proposed_licensed_seats,annual_license_fee,created_by)
    VALUES (prospect,'integrated_care',4,annual_cents/100,actor) RETURNING id INTO quote;
  INSERT INTO public.professional_applications(applicant_user_id,requested_office,legal_name,contact_email,proposed_organization_name,proposed_package_type,application_details,selected_tier_code,application_reference)
    VALUES (actor,'director','SYNTHETIC TEST','rollback@example.invalid','SYNTHETIC ROLLBACK TEST','integrated_care',jsonb_build_object('originatingQuoteId',quote),tier,'HCN-ROLLBACK-'||quote) RETURNING id INTO app;
  INSERT INTO public.enterprise_billing_accounts(quote_id,billing_contact_email,unit_amount_cents,billing_interval,status,created_by,billing_component)
    VALUES(quote,'rollback@example.invalid',annual_cents,'year','active',actor,'annual_license');
  FOREACH scenario IN ARRAY ARRAY['missing','pending','incomplete','past_due','canceled','active_null','active_blank','active'] LOOP
    DELETE FROM public.enterprise_billing_accounts WHERE quote_id=quote AND billing_component='monthly_patients';
    IF scenario <> 'missing' THEN
      INSERT INTO public.enterprise_billing_accounts(quote_id,billing_contact_email,unit_amount_cents,billing_interval,status,created_by,billing_component,stripe_subscription_id)
        VALUES(quote,'rollback@example.invalid',25000,'month',CASE WHEN scenario LIKE 'active%' THEN 'active' ELSE scenario END,actor,'monthly_patients',
          CASE scenario WHEN 'active_null' THEN NULL WHEN 'active_blank' THEN ' ' ELSE 'SYNTHETIC-NOT-A-STRIPE-SUBSCRIPTION' END);
    END IF;
    expected := CASE WHEN scenario='active' THEN 'A required saas_license agreement' ELSE 'The monthly active-patient subscription has no confirmed recurring-payment authorization' END;
    actual := NULL;
    BEGIN
      PERFORM public.activate_enterprise_license_from_quote(quote);
    EXCEPTION WHEN raise_exception THEN actual := SQLERRM;
    END;
    IF actual IS NULL OR position(expected IN actual)=0 THEN
      RAISE EXCEPTION 'FAIL scenario %: expected %, received %',scenario,expected,actual;
    END IF;
  END LOOP;
  END LOOP;
END $$;
SELECT 'PASS: 24 synthetic negative gate scenarios across three tiers; no activation or provider payment asserted' AS result;
ROLLBACK;
