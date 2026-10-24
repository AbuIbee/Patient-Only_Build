-- OWNER DIRECTIVE MMA-ENT-SALES-007-FINAL §5/F2 — "Superseded/voided
-- contracts cannot satisfy activation." §12 note (G): "The previously
-- discovered free-license activation defect requires a permanent
-- negative regression test" -- this migration fixes a SIBLING defect
-- of that same shape, caught by re-reading migration 115's own gate
-- against this directive's explicit requirement, not by a fabricated
-- Codex finding (no MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md
-- exists anywhere in this repository or accessible to this session --
-- confirmed by search before writing this migration).
--
-- THE DEFECT: activate_enterprise_license_from_quote() and
-- apply_organization_amendment_from_quote() (migration 115) gated on
-- `ec.status NOT IN ('executed', 'void')` -- treating a VOIDED
-- contract as equivalent to an EXECUTED one for activation purposes.
-- A voided contract is the Platform Owner's own record that THIS
-- PARTICULAR agreement attempt did not (or no longer does) count --
-- it must never be sufficient to let activation proceed. Fixed to
-- `ec.status <> 'executed'` (void now correctly blocks, exactly like
-- draft/presented).
--
-- THAT FIX ALONE WOULD BE A REGRESSION: enterprise_contracts had a
-- hard UNIQUE(quote_id, contract_type) constraint, so once a contract
-- was voided there was no way to create a replacement for the same
-- quote+type -- the Platform Owner would be permanently unable to
-- ever satisfy that requirement again. This migration adds real
-- supersession (mirroring sales_quotes.supersedes_quote_id, migration
-- 107): a voided contract can be superseded by a new row referencing
-- it, and the gate only looks at the HEAD of each (quote_id,
-- contract_type) chain -- the one row nothing else supersedes.
ALTER TABLE enterprise_contracts DROP CONSTRAINT enterprise_contracts_quote_id_contract_type_key;
ALTER TABLE enterprise_contracts ADD COLUMN IF NOT EXISTS supersedes_contract_id UUID REFERENCES enterprise_contracts(id);

