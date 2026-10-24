-- CODEX F-04 (P1, release-blocking) — "Required agreement and BAA
-- gate fails open." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-04,
-- target commit b362e119.
--
-- Migration 117 (this engagement, earlier this session) already fixed
-- the half of this finding it had independently found: a VOIDED
-- contract no longer satisfies the gate. Confirmed by re-reading the
-- actual current gate logic that the OTHER half Codex names is still
-- real: "No contract rows -> no gate." Both
-- activate_enterprise_license_from_quote() and
-- apply_organization_amendment_from_quote() only ever check "IF a
-- non-executed head contract EXISTS for this quote, block" -- so an
-- organization that never had ANY contract record created for it
-- (contract creation has always been an entirely optional, manual
-- Platform Owner step) activates with ZERO agreement evidence at all.
-- Every organization covers patients and therefore necessarily
-- handles PHI regardless of package type (migration 035's own design:
-- "ONE patient-care package, Full Support, regardless of which org
-- package the organization itself purchased") -- so Codex's "a
-- PHI-intended application with no BAA row -> no BAA-specific block"
-- applies universally here, not conditionally by package.
--
-- Fix: both gates now REQUIRE an executed 'saas_license' AND an
-- executed 'baa' agreement to exist (not merely "if one exists, it
-- must be executed") before activation/application -- closing "no
-- contract rows -> no gate" for both agreement types this engagement
-- already models, universally, not package-conditionally (no new
-- legal requirement is invented; 'baa' already existed as a valid
-- contract_type since migration 115, it was simply never mandatory).
-- Supersession (migration 117) continues to work exactly as before --
-- only the head of a chain is checked, and void never satisfies it.
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
BEGIN
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'No such quote (%)', p_quote_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enterprise_billing_accounts eba WHERE eba.quote_id = p_quote_id AND eba.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No confirmed-paid Enterprise billing account exists for quote % -- license cannot activate without confirmed payment', p_quote_id;
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
    AND status = 'approved' AND target_organization_id IS NOT NULL
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

  v_prefix := CASE v_quote.package_type
    WHEN 'integrated_care' THEN 'MMA-FE'
    WHEN 'therapist' THEN 'MMA-TE'
    ELSE NULL
  END;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Unrecognized package type % on quote % -- cannot issue a license number', v_quote.package_type, p_quote_id;
  END IF;

  v_year := EXTRACT(YEAR FROM now())::INTEGER;
  SELECT COALESCE(MAX((regexp_match(license_number, '-(\d{6})$'))[1]::INTEGER), 0) + 1 INTO v_seq
  FROM organization_licenses WHERE license_number LIKE v_prefix || '-' || v_year || '-%';
  v_license_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  UPDATE organization_licenses SET
    status = 'active', license_number = v_license_number,
    licensed_seats = v_quote.proposed_licensed_seats, covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
    annual_license_fee = v_quote.annual_license_fee, activated_by = v_app.applicant_user_id, activated_at = now(), updated_at = now()
  WHERE id = v_license.id
  RETURNING * INTO v_license;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'enterprise_license_activated', v_app.applicant_user_id, 'system', 'approved', 'approved', 'License activated: ' || v_license_number);

  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION activate_enterprise_license_from_quote(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION activate_enterprise_license_from_quote(UUID) TO service_role;

CREATE OR REPLACE FUNCTION apply_organization_amendment_from_quote(p_quote_id UUID)
RETURNS organization_amendment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_request organization_amendment_requests;
  v_quote sales_quotes;
  v_license organization_licenses;
  v_required_type TEXT;
BEGIN
  SELECT * INTO v_request FROM organization_amendment_requests WHERE resulting_quote_id = p_quote_id AND status = 'quoted' FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'No quoted amendment request references quote %', p_quote_id;
  END IF;
  IF v_request.request_type = 'cancellation' THEN
    RAISE EXCEPTION 'Cancellation requests are applied directly by the Platform Owner, never through a paid checkout';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enterprise_billing_accounts eba WHERE eba.quote_id = p_quote_id AND eba.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No confirmed-paid Enterprise billing account exists for amendment quote % -- cannot apply without confirmed payment', p_quote_id;
  END IF;

  FOREACH v_required_type IN ARRAY ARRAY['saas_license', 'baa'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM enterprise_contracts ec
      WHERE ec.quote_id = p_quote_id AND ec.contract_type = v_required_type AND ec.status = 'executed'
        AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
    ) THEN
      RAISE EXCEPTION 'A required % agreement for amendment quote % has not yet been executed -- cannot apply until it is', v_required_type, p_quote_id;
    END IF;
  END LOOP;

  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'No such quote %', p_quote_id; END IF;

  SELECT * INTO v_license FROM organization_licenses WHERE organization_id = v_request.organization_id FOR UPDATE;
  IF v_license.id IS NULL THEN RAISE EXCEPTION 'No license configuration row exists for organization %', v_request.organization_id; END IF;

  UPDATE organization_licenses SET
    licensed_seats = v_quote.proposed_licensed_seats,
    covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
    annual_license_fee = v_quote.annual_license_fee,
    status = 'active',
    updated_at = now()
  WHERE id = v_license.id;

  UPDATE organization_amendment_requests SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = v_request.id RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;
REVOKE ALL ON FUNCTION apply_organization_amendment_from_quote(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION apply_organization_amendment_from_quote(UUID) TO service_role;
