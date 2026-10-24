-- CODEX F-11 (P1, release-blocking) — "Corrections overwrite
-- reviewed evidence." Independent audit
-- MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-11,
-- target commit b362e119.
--
-- Confirmed by reading the actual code: DirectorApplicationWizard.tsx
-- disables every fieldset NOT named in correction.allowedSteps
-- client-side (`disabled={isLocked('stepN')}`) -- but
-- resubmit_application() itself never read correction_requested_fields
-- at all. It unconditionally overwrote legal_name/preferred_name/
-- contact_email/contact_phone/professional_title/profession_category
-- with whatever the client sent, regardless of which steps were
-- actually reopened. A direct RPC call (bypassing the UI entirely)
-- could change the applicant's claimed legal identity, business
-- email, or phone even when the Platform Owner had only requested a
-- correction to, say, the Operations step.
--
-- Fix, scoped honestly: for a Director application (requested_office
-- = 'director'), DirectorApplicationWizard.tsx's own step map
-- (confirmed by reading it) puts every one of these five columns
-- under "step2" ("Founding Director") -- legal_name =
-- s2.fullLegalName, preferred_name = s2.preferredName, contact_email
-- = s2.verifiedBusinessEmail, contact_phone = s2.mobile,
-- professional_title = s2.title. resubmit_application() now enforces
-- that boundary server-side: if the application's own
-- correction_requested_fields names specific allowed steps and
-- "step2" is not among them, these five columns must be resubmitted
-- unchanged -- a client attempting to change any of them anyway is
-- rejected outright, not silently ignored (so a legitimate accidental
-- edit surfaces as an error the applicant can act on, rather than
-- being dropped with no explanation).
--
-- Scoped out, not silently claimed fixed: the other application
-- offices (caregiver/therapist/medical_professional) use a different,
-- simpler application form whose own step-to-field mapping has not
-- been reviewed here -- enforcing a boundary for a mapping that
-- hasn't actually been confirmed would risk guessing wrong and
-- blocking a legitimate correction. This fix applies only where the
-- mapping has been verified: the Director office, the primary flow
-- this entire engagement's Bilal scenario exercises.
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
        OR p_contact_phone IS DISTINCT FROM v_app.contact_phone
        OR p_professional_title IS DISTINCT FROM v_app.professional_title
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
