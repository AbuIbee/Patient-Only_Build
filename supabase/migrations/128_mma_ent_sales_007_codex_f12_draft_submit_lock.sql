-- CODEX F-12 (P1, release-blocking) — "Draft/redemption/concurrency
-- integrity gaps." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-12,
-- target commit b362e119.
--
-- Confirmed by reading the actual code: submit_professional_
-- application()'s draft lookup ("SELECT * INTO v_draft FROM
-- professional_applications WHERE id = p_draft_id AND
-- applicant_user_id = auth.uid() AND status = 'draft'") takes no row
-- lock at all. Two concurrent submit calls against the SAME draft
-- (a genuine real-world race: a double-click, or two browser tabs)
-- could both pass this check before either commits its own UPDATE,
-- each then independently INSERTing its own professional_application_
-- events "submitted" row for the same application -- a duplicated
-- audit-trail entry, not a security hole, but a real integrity gap
-- ("submission reads draft without locking" per Codex's own words).
--
-- Fix: FOR UPDATE on the draft lookup, matching the exact pattern
-- already used everywhere else in this schema that reads-then-writes
-- a single row within one transaction (resubmit_application(),
-- withdraw_application(), request_application_corrections(), etc.).
-- The second of two concurrent calls now blocks until the first
-- commits, then re-evaluates status = 'draft' fresh -- seeing it is
-- no longer a draft (already submitted), it correctly raises "No
-- matching draft found to submit" instead of racing to a duplicate
-- audit event. Byte-identical to migration 122's version of this
-- function otherwise -- this migration changes nothing else.
--
-- Scoped out, not silently claimed fixed: F-12 also names "Token
-- consumption and draft creation are separate requests" (the
-- invitation-redemption -> draft-creation flow, migration 108) as a
-- non-atomic two-step sequence. That is a materially larger change
-- (would need a single combined RPC or a different transactional
-- design spanning two existing, independently-tested functions) and
-- has not been touched here -- documented as outstanding, not
-- fabricated as closed.
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
