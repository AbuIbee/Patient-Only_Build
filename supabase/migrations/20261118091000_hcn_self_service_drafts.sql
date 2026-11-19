CREATE OR REPLACE FUNCTION public.hcn_save_self_service_draft(p_snapshot jsonb)
RETURNS public.professional_applications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_app professional_applications; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1811));
 IF jsonb_typeof(p_snapshot)<>'object' OR octet_length(p_snapshot::text)>65536 OR coalesce(p_snapshot->>'step','') NOT IN ('tier','starter','pricing') THEN RAISE EXCEPTION 'Invalid application draft'; END IF;
 IF EXISTS(SELECT 1 FROM professional_applications WHERE applicant_user_id=auth.uid() AND status NOT IN ('draft','rejected','withdrawn','canceled')) THEN RAISE EXCEPTION 'Resume the submitted application instead'; END IF;
 IF EXISTS(SELECT 1 FROM professional_applications WHERE applicant_user_id=auth.uid() AND status='draft' AND application_details->>'applicationMode' IS DISTINCT FROM 'self_service_minimal') THEN RAISE EXCEPTION 'Resume the existing invited application instead'; END IF;
 INSERT INTO professional_applications(applicant_user_id,requested_office,proposed_organization_name,proposed_package_type,legal_name,contact_email,application_details,status,platform_owner_approval_required,entry_method)
 VALUES(auth.uid(),'director',nullif(btrim(p_snapshot->>'legalBusinessName'),''),'integrated_care',nullif(btrim(p_snapshot->>'fullLegalName'),''),nullif(btrim(p_snapshot->>'applicantEmail'),''),jsonb_build_object('applicationMode','self_service_minimal','selfServiceDraft',p_snapshot),'draft',true,'public_website')
 ON CONFLICT(applicant_user_id) WHERE(status='draft') DO UPDATE SET proposed_organization_name=EXCLUDED.proposed_organization_name,legal_name=EXCLUDED.legal_name,contact_email=EXCLUDED.contact_email,application_details=EXCLUDED.application_details,updated_at=now() RETURNING * INTO v_app;
 RETURN v_app;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_save_self_service_draft(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_save_self_service_draft(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION start_self_service_application(
  p_selected_tier_code TEXT,
  p_initial_expected_active_patients INTEGER,
  p_legal_name TEXT,
  p_contact_email TEXT,
  p_application_details JSONB,
  p_invitation_token TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
) RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tier license_tier_catalog;
  v_quote_id UUID;
  v_org_name TEXT;
  v_package_type TEXT;
  v_prospect_id UUID;
  v_final_cents INTEGER;
  v_seats INTEGER;
  v_capacity INTEGER;
  v_entry_method TEXT;
  v_effective_tier_code TEXT;
  v_details JSONB := COALESCE(p_application_details, '{}'::jsonb);
  v_app professional_applications;
  v_invite RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1811));
  IF btrim(COALESCE(p_legal_name, '')) = '' THEN RAISE EXCEPTION 'Legal name is required'; END IF;
  IF btrim(COALESCE(p_contact_email, '')) = '' THEN RAISE EXCEPTION 'Contact email is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM professional_applications
    WHERE applicant_user_id = auth.uid() AND status NOT IN ('draft', 'rejected', 'withdrawn', 'canceled')
  ) THEN
    RAISE EXCEPTION 'You already have an application in progress. Resume it instead of starting a new one.';
  END IF;

  IF p_invitation_token IS NOT NULL THEN
    v_entry_method := 'invitation';
    v_effective_tier_code := NULL;
    SELECT * INTO v_invite FROM redeem_quote_invitation(p_invitation_token);
    v_quote_id := v_invite.quote_id;
    v_org_name := v_invite.prospective_organization_name;
    v_package_type := v_invite.package_type;
    v_seats := v_invite.proposed_licensed_seats;
    v_capacity := v_invite.proposed_covered_patient_capacity;
    SELECT (annual_license_fee * 100)::INTEGER INTO v_final_cents FROM sales_quotes WHERE id = v_quote_id;
  ELSE
    v_entry_method := 'public_website';
    v_effective_tier_code := p_selected_tier_code;
    SELECT * INTO v_tier FROM license_tier_catalog WHERE tier_code = p_selected_tier_code AND is_published = true;
    IF v_tier.tier_code IS NULL THEN
      RAISE EXCEPTION 'Unknown or unpublished license tier: %', p_selected_tier_code;
    END IF;
    IF p_initial_expected_active_patients IS NULL OR p_initial_expected_active_patients < 0 THEN
      RAISE EXCEPTION 'An initial expected active-patient count is required';
    END IF;

    v_org_name := COALESCE(NULLIF(btrim(v_details->'step1'->>'legalBusinessName'), ''), btrim(p_legal_name));
    v_package_type := 'integrated_care'; -- base capability is unrestricted for every tier-based org; specialist slots (not package_type) govern specialist capacity, per migration 162.
    v_seats := CASE p_selected_tier_code WHEN 'essential' THEN 5 WHEN 'plus' THEN 10 WHEN 'complete' THEN 20 ELSE 5 END;
    v_capacity := NULL;

    SELECT final_cents INTO v_final_cents FROM calculate_annual_license_charge(p_selected_tier_code, NULL); -- unredeemed base price; coupon applied below, atomically, against the real application row.

    INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, notes, created_by)
    VALUES (btrim(p_legal_name), lower(btrim(p_contact_email)), v_org_name, 'Self-service: created by the applicant, not the Platform Owner.', auth.uid())
    RETURNING id INTO v_prospect_id;

    INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
    VALUES (v_prospect_id, v_package_type, v_seats, v_capacity, (v_final_cents::numeric / 100), 'annual', 'sent', auth.uid())
    RETURNING id INTO v_quote_id;
  END IF;

  v_details := jsonb_set(v_details, '{originatingQuoteId}', to_jsonb(v_quote_id::text));
  v_details := jsonb_set(v_details, '{applicationMode}', '"self_service_minimal"'::jsonb);

  PERFORM validate_director_application_payload(v_details, p_contact_email);

  UPDATE professional_applications SET requested_office='director',proposed_organization_name=v_org_name,proposed_package_type=v_package_type,
    legal_name=btrim(p_legal_name),contact_email=btrim(p_contact_email),application_details=v_details,status='auto_verification_pending',platform_owner_approval_required=true,
    entry_method=v_entry_method,selected_tier_code=v_effective_tier_code,initial_expected_active_patients=p_initial_expected_active_patients,annual_license_fee_snapshot_cents=v_final_cents,updated_at=now()
    WHERE applicant_user_id=auth.uid() AND status='draft' AND application_details->>'applicationMode'='self_service_minimal' RETURNING * INTO v_app;
  IF NOT FOUND THEN
  INSERT INTO professional_applications (
    applicant_user_id, requested_office, proposed_organization_name, proposed_package_type,
    legal_name, contact_email, application_details, status, platform_owner_approval_required,
    entry_method, selected_tier_code, initial_expected_active_patients, annual_license_fee_snapshot_cents
  ) VALUES (
    auth.uid(), 'director', v_org_name, v_package_type,
    btrim(p_legal_name), btrim(p_contact_email), v_details, 'auto_verification_pending', true,
    v_entry_method, v_effective_tier_code, p_initial_expected_active_patients, v_final_cents
  ) RETURNING * INTO v_app;
  END IF;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'submitted', auth.uid(), 'applicant', NULL, 'auto_verification_pending', 'Self-service application submitted via ' || v_entry_method);

  -- Coupon redemption (public-website tier purchases only -- an
  -- invitation's terms are already fixed by the quote the Platform
  -- Owner negotiated, and these two WELCOME coupons apply only to the
  -- catalog-priced self-service path).
  IF v_entry_method = 'public_website' AND btrim(COALESCE(p_coupon_code, '')) <> '' THEN
    DECLARE v_redemption enterprise_coupon_redemptions;
    BEGIN
      v_redemption := redeem_coupon_for_application(v_app.id, p_selected_tier_code, p_coupon_code);
      UPDATE professional_applications SET annual_license_fee_snapshot_cents = v_redemption.final_cents WHERE id = v_app.id RETURNING * INTO v_app;
      UPDATE sales_quotes SET annual_license_fee = (v_redemption.final_cents::numeric / 100), updated_at = now() WHERE id = v_quote_id;
    END;
  END IF;

  -- The directive frames this as one continuous step ("Perform required
  -- automated... verification. Qualified standard applicants may be
  -- automatically approved when all approved verification requirements
  -- pass") -- run it synchronously, in the same call, rather than
  -- requiring the client to remember a separate follow-up RPC.
  -- run_automated_application_verification() is defined later in this
  -- same migration file; PL/pgSQL function bodies are only resolved at
  -- EXECUTION time, not at CREATE time, so the forward reference is
  -- safe -- by the time anything actually calls this function, the
  -- whole migration has finished applying.
  RETURN run_automated_application_verification(v_app.id);
END;
$$;
REVOKE ALL ON FUNCTION start_self_service_application(TEXT, INTEGER, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_self_service_application(TEXT, INTEGER, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;