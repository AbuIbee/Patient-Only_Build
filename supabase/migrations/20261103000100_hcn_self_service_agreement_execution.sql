-- HCN-ONBOARDING-PRODUCTION-001, Section 2 — first-party agreement
-- execution. Closes the confirmed production dead end: ApplicationStatusPage's
-- 'agreements_pending'/'approved' branches have always said "Agreement
-- signing is not yet available in this workspace" because no
-- self-service signing path existed -- every function touching
-- enterprise_contracts (migration 115/117) is Platform-Owner-only,
-- built for the OWNER to attest to a real EXTERNAL execution process
-- (a DocuSign envelope, a wet-signature scan), never for an applicant
-- to execute their own organization's agreement in-app.
--
-- This migration adds exactly that: a self-service path, scoped to the
-- applicant's own quote, that creates AND executes an
-- enterprise_contracts row in one atomic step (no separate
-- Platform-Owner "present" step -- the applicant is both the
-- presenting and signing party for their own agreement), capturing
-- the directive's required evidence: affirmative consent, the
-- signer's own typed legal name, a server-side timestamp, the
-- authenticated signer's user id, the document version, and
-- (additively) consent-to-electronic-records and the signer's
-- client-reported user agent as supplementary attribution evidence.
--
-- CONFIRMED (not assumed): the only one of the two required documents
-- with approved text committed anywhere in this repository is the BAA
-- (src/pages/privacy/BusinessAssociateAgreement/BusinessAssociateAgreement.docx,
-- effective 2026-04-19, HIPAA-compliant, "Covered Entity"-generic --
-- directly usable). A repo-wide search (every migration, every src
-- file, every docx under public/docs/privacy/) found NO equivalent
-- enterprise "Haneen SaaS License Agreement" text -- the closest
-- document, TermsOfService.docx, is a general end-user agreement
-- (individual patient/caregiver/therapist accounts) with no
-- organization-level licensing terms, and using it as a substitute
-- would misrepresent contractual terms, which this directive (and
-- this engagement's own prior, independent conclusion on the same
-- question -- migration 115's header, DirectorApplicationWizard.tsx's
-- own "no approved SaaS license agreement or BAA text exists yet"
-- notice) both explicitly prohibit. Per the directive's own stop
-- condition ("identify the exact dependency... report it as BLOCKED
-- rather than silently removing it"): self_service_execute_agreement()
-- below unconditionally refuses p_contract_type = 'saas_license' with
-- an explicit, actionable exception -- it does not invent, substitute,
-- or silently skip this requirement. 'baa' executes for real, with
-- the real approved text.
ALTER TABLE enterprise_contracts
  ADD COLUMN IF NOT EXISTS consent_to_electronic_records BOOLEAN,
  ADD COLUMN IF NOT EXISTS signer_user_agent TEXT;

COMMENT ON COLUMN enterprise_contracts.consent_to_electronic_records IS
  'Self-service execution only: the signer''s affirmative consent to conduct this transaction electronically (ESIGN/UETA-style disclosure), captured at the moment of signing. NULL for Platform-Owner-attested (external-process) contracts, which this column does not apply to.';
COMMENT ON COLUMN enterprise_contracts.signer_user_agent IS
  'Self-service execution only: the signer''s browser user-agent string, self-reported by the client at signing time as supplementary attribution evidence. Not independently verified server-side -- the authenticated executed_by (auth.uid()) remains the authoritative identity evidence.';

-- The one approved document version self-service execution may use.
-- A fixed, reviewed constant -- never client-supplied -- so a caller
-- cannot claim an arbitrary or fabricated version string for a real
-- legal document. Updating the BAA's own text requires updating this
-- constant in a reviewed migration, same as any other approved value
-- in this codebase (e.g. the license tier catalog). A permanent
-- (not pg_temp) function: pg_temp is session-scoped and would vanish
-- out from under self_service_execute_agreement's own later, separate
-- invocations the moment this migration's session ended -- confirmed
-- before use, not discovered the hard way.
CREATE OR REPLACE FUNCTION public.hcn_approved_agreement_template_version(p_contract_type TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_contract_type
    WHEN 'baa' THEN 'HCN-BAA-2026-04-19'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.hcn_approved_agreement_template_version(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_approved_agreement_template_version(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.self_service_execute_agreement(
  p_application_id UUID,
  p_contract_type TEXT,
  p_signatory_name TEXT,
  p_signatory_title TEXT,
  p_consent_to_electronic_records BOOLEAN,
  p_user_agent TEXT DEFAULT NULL
) RETURNS enterprise_contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_quote_id UUID;
  v_template_version TEXT;
  v_existing enterprise_contracts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- CONFIRMED DEPENDENCY, not guessed: no approved SaaS License
  -- Agreement text exists anywhere in this repository (see the
  -- migration-header evidence above). Reported BLOCKED explicitly,
  -- never silently skipped or substituted with different legal
  -- language.
  IF p_contract_type = 'saas_license' THEN
    RAISE EXCEPTION 'BLOCKED: no approved Haneen SaaS License Agreement template is configured for self-service execution yet. This is a genuine external dependency on approved legal text being supplied, not a defect in this workflow -- the Business Associate Agreement can still be executed independently.';
  END IF;
  IF p_contract_type <> 'baa' THEN
    RAISE EXCEPTION 'Invalid contract type for self-service execution: %', p_contract_type;
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.applicant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You may only execute an agreement for your own application';
  END IF;
  IF v_app.status NOT IN ('agreements_pending', 'approved') THEN
    RAISE EXCEPTION 'This application is not currently eligible for agreement execution (status: %)', v_app.status;
  END IF;

  v_quote_id := (v_app.application_details->>'originatingQuoteId')::uuid;
  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'This application has no originating quote to attach an agreement to';
  END IF;

  IF btrim(coalesce(p_signatory_name, '')) = '' THEN
    RAISE EXCEPTION 'A typed legal name is required to execute this agreement';
  END IF;
  IF p_consent_to_electronic_records IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent to conduct this transaction electronically is required';
  END IF;

  -- Idempotent: a retry (double-click, refresh mid-submit) against an
  -- already-executed live contract for this exact quote+type returns
  -- the existing row unchanged rather than erroring or creating a
  -- second one.
  SELECT * INTO v_existing FROM enterprise_contracts ec
  WHERE ec.quote_id = v_quote_id AND ec.contract_type = p_contract_type AND ec.status = 'executed'
    AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id);
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (
    SELECT 1 FROM enterprise_contracts ec
    WHERE ec.quote_id = v_quote_id AND ec.contract_type = p_contract_type AND ec.status = 'void'
      AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
  ) THEN
    RAISE EXCEPTION 'This agreement was voided and requires Platform Owner review before it can be re-executed';
  END IF;

  v_template_version := public.hcn_approved_agreement_template_version(p_contract_type);
  IF v_template_version IS NULL THEN
    RAISE EXCEPTION 'No approved template version configured for contract type %', p_contract_type;
  END IF;

  INSERT INTO enterprise_contracts (
    quote_id, contract_type, template_version, signatory_name, signatory_title,
    status, presented_at, execution_method, execution_evidence_reference,
    executed_by, executed_at, consent_to_electronic_records, signer_user_agent, created_by
  ) VALUES (
    v_quote_id, p_contract_type, v_template_version, btrim(p_signatory_name), NULLIF(btrim(coalesce(p_signatory_title, '')), ''),
    'executed', now(), 'self_service_in_app_typed_signature', 'In-app typed-signature attestation by the authenticated applicant; see this record''s own signatory_name/executed_by/executed_at/consent_to_electronic_records fields as the evidence itself.',
    auth.uid(), now(), p_consent_to_electronic_records, p_user_agent, auth.uid()
  ) RETURNING * INTO v_existing;

  -- Advance the application once BOTH required agreements are
  -- executed for this quote. Currently unreachable in practice
  -- (saas_license is unconditionally blocked above), by design --
  -- this is the correct, honest state until that dependency is
  -- resolved, not a bypass.
  IF NOT EXISTS (
    SELECT 1 FROM (VALUES ('saas_license'), ('baa')) AS required(contract_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM enterprise_contracts ec
      WHERE ec.quote_id = v_quote_id AND ec.contract_type = required.contract_type AND ec.status = 'executed'
        AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
    )
  ) THEN
    UPDATE professional_applications SET status = 'agreements_executed', updated_at = now() WHERE id = p_application_id;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'agreements_executed', auth.uid(), 'applicant', v_app.status, 'agreements_executed', 'Both required agreements executed via self-service in-app signing');
  END IF;

  RETURN v_existing;
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_execute_agreement(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_service_execute_agreement(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- Section 2.3: "The SaaS License Agreement and BAA must both be
-- executed before billing authorization begins." Enforced here, at
-- the SAME server-side gate that already independently re-derives
-- price/currency/term before any Stripe object is created (migration
-- 164) -- never relying on the frontend having correctly hidden the
-- checkout button. Scoped to the INITIAL self-service activation path
-- only (an application referencing this quote); an amendment
-- request's quote (expansion/renewal/downgrade of an ALREADY-active
-- license, whose original agreements were executed at initial
-- activation) is unaffected -- re-deriving the exact prior body
-- (migration 164) verbatim, plus this one addition, per this
-- codebase's own documented lesson (migration 140's header: copying
-- from anything other than the latest prior version silently reverts
-- accumulated fixes).
CREATE OR REPLACE FUNCTION create_enterprise_billing_account(p_quote_id UUID, p_billing_contact_email TEXT)
RETURNS enterprise_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_quote sales_quotes;
  v_interval TEXT;
  v_amount_cents INTEGER;
  v_row enterprise_billing_accounts;
  v_is_initial_application boolean;
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

  v_is_initial_application := EXISTS (
    SELECT 1 FROM professional_applications pa
    WHERE pa.applicant_user_id = auth.uid() AND pa.application_details->>'originatingQuoteId' = p_quote_id::text
  );
  IF NOT v_is_initial_application AND NOT EXISTS (
    SELECT 1 FROM organization_amendment_requests oar
    WHERE oar.resulting_quote_id = p_quote_id AND oar.status = 'quoted' AND is_active_org_director(oar.organization_id)
  ) THEN
    RAISE EXCEPTION 'You do not have an application or amendment request referencing this quote';
  END IF;

  IF v_is_initial_application THEN
    IF EXISTS (
      SELECT 1 FROM (VALUES ('saas_license'), ('baa')) AS required(contract_type)
      WHERE NOT EXISTS (
        SELECT 1 FROM enterprise_contracts ec
        WHERE ec.quote_id = p_quote_id AND ec.contract_type = required.contract_type AND ec.status = 'executed'
          AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
      )
    ) THEN
      RAISE EXCEPTION 'Both the SaaS License Agreement and Business Associate Agreement must be executed before billing authorization can begin for this application';
    END IF;
  END IF;

  IF v_quote.annual_license_fee IS NULL THEN
    RAISE EXCEPTION 'This quote has no price yet -- the Platform Owner has not entered commercial terms';
  END IF;

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
  ON CONFLICT (quote_id, billing_component) DO UPDATE SET
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