-- platform_owner_create_contract(): now accepts an optional
-- p_supersedes_contract_id. Without it, a second contract for the
-- same (quote_id, contract_type) is refused outright (the original
-- UNIQUE constraint's intent, now enforced here instead of at the DB
-- level so a deliberate, explicit supersession can be allowed through).
-- With it, the referenced contract must be 'void' and for the SAME
-- quote+type -- never lets a live, unresolved contract be silently
-- replaced out from under an in-progress review.
--
-- The added parameter changes this function's argument-type list, so
-- CREATE OR REPLACE would silently create a SECOND overload rather
-- than replacing the original 5-argument one (the exact pitfall this
-- engagement has hit and documented before) -- drop the old signature
-- explicitly first.
DROP FUNCTION IF EXISTS platform_owner_create_contract(UUID, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION platform_owner_create_contract(
  p_quote_id UUID, p_contract_type TEXT, p_template_version TEXT, p_signatory_name TEXT, p_signatory_title TEXT,
  p_supersedes_contract_id UUID DEFAULT NULL
) RETURNS enterprise_contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row enterprise_contracts;
  v_predecessor enterprise_contracts;
  v_existing_head enterprise_contracts;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may create a contract record'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sales_quotes WHERE id = p_quote_id) THEN RAISE EXCEPTION 'No such quote'; END IF;
  IF btrim(coalesce(p_template_version, '')) = '' THEN RAISE EXCEPTION 'A template version is required -- never left blank or invented by this system'; END IF;
  IF btrim(coalesce(p_signatory_name, '')) = '' THEN RAISE EXCEPTION 'A signatory name is required'; END IF;

  IF p_supersedes_contract_id IS NOT NULL THEN
    SELECT * INTO v_predecessor FROM enterprise_contracts WHERE id = p_supersedes_contract_id FOR UPDATE;
    IF v_predecessor.id IS NULL THEN RAISE EXCEPTION 'No such contract to supersede'; END IF;
    IF v_predecessor.quote_id <> p_quote_id OR v_predecessor.contract_type <> p_contract_type THEN
      RAISE EXCEPTION 'A contract may only supersede a prior contract of the same quote and type';
    END IF;
    IF v_predecessor.status <> 'void' THEN
      RAISE EXCEPTION 'Only a voided contract may be superseded -- void it first if it needs to be replaced';
    END IF;
  ELSE
    -- No explicit supersession requested: refuse a second LIVE
    -- (non-void) contract for the same quote+type, preserving the
    -- original UNIQUE constraint's real intent.
    SELECT * INTO v_existing_head FROM enterprise_contracts
    WHERE quote_id = p_quote_id AND contract_type = p_contract_type AND status <> 'void'
    LIMIT 1;
    IF v_existing_head.id IS NOT NULL THEN
      RAISE EXCEPTION 'A live % contract already exists for this quote (status %) -- void it first, then create a superseding one', p_contract_type, v_existing_head.status;
    END IF;
  END IF;

  -- "Organization and legal signatory identities match": the
  -- signatory name on the contract must correspond to a real,
  -- verifiable identity already on file for this commercial
  -- relationship -- either the applicant's own legal_name (initial
  -- activation) or the amendment-requesting director's own profile
  -- name (expansion/renewal/downgrade) -- never an arbitrary string
  -- the owner could type without it tracing back to anyone real.
  IF NOT EXISTS (
    SELECT 1 FROM professional_applications pa
    WHERE pa.application_details->>'originatingQuoteId' = p_quote_id::text
      AND lower(btrim(pa.legal_name)) = lower(btrim(p_signatory_name))
  ) AND NOT EXISTS (
    SELECT 1 FROM organization_amendment_requests oar
    JOIN profiles pr ON pr.id = oar.requested_by
    WHERE oar.resulting_quote_id = p_quote_id
      AND lower(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, ''))) = lower(btrim(p_signatory_name))
  ) THEN
    RAISE EXCEPTION 'Signatory name "%" does not match any known legal identity for this quote (the applicant''s legal name or the requesting director''s own profile name) -- correct the name or verify the identity before proceeding', p_signatory_name;
  END IF;

  INSERT INTO enterprise_contracts (quote_id, contract_type, template_version, signatory_name, signatory_title, created_by, supersedes_contract_id)
  VALUES (p_quote_id, p_contract_type, p_template_version, p_signatory_name, p_signatory_title, auth.uid(), p_supersedes_contract_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_create_contract(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_create_contract(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- The license-activation gate: void no longer satisfies; only the
-- HEAD of each (quote_id, contract_type) supersession chain is
-- considered (a superseded row's own status is irrelevant -- the
-- chain's current row is what matters).
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

  -- A head-of-chain contract (nothing supersedes it) that is not
  -- 'executed' blocks activation, INCLUDING 'void' -- a voided
  -- contract with no replacement means the requirement is still
  -- genuinely unsatisfied, not waived.
  IF EXISTS (
    SELECT 1 FROM enterprise_contracts ec
    WHERE ec.quote_id = p_quote_id
      AND ec.status <> 'executed'
      AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
  ) THEN
    RAISE EXCEPTION 'A required agreement for quote % has not yet been executed -- license cannot activate until it is', p_quote_id;
  END IF;

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

  INSERT INTO enterprise_license_sequences (year, prefix, next_value)
  VALUES (v_year, v_prefix, 1)
  ON CONFLICT (year, prefix) DO UPDATE SET next_value = enterprise_license_sequences.next_value + 1
  RETURNING next_value INTO v_seq;

  v_license_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  UPDATE organization_licenses SET
    license_number = v_license_number,
    licensed_seats = v_quote.proposed_licensed_seats,
    covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
    annual_license_fee = v_quote.annual_license_fee,
    status = 'active',
    activated_by = NULL,
    activated_at = now(),
    updated_at = now()
  WHERE id = v_license.id
  RETURNING * INTO v_license;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'enterprise_license_activated', NULL, 'system', v_app.status, v_app.status,
    'License ' || v_license_number || ' activated for organization ' || v_app.target_organization_id || ' following confirmed Enterprise payment');

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

  IF EXISTS (
    SELECT 1 FROM enterprise_contracts ec
    WHERE ec.quote_id = p_quote_id
      AND ec.status <> 'executed'
      AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
  ) THEN
    RAISE EXCEPTION 'A required agreement for amendment quote % has not yet been executed -- cannot apply until it is', p_quote_id;
  END IF;

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
