-- sales_quotes.proposed_covered_patient_capacity was NOT NULL (migration
-- 107), matching the original manual-quote-only design where the
-- Platform Owner always specified a concrete included-capacity number.
-- A tier-based self-service license deliberately has no fixed included
-- capacity at all -- patients are metered and billed monthly by actual
-- census instead (calculate_monthly_patient_fee_cents()) -- so this
-- quote-level proposal column must be able to carry that same "no
-- fixed cap" NULL the downstream organization_licenses.
-- covered_patient_capacity column has always accepted (migration 035:
-- `CHECK (covered_patient_capacity IS NULL OR ... >= 0)`). Relaxing
-- NOT NULL here never affects any existing row (every one already has
-- a real value) and the pre-existing CHECK already treats NULL as
-- satisfied, per ordinary SQL NULL-comparison semantics -- purely
-- additive.
ALTER TABLE sales_quotes ALTER COLUMN proposed_covered_patient_capacity DROP NOT NULL;

-- MMA-PROF-ONBOARD-004 P0-2 Phase 3 -- the one canonical self-service
-- entry point. Both permitted entry methods (public website; a secure
-- invitation) converge into the SAME underlying mechanism this
-- repository already built and has tested for months: a
-- sales_prospects -> sales_quotes -> professional_applications chain,
-- the existing EnterpriseActivationSection payment UI, the existing
-- webhook-driven activate_enterprise_license_from_quote(). Nothing here
-- is a second, parallel sales/licensing engine -- it is a new, narrowly
-- scoped RPC that lets an ORDINARY authenticated applicant create their
-- OWN prospect+quote (price always computed server-side from the
-- published tier catalog, NEVER client-supplied), where before only the
-- Platform Owner could create one at all.
--
-- "No ordinary client may invoke privileged Platform Owner operations
-- to impersonate an administrator" is satisfied by NOT reusing
-- platform_owner_create_prospect/platform_owner_create_quote (which
-- stay exactly as owner-gated as before) -- this is a distinct function
-- with its own, different, narrower authorization rule: any
-- authenticated user may create a prospect+quote attributed to
-- themselves, with the commercial terms always re-derived from
-- published, versioned catalog data.
--
-- "Do not force Bilal to complete operational configuration, staff
-- invitations or specialist assignments before purchase": the starter
-- application deliberately collects only identity/eligibility/billing
-- fields (step1 + step2 + a minimal billing object + step6
-- declarations) -- step3 (package/migration) and step4 (operations/
-- HIPAA/compliance) are explicitly NOT required pre-payment for this
-- entry path; they are collected during Step 10's post-activation
-- organization setup instead. This is a documented, additive carve-out
-- of validate_director_application_payload() -- the ORIGINAL six-step
-- wizard's existing all-six-steps-or-none rule is completely unchanged
-- for any submission that does not explicitly mark itself
-- 'applicationMode':'self_service_minimal'.

