-- CODEX F-10 (P1, release-blocking) — "Six-step application is not
-- validated on the server." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-10;
-- closed per MMA-ENT-SALES-009 Workstream C §18.
--
-- Confirmed by reading the actual code: DirectorApplicationWizard.tsx
-- (D1-D6) collects ~50 fields across application_details.step1..step6
-- (legal entity identity, Founding Director identity/attestations,
-- operations/HIPAA declarations, billing profile, final
-- declarations/signature) but submit_professional_application() and
-- resubmit_application() only ever validated the two top-level
-- columns (legal_name, contact_email) non-empty. Every other
-- requirement -- required fields, the HIPAA-conditional fields, the
-- three mandatory step-6 attestations, a well-formed email -- existed
-- ONLY in the wizard's own client-side `canSubmit`/`required`
-- markers. A direct RPC call bypassing the UI entirely (tested below)
-- could submit a Director application with no attestations, no
-- billing profile, and no compliance declarations at all.
--
-- Fix: a new STABLE validator, validate_director_application_payload(),
-- re-implementing every required/conditional rule the wizard itself
-- enforces, called from both submission paths whenever
-- requested_office = 'director' -- the only office that actually uses
-- this six-step JSONB shape (migration 127's own prior finding: the
-- other offices' simpler form has a different, unreviewed field
-- mapping, so this validator is deliberately NOT applied to them --
-- "preserve conditional distinctions," not impose Director-only
-- requirements universally).
--
-- Additionally closes F-10's "application reference" item: a new
-- application_reference column (format APP-YYYY-NNNNNN, sequence-
-- backed, assigned at INSERT) gives applicants and the Platform Owner
-- a stable human-readable identifier distinct from the raw UUID.
--
-- Discovered while fixing forward (not pre-planned): create_organization()
-- (migration 083) is a SECOND, genuinely different, already-working
-- Director-application entry point -- the CreateOrgCard / residential
-- "/business Start an Organization" fallback -- that calls
-- submit_professional_application() directly with an empty '{}'::jsonb
-- application_details. It was never built against the six-step wizard
-- and collects none of that data by design, not by defect. Requiring
-- it to suddenly satisfy six-step business/billing/HIPAA/attestation
-- fields it never asked for would break a real, currently-working
-- feature ("preserve all existing working functionality"), not close
-- a gap. The validator below is therefore only invoked when the
-- submitted application_details actually contains at least one
-- step1..step6 key -- i.e. it only ever applies to a REAL six-step
-- wizard submission, never retroactively to this simpler, pre-existing
-- path. A six-step submission still cannot supply only SOME steps and
-- omit the rest.
--
-- Scoped out, not silently claimed fixed: F-10 also names "sensitive
-- identifier masking" (e.g., the EIN collected in step1). The Platform
-- Owner's own review screen legitimately needs the real EIN to verify
-- the business, and no read path currently exposes application_details
-- to anyone other than the applicant and the Platform Owner -- masking
-- it would require a genuine policy decision about who else, if
-- anyone, should see a redacted view, which has not been made. Left
-- exactly as before, documented honestly. Real email-OWNERSHIP
-- verification (a confirmation code/link) is also not implemented
-- here -- this migration adds format validation and cross-field
-- consistency (the "verified" email in the JSONB must match the
-- authoritative contact_email column), which is a genuine, bounded
-- improvement over "accepts anything non-empty," not a claim of full
-- email verification.

ALTER TABLE professional_applications ADD COLUMN IF NOT EXISTS application_reference TEXT;

CREATE SEQUENCE IF NOT EXISTS professional_applications_ref_seq;

