-- CODEX F-03 (P1, release-blocking) — "Quote ownership, locking and
-- consumption are untrusted." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-03,
-- target commit b362e119.
--
-- Confirmed by reading the actual code: save_application_draft()
-- (migration 109) correctly re-derives proposed_organization_name/
-- proposed_package_type from the live quote whenever
-- application_details->>'originatingQuoteId' is present, rejecting
-- the client's own values for those two fields -- but
-- submit_professional_application()'s draft-UPDATE branch (the actual
-- "submit" step of that same draft) never did this at all: it wrote
-- whatever p_proposed_organization_name/p_proposed_package_type/
-- p_application_details the CLIENT sent, completely bypassing the
-- quote-locking the draft step had just enforced. The same gap exists
-- in the direct-INSERT branch (a submission with no prior draft) and
-- in resubmit_application() (which can REPLACE application_details
-- wholesale, including swapping to a DIFFERENT originatingQuoteId,
-- after the application was already under Platform Owner review).
-- Every downstream billing/license/contract/notification RPC in this
-- engagement treats application_details->>'originatingQuoteId' as the
-- trusted anchor for "which quote does this application correspond
-- to" -- so an applicant could redirect their OWN application onto a
-- different quote's commercial terms (cheaper, or someone else's
-- unredeemed quote) purely by what they send at submit/resubmit time.
--
-- Fix:
--   1. A real DB-level uniqueness guarantee ("one commercial issuance"
--      consumption): at most one LIVE (not withdrawn/rejected)
--      application may ever reference the same originatingQuoteId --
--      race-proof by construction (a partial unique index, not an
--      application-level EXISTS check), closing "reuse of one paid
--      quote for a second organization."
--   2. submit_professional_application() now re-derives organization
--      name/package from the live quote exactly like
--      save_application_draft() already does, in BOTH the draft and
--      direct-submission branches, and re-validates the quote is
--      still status='sent' at submit time (catching
--      expired/revoked/superseded quotes a draft was saved against
--      earlier).
--   3. originatingQuoteId is now immutable once set on a draft or
--      application: submit/resubmit may never change it to a
--      DIFFERENT quote id than whatever the row already carries --
--      only setting it for the very first time (a submission with no
--      prior draft referencing one) is still allowed.
--   4. resubmit_application() now runs through the exact same
--      quote-lock/re-derivation logic, closing the identical gap at
--      the one other place application_details can be replaced
--      wholesale.
CREATE UNIQUE INDEX IF NOT EXISTS professional_applications_one_live_app_per_quote
  ON professional_applications ((application_details->>'originatingQuoteId'))
  WHERE application_details->>'originatingQuoteId' IS NOT NULL AND status NOT IN ('withdrawn', 'rejected');

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
    SELECT * INTO v_draft FROM professional_applications WHERE id = p_draft_id AND applicant_user_id = auth.uid() AND status = 'draft';
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