CREATE OR REPLACE FUNCTION validate_director_application_payload(p_details JSONB, p_contact_email TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_email_re TEXT := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
  -- COALESCE to a real boolean, never NULL: when 'applicationMode' is
  -- absent entirely (every existing full six-step wizard submission),
  -- `(NULL = 'self_service_minimal')` evaluates to SQL NULL, not
  -- false -- and `IF NOT v_self_service THEN` on a NULL is treated as
  -- false, silently SKIPPING every step3/step4 check below for the
  -- full wizard too. Caught by this engagement's own pre-existing
  -- regression suite (codexF10SixStepServerValidation.test.ts), not by
  -- inspection -- confirms why "run the full suite before trusting a
  -- change," not just the new tests, matters here.
  v_self_service BOOLEAN := COALESCE((p_details->>'applicationMode') = 'self_service_minimal', false);
  s1 JSONB := COALESCE(p_details->'step1', '{}'::jsonb);
  s2 JSONB := COALESCE(p_details->'step2', '{}'::jsonb);
  s3 JSONB := COALESCE(p_details->'step3', '{}'::jsonb);
  s4 JSONB := COALESCE(p_details->'step4', '{}'::jsonb);
  s5 JSONB := COALESCE(p_details->'step5', '{}'::jsonb);
  s6 JSONB := COALESCE(p_details->'step6', '{}'::jsonb);
BEGIN
  -- Step 1 -- Organization legal identity (required in BOTH modes).
  IF btrim(COALESCE(s1->>'legalBusinessName', '')) = '' THEN RAISE EXCEPTION 'Registered legal business name is required'; END IF;
  IF btrim(COALESCE(s1->>'legalForm', '')) = '' THEN RAISE EXCEPTION 'Legal entity type is required'; END IF;
  IF btrim(COALESCE(s1->>'businessClassification', '')) = '' THEN RAISE EXCEPTION 'Business classification is required'; END IF;
  IF btrim(COALESCE(s1->>'formationJurisdiction', '')) = '' THEN RAISE EXCEPTION 'Formation jurisdiction is required'; END IF;
  IF btrim(COALESCE(s1->>'registeredAddress', '')) = '' THEN RAISE EXCEPTION 'Registered address is required'; END IF;
  IF btrim(COALESCE(s1->>'businessPhone', '')) = '' THEN RAISE EXCEPTION 'Business phone is required'; END IF;
  IF btrim(COALESCE(s1->>'businessEmail', '')) = '' OR (s1->>'businessEmail') !~* v_email_re THEN RAISE EXCEPTION 'A valid business email is required'; END IF;
  IF NOT v_self_service THEN
    IF COALESCE((s1->>'operatingSameAsRegistered')::boolean, true) = false AND btrim(COALESCE(s1->>'operatingAddress', '')) = '' THEN
      RAISE EXCEPTION 'Principal operating address is required when it differs from the registered address';
    END IF;
    IF COALESCE((s1->>'numLocations')::int, 0) < 1 THEN RAISE EXCEPTION 'Number of operating locations must be at least 1'; END IF;
  END IF;

  -- Step 2 -- Founding Director identity and authority (required in BOTH modes).
  IF btrim(COALESCE(s2->>'fullLegalName', '')) = '' THEN RAISE EXCEPTION 'Director full legal name is required'; END IF;
  IF btrim(COALESCE(s2->>'verifiedBusinessEmail', '')) = '' OR (s2->>'verifiedBusinessEmail') !~* v_email_re THEN RAISE EXCEPTION 'A valid Director business email is required'; END IF;
  IF btrim(COALESCE(s2->>'verifiedBusinessEmail', '')) IS DISTINCT FROM btrim(COALESCE(p_contact_email, '')) THEN
    RAISE EXCEPTION 'The Director email on this submission does not match the application''s contact email';
  END IF;
  IF btrim(COALESCE(s2->>'mobile', '')) = '' THEN RAISE EXCEPTION 'Director mobile number is required'; END IF;
  IF btrim(COALESCE(s2->>'title', '')) = '' THEN RAISE EXCEPTION 'Director title is required'; END IF;
  IF btrim(COALESCE(s2->>'relationshipToEntity', '')) = '' THEN RAISE EXCEPTION 'Director relationship to the legal entity is required'; END IF;
  IF COALESCE((s2->>'authorizedSignatory')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Authorized-representative confirmation is required'; END IF;
  IF COALESCE((s2->>'authorityAttestation')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Authority attestation is required'; END IF;

  IF NOT v_self_service THEN
    -- Step 3 -- Enterprise package / operations setup (full wizard only).
    IF btrim(COALESCE(s3->>'buyerBillingContact', '')) = '' THEN RAISE EXCEPTION 'Buyer billing contact is required'; END IF;
    IF COALESCE(s3->>'migrationStatus', '') = 'requested' THEN
      IF btrim(COALESCE(s3->>'migrationDetails', '')) = '' THEN RAISE EXCEPTION 'Migration details are required when a migration is requested'; END IF;
      IF COALESCE((s4->>'migrationConsent')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Migration consent is required when a migration is requested'; END IF;
    END IF;

    -- Step 4 -- Operations & compliance (full wizard only -- deferred to
    -- post-activation organization setup for self-service, per the
    -- directive's own explicit instruction).
    IF btrim(COALESCE(s4->>'services', '')) = '' THEN RAISE EXCEPTION 'Services provided is required'; END IF;
    IF btrim(COALESCE(s4->>'careSetting', '')) = '' THEN RAISE EXCEPTION 'Care setting is required'; END IF;
    IF btrim(COALESCE(s4->>'jurisdictions', '')) = '' THEN RAISE EXCEPTION 'Operating jurisdictions is required'; END IF;
    IF COALESCE(s4->>'phiIntendedUse', '') NOT IN ('yes', 'no') THEN RAISE EXCEPTION 'Whether this organization will process PHI is required'; END IF;
    IF COALESCE(s4->>'hipaaDeclaration', '') NOT IN ('covered_entity', 'business_associate', 'not_applicable', 'unsure') THEN
      RAISE EXCEPTION 'A HIPAA relationship declaration is required';
    END IF;
    IF s4->>'phiIntendedUse' = 'yes' THEN
      IF btrim(COALESCE(s4->>'privacyContact', '')) = '' THEN RAISE EXCEPTION 'A privacy contact is required when this organization will process PHI'; END IF;
      IF btrim(COALESCE(s4->>'securityContact', '')) = '' THEN RAISE EXCEPTION 'A security contact is required when this organization will process PHI'; END IF;
      IF btrim(COALESCE(s4->>'baaSignatory', '')) = '' THEN RAISE EXCEPTION 'A BAA signatory is required when this organization will process PHI'; END IF;
    END IF;
  END IF;

  -- Step 5 -- Billing profile. Self-service collects the SAME four
  -- fields the directive's own "Starter introductory application"
  -- names (billing contact information) -- currency/cadence are fixed
  -- (usd/annual) by the commercial catalog for self-service, so those
  -- two existing wizard-only fields are not required in this mode.
  IF btrim(COALESCE(s5->>'billingContact', '')) = '' THEN RAISE EXCEPTION 'Billing contact is required'; END IF;
  IF btrim(COALESCE(s5->>'billingAddress', '')) = '' THEN RAISE EXCEPTION 'Billing address is required'; END IF;
  IF btrim(COALESCE(s5->>'billingEmail', '')) = '' OR (s5->>'billingEmail') !~* v_email_re THEN RAISE EXCEPTION 'A valid billing email is required'; END IF;
  IF NOT v_self_service THEN
    IF btrim(COALESCE(s5->>'billingLegalEntity', '')) = '' THEN RAISE EXCEPTION 'Billing legal entity is required'; END IF;
    IF btrim(COALESCE(s5->>'currency', '')) = '' THEN RAISE EXCEPTION 'Billing currency is required'; END IF;
    IF btrim(COALESCE(s5->>'cadence', '')) = '' THEN RAISE EXCEPTION 'Billing cadence is required'; END IF;
  END IF;

  -- Step 6 -- Review & declarations (required in BOTH modes -- the
  -- directive's own "Required eligibility and compliance declarations"
  -- for the starter application).
  IF COALESCE((s6->>'accuracyAttestation')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'The accuracy attestation is required'; END IF;
  IF COALESCE((s6->>'authorizedSignatoryConfirmed')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'The authorized-signatory confirmation is required'; END IF;
  IF COALESCE((s6->>'privacyAck')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'The privacy-practices acknowledgment is required'; END IF;
  IF btrim(COALESCE(s6->>'signatureName', '')) = '' THEN RAISE EXCEPTION 'A typed signature name is required'; END IF;
END;
$$;

-- start_self_service_application(): the ONE entry point for BOTH
-- permitted self-service methods.
--
-- p_invitation_token present -> 'invitation' entry: redeems the
-- EXISTING, already-hashed/expiring/single-use sales_quote_invitations
-- token via the existing redeem_quote_invitation() RPC, reusing
-- whatever package_type/seats/capacity the Platform Owner already
-- negotiated into that quote -- "invitations may prepopulate customer
-- information or establish negotiated commercial terms." An
-- invitation-redeemed application has NO tier_code at all (it is
-- quote/package_type-driven, exactly like the pre-existing
-- DirectorApplicationWizard path, and issues a legacy MMA-FE/MMA-TE
-- license number, not a new tier prefix) -- p_selected_tier_code is
-- ignored for this branch.
--
-- p_invitation_token absent -> 'public_website' entry: this function
-- creates a brand-new prospect+quote itself, attributed to the
-- applicant, with annual_license_fee ALWAYS computed server-side via
-- calculate_annual_license_charge() against the published tier catalog
-- -- never from a client-supplied amount. This is a materially
-- different authorization rule from platform_owner_create_prospect()/
-- platform_owner_create_quote() (which remain exactly as
-- Platform-Owner-gated as before, for the negotiated/manual path) --
-- an ordinary applicant may only ever create a prospect+quote
-- attributed to themselves, at a catalog-derived price, through this
-- one function.
--
-- Default starting licensed_seats per tier (owner-adjustable afterward
-- via the existing org_configure_license()) -- a documented, sensible
-- allocation, not a hard permanent limit: Essential 5, Plus 10,
-- Complete 20. covered_patient_capacity is deliberately left NULL for
-- every tier-based license: patients are metered and billed monthly by
-- actual census (calculate_monthly_patient_fee_cents()), not capped by
-- a fixed included-capacity number the way the legacy package model
-- worked.
--
-- A coupon, if supplied, is redeemed ATOMICALLY as part of this same
-- call, against the application row this function itself just created
-- -- never a separate, racy client round trip between "create
-- application" and "apply coupon."
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

  INSERT INTO professional_applications (
    applicant_user_id, requested_office, proposed_organization_name, proposed_package_type,
    legal_name, contact_email, application_details, status, platform_owner_approval_required,
    entry_method, selected_tier_code, initial_expected_active_patients, annual_license_fee_snapshot_cents
  ) VALUES (
    auth.uid(), 'director', v_org_name, v_package_type,
    btrim(p_legal_name), btrim(p_contact_email), v_details, 'auto_verification_pending', true,
    v_entry_method, v_effective_tier_code, p_initial_expected_active_patients, v_final_cents
  ) RETURNING * INTO v_app;

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

-- ============================================================================
-- run_automated_application_verification(): the directive's "automated
-- business, identity, duplication and eligibility verification," built
-- honestly from what this system can genuinely check without a live
-- third-party KYB/business-identity-verification provider (no such
-- provider is integrated anywhere in this repository -- confirmed by a
-- full-repo search; none is fabricated here). What IS real and
-- deterministic:
--   1. Required-field completeness -- already enforced at submission by
--      validate_director_application_payload(); an application cannot
--      reach this function without having passed it.
--   2. Director-email / contact-email cross-match -- already enforced
--      at submission (same validator).
--   3. Duplicate-organization-name detection -- a real, live query
--      against existing organizations AND other in-flight applications.
--   4. The applicant's own six-step attestations (accuracy,
--      authorized-signatory, privacy acknowledgment) are present and
--      true -- already enforced at submission.
-- A suspected duplicate name is flagged for EXCEPTION REVIEW
-- ('manual_review'), never auto-rejected -- a shared or similar
-- legitimate business name is a real possibility a human must judge,
-- matching "do not automatically approve... suspicious duplicates" by
-- routing to a human rather than silently approving OR silently
-- rejecting. Everything else passing moves the application directly to
-- 'agreements_pending' -- there is no separate persisted "verified"
-- resting state (see this migration file's own header note).
-- ============================================================================
CREATE OR REPLACE FUNCTION run_automated_application_verification(p_application_id UUID)
RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_duplicate_count INTEGER;
  v_result JSONB;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status <> 'auto_verification_pending' THEN
    RAISE EXCEPTION 'This application is not awaiting automated verification (current status: %)', v_app.status;
  END IF;

  SELECT count(*) INTO v_duplicate_count FROM organizations WHERE lower(btrim(name)) = lower(btrim(v_app.proposed_organization_name));
  SELECT v_duplicate_count + count(*) INTO v_duplicate_count FROM professional_applications
    WHERE id <> v_app.id AND requested_office = 'director'
      AND status NOT IN ('rejected', 'withdrawn', 'draft', 'canceled')
      AND lower(btrim(proposed_organization_name)) = lower(btrim(v_app.proposed_organization_name));

  IF v_duplicate_count > 0 THEN
    v_result := jsonb_build_object(
      'checked_at', now(), 'decision', 'manual_review',
      'duplicate_name_check', 'flagged', 'duplicate_count', v_duplicate_count
    );
    UPDATE professional_applications SET
      status = 'manual_review', auto_verification_result = v_result,
      exception_review_reason = 'A business with the same or a very similar name already exists in this system. A Platform Owner must confirm this is a genuinely distinct organization before proceeding.',
      updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'auto_verification_flagged', NULL, 'system', 'auto_verification_pending', 'manual_review', 'Duplicate organization name detected');
    RETURN v_app;
  END IF;

  v_result := jsonb_build_object('checked_at', now(), 'decision', 'verified', 'duplicate_name_check', 'pass');
  UPDATE professional_applications SET
    status = 'agreements_pending', auto_verification_result = v_result, updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;
  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'auto_verified', NULL, 'system', 'auto_verification_pending', 'agreements_pending', 'Automated verification passed');

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION run_automated_application_verification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION run_automated_application_verification(UUID) TO authenticated, service_role;

-- platform_owner_resolve_manual_review(): the Platform Owner's
-- exception-review decision for an application run_automated_
-- application_verification() flagged -- either confirms it as
-- genuinely distinct (continues to agreements_pending) or rejects it
-- with a reason, exactly the two dispositions the directive names
-- ("Owner dashboard: approve/reject/return-for-correction").
CREATE OR REPLACE FUNCTION platform_owner_resolve_manual_review(p_application_id UUID, p_decision TEXT, p_reason TEXT)
RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_app professional_applications;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may resolve an exception review'; END IF;
  IF p_decision NOT IN ('confirmed_distinct', 'rejected', 'return_for_correction') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status <> 'manual_review' THEN RAISE EXCEPTION 'This application is not in exception review'; END IF;

  IF p_decision = 'confirmed_distinct' THEN
    UPDATE professional_applications SET status = 'agreements_pending', exception_review_reason = NULL, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'manual_review_resolved', auth.uid(), 'platform_owner', 'manual_review', 'agreements_pending', COALESCE(p_reason, 'Confirmed as a genuinely distinct organization'));
  ELSIF p_decision = 'rejected' THEN
    IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required to reject'; END IF;
    UPDATE professional_applications SET status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'rejected', auth.uid(), 'platform_owner', 'manual_review', 'rejected', p_reason);
  ELSE
    IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required to return an application for correction'; END IF;
    UPDATE professional_applications SET status = 'info_required', correction_request = p_reason, correction_requested_at = now(), correction_requested_by = auth.uid(), updated_at = now()
    WHERE id = p_application_id RETURNING * INTO v_app;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'info_requested', auth.uid(), 'platform_owner', 'manual_review', 'info_required', p_reason);
  END IF;

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_resolve_manual_review(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_resolve_manual_review(UUID, TEXT, TEXT) TO authenticated;