-- Backfill existing rows (oldest first, so reference order matches
-- creation order) before the column becomes mandatory/unique.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, created_at FROM professional_applications WHERE application_reference IS NULL ORDER BY created_at ASC LOOP
    UPDATE professional_applications
    SET application_reference = 'APP-' || to_char(r.created_at, 'YYYY') || '-' || lpad(nextval('professional_applications_ref_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS professional_applications_reference_uidx ON professional_applications (application_reference);
ALTER TABLE professional_applications ALTER COLUMN application_reference SET NOT NULL;

CREATE OR REPLACE FUNCTION assign_application_reference() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.application_reference IS NULL THEN
    NEW.application_reference := 'APP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('professional_applications_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_application_reference ON professional_applications;
CREATE TRIGGER trg_assign_application_reference
  BEFORE INSERT ON professional_applications
  FOR EACH ROW EXECUTE FUNCTION assign_application_reference();
REVOKE ALL ON FUNCTION assign_application_reference() FROM PUBLIC;

-- The validator. Pure JSONB inspection, no table access -- STABLE,
-- SECURITY INVOKER (default) is correct and sufficient; it is only
-- ever called from within the two SECURITY DEFINER submission
-- functions below, never granted directly to a client role.
CREATE OR REPLACE FUNCTION validate_director_application_payload(p_details JSONB, p_contact_email TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_email_re TEXT := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
  s1 JSONB := COALESCE(p_details->'step1', '{}'::jsonb);
  s2 JSONB := COALESCE(p_details->'step2', '{}'::jsonb);
  s3 JSONB := COALESCE(p_details->'step3', '{}'::jsonb);
  s4 JSONB := COALESCE(p_details->'step4', '{}'::jsonb);
  s5 JSONB := COALESCE(p_details->'step5', '{}'::jsonb);
  s6 JSONB := COALESCE(p_details->'step6', '{}'::jsonb);
BEGIN
  -- Step 1 -- Organization legal identity
  IF btrim(COALESCE(s1->>'legalBusinessName', '')) = '' THEN RAISE EXCEPTION 'Registered legal business name is required'; END IF;
  IF btrim(COALESCE(s1->>'legalForm', '')) = '' THEN RAISE EXCEPTION 'Legal entity type is required'; END IF;
  IF btrim(COALESCE(s1->>'businessClassification', '')) = '' THEN RAISE EXCEPTION 'Business classification is required'; END IF;
  IF btrim(COALESCE(s1->>'formationJurisdiction', '')) = '' THEN RAISE EXCEPTION 'Formation jurisdiction is required'; END IF;
  IF btrim(COALESCE(s1->>'registeredAddress', '')) = '' THEN RAISE EXCEPTION 'Registered address is required'; END IF;
  IF btrim(COALESCE(s1->>'businessPhone', '')) = '' THEN RAISE EXCEPTION 'Business phone is required'; END IF;
  IF btrim(COALESCE(s1->>'businessEmail', '')) = '' OR (s1->>'businessEmail') !~* v_email_re THEN RAISE EXCEPTION 'A valid business email is required'; END IF;
  IF COALESCE((s1->>'operatingSameAsRegistered')::boolean, true) = false AND btrim(COALESCE(s1->>'operatingAddress', '')) = '' THEN
    RAISE EXCEPTION 'Principal operating address is required when it differs from the registered address';
  END IF;
  IF COALESCE((s1->>'numLocations')::int, 0) < 1 THEN RAISE EXCEPTION 'Number of operating locations must be at least 1'; END IF;

  -- Step 2 -- Founding Director identity and authority
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

  -- Step 3 -- Enterprise package / operations setup
  IF btrim(COALESCE(s3->>'buyerBillingContact', '')) = '' THEN RAISE EXCEPTION 'Buyer billing contact is required'; END IF;
  IF COALESCE(s3->>'migrationStatus', '') = 'requested' THEN
    IF btrim(COALESCE(s3->>'migrationDetails', '')) = '' THEN RAISE EXCEPTION 'Migration details are required when a migration is requested'; END IF;
    IF COALESCE((s4->>'migrationConsent')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Migration consent is required when a migration is requested'; END IF;
  END IF;

  -- Step 4 -- Operations & compliance
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

  -- Step 5 -- Billing profile
  IF btrim(COALESCE(s5->>'billingLegalEntity', '')) = '' THEN RAISE EXCEPTION 'Billing legal entity is required'; END IF;
  IF btrim(COALESCE(s5->>'billingContact', '')) = '' THEN RAISE EXCEPTION 'Billing contact is required'; END IF;
  IF btrim(COALESCE(s5->>'billingAddress', '')) = '' THEN RAISE EXCEPTION 'Billing address is required'; END IF;
  IF btrim(COALESCE(s5->>'billingEmail', '')) = '' OR (s5->>'billingEmail') !~* v_email_re THEN RAISE EXCEPTION 'A valid billing email is required'; END IF;
  IF btrim(COALESCE(s5->>'currency', '')) = '' THEN RAISE EXCEPTION 'Billing currency is required'; END IF;
  IF btrim(COALESCE(s5->>'cadence', '')) = '' THEN RAISE EXCEPTION 'Billing cadence is required'; END IF;

  -- Step 6 -- Review & declarations
  IF COALESCE((s6->>'accuracyAttestation')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'The accuracy attestation is required'; END IF;
  IF COALESCE((s6->>'authorizedSignatoryConfirmed')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'The authorized-signatory confirmation is required'; END IF;
  IF COALESCE((s6->>'privacyAck')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'The privacy-practices acknowledgment is required'; END IF;
  IF btrim(COALESCE(s6->>'signatureName', '')) = '' THEN RAISE EXCEPTION 'A typed signature name is required'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION validate_director_application_payload(JSONB, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION submit_professional_application(
  p_requested_office text, p_target_organization_id uuid, p_proposed_organization_name text, p_proposed_package_type text,
  p_legal_name text, p_preferred_name text, p_contact_email text, p_contact_phone text,
  p_professional_title text, p_profession_category text, p_application_details jsonb,
  p_draft_id UUID DEFAULT NULL
)
RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_draft professional_applications;
  v_existing_quote_id UUID;
  v_incoming_quote_id UUID;
  v_quote sales_quotes;
  v_prospect sales_prospects;
  v_org_name TEXT := p_proposed_organization_name;
  v_package TEXT := p_proposed_package_type;
  v_details JSONB := COALESCE(p_application_details, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_requested_office NOT IN ('director', 'caregiver', 'medical_professional', 'therapist') THEN
    RAISE EXCEPTION 'Invalid requested office: %', p_requested_office;
  END IF;
  IF p_legal_name IS NULL OR btrim(p_legal_name) = '' THEN
    RAISE EXCEPTION 'Legal name is required';
  END IF;
  IF p_contact_email IS NULL OR btrim(p_contact_email) = '' THEN
    RAISE EXCEPTION 'Contact email is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM professional_applications
    WHERE applicant_user_id = auth.uid() AND status IN ('pending_review', 'info_required', 'resubmitted')
  ) THEN
    RAISE EXCEPTION 'You already have an application under review. Wait for a decision before submitting another.';
  END IF;

  IF p_draft_id IS NOT NULL THEN
    SELECT * INTO v_draft FROM professional_applications WHERE id = p_draft_id AND applicant_user_id = auth.uid() AND status = 'draft' FOR UPDATE;
    IF v_draft.id IS NULL THEN
      RAISE EXCEPTION 'No matching draft found to submit';
    END IF;
    v_existing_quote_id := NULLIF(v_draft.application_details->>'originatingQuoteId', '')::UUID;
  END IF;

  -- Quote immutability: once a draft/application carries an
  -- originatingQuoteId, submit may never redirect it to a different
  -- one. Setting it for the first time (no prior value) is still
  -- permitted.
  v_incoming_quote_id := NULLIF(v_details->>'originatingQuoteId', '')::UUID;
  IF v_existing_quote_id IS NOT NULL AND v_incoming_quote_id IS DISTINCT FROM v_existing_quote_id THEN
    RAISE EXCEPTION 'This application''s originating quote cannot be changed';
  END IF;
  IF v_incoming_quote_id IS NULL THEN
    v_incoming_quote_id := v_existing_quote_id;
  END IF;

  -- Re-derive, never trust the client, exactly like
  -- save_application_draft() already does -- the server, not the
  -- submission payload, is the source of truth for what was actually
  -- quoted.
  IF v_incoming_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM sales_quotes WHERE id = v_incoming_quote_id AND status = 'sent';
    IF v_quote.id IS NULL THEN
      RAISE EXCEPTION 'The quote behind this application is no longer available';
    END IF;
    SELECT * INTO v_prospect FROM sales_prospects WHERE id = v_quote.prospect_id;
    v_org_name := v_prospect.prospective_organization_name;
    v_package := v_quote.package_type;
    v_details := jsonb_set(v_details, '{originatingQuoteId}', to_jsonb(v_incoming_quote_id::text));
  END IF;

  IF p_requested_office = 'director' THEN
    IF p_target_organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'A Director application proposes a new organization and must not target an existing one';
    END IF;
    IF v_org_name IS NULL OR btrim(v_org_name) = '' THEN
      RAISE EXCEPTION 'Proposed organization name is required for a Director application';
    END IF;
    IF v_package NOT IN ('therapist', 'integrated_care') THEN
      RAISE EXCEPTION 'Invalid package type: %', v_package;
    END IF;
    -- F-10: the full six-step payload is validated server-side, not
    -- merely by the wizard's own client-side `required`/`canSubmit`
    -- markers. A direct RPC call cannot bypass this. Only engages for
    -- an actual six-step submission (see migration-header note on
    -- create_organization()'s separate, simpler path).
    IF v_details ? 'step1' OR v_details ? 'step2' OR v_details ? 'step3' OR v_details ? 'step4' OR v_details ? 'step5' OR v_details ? 'step6' THEN
      PERFORM validate_director_application_payload(v_details, p_contact_email);
    END IF;
  ELSE
    IF p_target_organization_id IS NULL THEN
      RAISE EXCEPTION 'An organization is required for this application';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_target_organization_id) THEN
      RAISE EXCEPTION 'The target organization does not exist';
    END IF;
  END IF;

  IF p_draft_id IS NOT NULL THEN
    UPDATE professional_applications SET
      requested_office = p_requested_office, target_organization_id = p_target_organization_id,
      proposed_organization_name = btrim(COALESCE(v_org_name, '')), proposed_package_type = v_package,
      legal_name = btrim(p_legal_name), preferred_name = NULLIF(btrim(COALESCE(p_preferred_name, '')), ''),
      contact_email = btrim(p_contact_email), contact_phone = p_contact_phone,
      professional_title = p_professional_title, profession_category = p_profession_category,
      application_details = v_details,
      status = 'pending_review', platform_owner_approval_required = (p_requested_office = 'director'),
      updated_at = now()
    WHERE id = p_draft_id
    RETURNING * INTO v_app;

    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (v_app.id, 'submitted', auth.uid(), 'applicant', 'draft', 'pending_review', 'Application submitted from saved draft');
  ELSE
    INSERT INTO professional_applications (
      applicant_user_id, requested_office, target_organization_id, proposed_organization_name, proposed_package_type,
      legal_name, preferred_name, contact_email, contact_phone, professional_title, profession_category,
      application_details, status, platform_owner_approval_required
    ) VALUES (
      auth.uid(), p_requested_office, p_target_organization_id, btrim(COALESCE(v_org_name, '')), v_package,
      btrim(p_legal_name), NULLIF(btrim(COALESCE(p_preferred_name, '')), ''), btrim(p_contact_email), p_contact_phone, p_professional_title, p_profession_category,
      v_details, 'pending_review', (p_requested_office = 'director')
    ) RETURNING * INTO v_app;

    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (v_app.id, 'submitted', auth.uid(), 'applicant', NULL, 'pending_review', 'Application submitted');
  END IF;

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION submit_professional_application(text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_professional_application(text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resubmit_application(
  p_application_id UUID,
  p_legal_name TEXT,
  p_preferred_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_professional_title TEXT,
  p_profession_category TEXT,
  p_application_details JSONB
) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_existing_quote_id UUID;
  v_incoming_quote_id UUID;
  v_quote sales_quotes;
  v_prospect sales_prospects;
  v_details JSONB;
  v_org_name TEXT;
  v_package TEXT;
  v_allowed_steps JSONB;
  v_step2_allowed BOOLEAN;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No such application';
  END IF;
  IF v_app.applicant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You may only resubmit your own application';
  END IF;
  IF v_app.status <> 'info_required' THEN
    RAISE EXCEPTION 'This application is not awaiting corrections';
  END IF;

  v_allowed_steps := v_app.correction_requested_fields->'allowedSteps';
  IF v_app.requested_office = 'director' AND v_allowed_steps IS NOT NULL THEN
    v_step2_allowed := EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_allowed_steps) s WHERE s = 'step2');
    IF NOT v_step2_allowed THEN
      IF btrim(COALESCE(p_legal_name, '')) IS DISTINCT FROM COALESCE(v_app.legal_name, '')
        OR NULLIF(btrim(COALESCE(p_preferred_name, '')), '') IS DISTINCT FROM v_app.preferred_name
        OR btrim(COALESCE(p_contact_email, '')) IS DISTINCT FROM COALESCE(v_app.contact_email, '')
        -- F-10 bugfix (found while re-verifying the wizard end-to-end,
        -- not pre-planned): contact_phone/professional_title were
        -- compared RAW, unlike preferred_name's own already-correct
        -- NULL/''-normalizing comparison just above. Any application
        -- whose contact_phone/professional_title column was ever NULL
        -- (every create_organization()-originated application, since
        -- it always passes NULL for both) would see the wizard's
        -- always-non-null '' default compared against DB NULL and be
        -- treated as "changed" even when step2 was never touched --
        -- a false-positive lock rejection of a legitimate, unrelated
        -- resubmission. Normalized the same way preferred_name already is.
        OR NULLIF(btrim(COALESCE(p_contact_phone, '')), '') IS DISTINCT FROM v_app.contact_phone
        OR NULLIF(btrim(COALESCE(p_professional_title, '')), '') IS DISTINCT FROM v_app.professional_title
      THEN
        RAISE EXCEPTION 'The Founding Director step was not reopened for correction -- legal name, preferred name, contact email, contact phone, and title must be resubmitted unchanged';
      END IF;
    END IF;
  END IF;

  v_existing_quote_id := NULLIF(v_app.application_details->>'originatingQuoteId', '')::UUID;
  v_details := COALESCE(p_application_details, v_app.application_details);
  v_incoming_quote_id := NULLIF(v_details->>'originatingQuoteId', '')::UUID;
  IF v_existing_quote_id IS NOT NULL AND v_incoming_quote_id IS DISTINCT FROM v_existing_quote_id THEN
    RAISE EXCEPTION 'This application''s originating quote cannot be changed';
  END IF;

  v_org_name := v_app.proposed_organization_name;
  v_package := v_app.proposed_package_type;
  IF v_existing_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM sales_quotes WHERE id = v_existing_quote_id AND status = 'sent';
    IF v_quote.id IS NULL THEN
      RAISE EXCEPTION 'The quote behind this application is no longer available';
    END IF;
    SELECT * INTO v_prospect FROM sales_prospects WHERE id = v_quote.prospect_id;
    v_org_name := v_prospect.prospective_organization_name;
    v_package := v_quote.package_type;
  END IF;

  -- F-10: resubmission goes through the same full six-step validation
  -- as initial submission -- a correction must leave (or make) the
  -- entire application compliant, not just the specific field a
  -- correction request named. Only engages for an actual six-step
  -- application (see migration-header note on create_organization()'s
  -- separate, simpler path).
  IF v_app.requested_office = 'director' AND (v_details ? 'step1' OR v_details ? 'step2' OR v_details ? 'step3' OR v_details ? 'step4' OR v_details ? 'step5' OR v_details ? 'step6') THEN
    PERFORM validate_director_application_payload(v_details, p_contact_email);
  END IF;

  UPDATE professional_applications SET
    legal_name = btrim(p_legal_name), preferred_name = NULLIF(btrim(COALESCE(p_preferred_name, '')), ''),
    contact_email = btrim(p_contact_email), contact_phone = p_contact_phone,
    professional_title = p_professional_title, profession_category = p_profession_category,
    proposed_organization_name = COALESCE(v_org_name, v_app.proposed_organization_name),
    proposed_package_type = COALESCE(v_package, v_app.proposed_package_type),
    application_details = v_details,
    status = 'resubmitted', updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'resubmitted', auth.uid(), 'applicant', 'info_required', 'resubmitted', 'Applicant resubmitted with corrections');

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.resubmit_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
