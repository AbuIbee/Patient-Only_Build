-- OWNER DIRECTIVE MMA-ENT-SALES-003 §2 (Phase D) — real draft
-- persistence for the six-step application wizard: "save draft/resume
-- after logout and across devices." Today's professional_applications
-- only ever receives a fully-valid, immediately-'pending_review' row
-- (submit_professional_application) -- there was never a true partial-
-- draft state a client could save mid-form and come back to.
--
-- legal_name/contact_email are relaxed from a blanket NOT NULL to "NOT
-- NULL unless status='draft'" via a CHECK constraint -- a draft may
-- genuinely have neither yet (D1's legal-entity step comes before D2's
-- Director name/email step). submit_professional_application's own
-- RPC-level validation (unchanged) remains the real enforcement that
-- both are present before any row can leave 'draft'.
ALTER TABLE professional_applications ALTER COLUMN legal_name DROP NOT NULL;
ALTER TABLE professional_applications ALTER COLUMN contact_email DROP NOT NULL;
ALTER TABLE professional_applications ADD CONSTRAINT professional_applications_draft_allows_null_identity
  CHECK (status = 'draft' OR (legal_name IS NOT NULL AND contact_email IS NOT NULL));

-- The pre-existing non_director_requires_target_org CHECK (migration
-- 083: a non-director application must target a real organization) is
-- correct for SUBMITTED applications but blocks a non-director DRAFT
-- from ever being saved at all -- save_application_draft() below has
-- no target-organization step yet (that is picked later in the
-- six-step flow for a non-director applicant), so every such draft
-- insert would violate this constraint before the RPC's own logic even
-- runs. Same relaxation pattern as the identity-fields constraint
-- above: exempt 'draft' status, leave the rule fully intact for every
-- other status.
ALTER TABLE professional_applications DROP CONSTRAINT non_director_requires_target_org;
ALTER TABLE professional_applications ADD CONSTRAINT non_director_requires_target_org
  CHECK (status = 'draft' OR requested_office = 'director' OR target_organization_id IS NOT NULL);

-- Exactly one active draft per user at a time (mirrors the existing
-- "one application under review at a time" rule, enforced today only
-- by submit_professional_application's own EXISTS check).
CREATE UNIQUE INDEX professional_applications_one_draft_per_user
  ON professional_applications (applicant_user_id) WHERE (status = 'draft');

-- save_application_draft(): upserts the caller's one draft. Re-derives
-- proposed_organization_name/proposed_package_type from the live quote
-- row whenever an originating quote id is present in
-- p_application_details -- "the server must reject price/seat/package
-- tampering" (MMA-ENT-SALES-003 §2 D3) -- rather than trusting whatever
-- the client passed for those two fields in that case.
CREATE OR REPLACE FUNCTION save_application_draft(
  p_requested_office TEXT, p_proposed_organization_name TEXT, p_proposed_package_type TEXT,
  p_legal_name TEXT, p_preferred_name TEXT, p_contact_email TEXT, p_contact_phone TEXT,
  p_professional_title TEXT, p_profession_category TEXT, p_application_details JSONB
) RETURNS professional_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_quote_id UUID;
  v_quote sales_quotes;
  v_prospect sales_prospects;
  v_org_name TEXT := p_proposed_organization_name;
  v_package TEXT := p_proposed_package_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_requested_office NOT IN ('director', 'caregiver', 'medical_professional', 'therapist') THEN
    RAISE EXCEPTION 'Invalid requested office: %', p_requested_office;
  END IF;
  IF EXISTS (
    SELECT 1 FROM professional_applications
    WHERE applicant_user_id = auth.uid() AND status IN ('pending_review', 'info_required', 'resubmitted')
  ) THEN
    RAISE EXCEPTION 'You already have an application under review. Wait for a decision before starting another.';
  END IF;

  v_quote_id := NULLIF(p_application_details->>'originatingQuoteId', '')::UUID;
  IF v_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM sales_quotes WHERE id = v_quote_id AND status = 'sent';
    IF v_quote.id IS NULL THEN
      RAISE EXCEPTION 'The quote behind this application is no longer available';
    END IF;
    SELECT * INTO v_prospect FROM sales_prospects WHERE id = v_quote.prospect_id;
    v_org_name := v_prospect.prospective_organization_name;
    v_package := v_quote.package_type;
  END IF;

  INSERT INTO professional_applications (
    applicant_user_id, requested_office, proposed_organization_name, proposed_package_type,
    legal_name, preferred_name, contact_email, contact_phone, professional_title, profession_category,
    application_details, status, platform_owner_approval_required
  ) VALUES (
    auth.uid(), p_requested_office, NULLIF(btrim(COALESCE(v_org_name, '')), ''), v_package,
    NULLIF(btrim(COALESCE(p_legal_name, '')), ''), NULLIF(btrim(COALESCE(p_preferred_name, '')), ''),
    NULLIF(btrim(COALESCE(p_contact_email, '')), ''), p_contact_phone, p_professional_title, p_profession_category,
    COALESCE(p_application_details, '{}'::jsonb), 'draft', (p_requested_office = 'director')
  )
  ON CONFLICT (applicant_user_id) WHERE (status = 'draft') DO UPDATE SET
    requested_office = EXCLUDED.requested_office,
    proposed_organization_name = EXCLUDED.proposed_organization_name,
    proposed_package_type = EXCLUDED.proposed_package_type,
    legal_name = EXCLUDED.legal_name,
    preferred_name = EXCLUDED.preferred_name,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    professional_title = EXCLUDED.professional_title,
    profession_category = EXCLUDED.profession_category,
    application_details = EXCLUDED.application_details,
    updated_at = now()
  RETURNING * INTO v_app;

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION save_application_draft(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_application_draft(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated;

-- SETOF, not a single composite: a bare composite-returning SQL
-- function still returns exactly one (all-NULL) row when its query
-- matches nothing, which PostgREST then serializes as an object full
-- of nulls rather than a true empty/null result. SETOF correctly
-- yields an empty array when there is no draft.
DROP FUNCTION IF EXISTS get_my_application_draft();
CREATE FUNCTION get_my_application_draft() RETURNS SETOF professional_applications
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM professional_applications WHERE applicant_user_id = auth.uid() AND status = 'draft';
$$;
REVOKE ALL ON FUNCTION get_my_application_draft() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_application_draft() TO authenticated;

CREATE OR REPLACE FUNCTION discard_application_draft(p_draft_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM professional_applications WHERE id = p_draft_id AND applicant_user_id = auth.uid() AND status = 'draft';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION discard_application_draft(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION discard_application_draft(UUID) TO authenticated;

-- Extend submit_professional_application with an optional p_draft_id:
-- when provided, the caller's own existing 'draft' row is validated
-- and transitioned in place (UPDATE), not re-inserted -- this is the
-- "submit" step of the same draft save_application_draft() maintained,
-- so draft -> pending_review is one continuous, idempotent record, not
-- two different rows.
--
-- CONFIRMED live this pass: CREATE OR REPLACE with an ADDED parameter
-- (even a defaulted, trailing one) does NOT replace the existing
-- function -- Postgres treats a changed argument-type LIST as a
-- different function identity and creates a second, separate overload
-- alongside the original. This silently broke create_organization()'s
-- own internal 11-positional-argument call (caught by this migration's
-- own regression suite, not assumed safe) and left the stale overload
-- with a different, briefly-anon-executable ACL (see the explicit
-- REVOKE/GRANT below). The old 11-argument overload is dropped first so
-- exactly one version of this function exists.
DROP FUNCTION IF EXISTS submit_professional_application(text,uuid,text,text,text,text,text,text,text,text,jsonb);
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
  END IF;

  IF p_requested_office = 'director' THEN
    IF p_target_organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'A Director application proposes a new organization and must not target an existing one';
    END IF;
    IF p_proposed_organization_name IS NULL OR btrim(p_proposed_organization_name) = '' THEN
      RAISE EXCEPTION 'Proposed organization name is required for a Director application';
    END IF;
    IF p_proposed_package_type NOT IN ('therapist', 'integrated_care') THEN
      RAISE EXCEPTION 'Invalid package type: %', p_proposed_package_type;
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
      proposed_organization_name = btrim(p_proposed_organization_name), proposed_package_type = p_proposed_package_type,
      legal_name = btrim(p_legal_name), preferred_name = NULLIF(btrim(COALESCE(p_preferred_name, '')), ''),
      contact_email = btrim(p_contact_email), contact_phone = p_contact_phone,
      professional_title = p_professional_title, profession_category = p_profession_category,
      application_details = COALESCE(p_application_details, '{}'::jsonb),
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
      auth.uid(), p_requested_office, p_target_organization_id, btrim(p_proposed_organization_name), p_proposed_package_type,
      btrim(p_legal_name), NULLIF(btrim(COALESCE(p_preferred_name, '')), ''), btrim(p_contact_email), p_contact_phone, p_professional_title, p_profession_category,
      COALESCE(p_application_details, '{}'::jsonb), 'pending_review', (p_requested_office = 'director')
    ) RETURNING * INTO v_app;

    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (v_app.id, 'submitted', auth.uid(), 'applicant', NULL, 'pending_review', 'Application submitted');
  END IF;

  RETURN v_app;
END;
$$;
-- CONFIRMED live this pass: CREATE OR REPLACE FUNCTION with an ADDED
-- parameter (even a defaulted, trailing one) does not preserve the
-- function's prior ACL the way a same-signature replace does -- it
-- regained anon EXECUTE (caught by the EXHAUSTIVE GUARD regression
-- test). Explicit REVOKE/GRANT, same as every other function in this
-- schema, rather than trusting any replace form to carry grants
-- forward.
REVOKE ALL ON FUNCTION submit_professional_application(text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_professional_application(text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid) TO authenticated;
