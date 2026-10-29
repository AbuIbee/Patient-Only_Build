-- HCN staging-approved consolidation; built against remediation branch through migration 164.
-- No real agreements, payments, organizational activation, or synthetic customer provisioning.
-- Other Specialist has a configurable profession_category/title, an independently verified
-- application, and no automatic clinical authoring privilege.
-- This file mirrors staging corrections and is NOT a production deployment.
-- Global Admin authority is deliberately unchanged.

REVOKE UPDATE ON TABLE public.profiles FROM anon;
REVOKE UPDATE(role) ON TABLE public.profiles FROM anon, authenticated;
REVOKE TRIGGER, TRUNCATE ON TABLE public.profiles FROM anon, authenticated;

-- Account roles are not organization memberships: never assign platform/admin/pending here.

CREATE OR REPLACE FUNCTION public.am_i_org_owner(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT p_org_id IS NOT NULL AND public.get_organization_owner(p_org_id) = auth.uid();
$function$;
REVOKE ALL ON FUNCTION public.am_i_org_owner(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.am_i_org_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_role(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_existing_role text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_owner() THEN
  RAISE EXCEPTION 'Only the HCN Global Admin may change account roles' USING ERRCODE='42501';
 END IF;
 IF p_user_id IS NULL OR p_user_id=auth.uid() THEN
  RAISE EXCEPTION 'Self-role changes and null targets are forbidden' USING ERRCODE='42501';
 END IF;
 IF p_role IS NULL OR p_role NOT IN ('patient','caregiver','therapist') THEN
  RAISE EXCEPTION 'Only established non-platform account roles may be assigned through account role management' USING ERRCODE='42501';
 END IF;
 SELECT role INTO v_existing_role FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE='22023';
 END IF;
 IF v_existing_role IN ('admin','superadmin') THEN
  RAISE EXCEPTION 'Global Admin accounts cannot be modified through account role management' USING ERRCODE='42501';
 END IF;
 UPDATE public.profiles SET role=p_role,updated_at=now() WHERE id=p_user_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid,text) TO authenticated;

-- Keep annual Complete fee $799; preserve old catalog version for audit.
DO $hcn_tier$
DECLARE old_tier public.license_tier_catalog%ROWTYPE;
BEGIN
 SELECT * INTO old_tier FROM public.license_tier_catalog
 WHERE tier_code='complete' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Complete tier missing'; END IF;
 IF old_tier.specialist_slot_count=3 AND old_tier.annual_fee_cents=79900 THEN RETURN; END IF;
 IF old_tier.specialist_slot_count<>2 OR old_tier.annual_fee_cents<>79900 THEN
   RAISE EXCEPTION 'Unexpected Complete tier baseline';
 END IF;
 INSERT INTO public.license_tier_catalog_history
 (tier_code,display_name,annual_fee_cents,specialist_slot_count,version,superseded_by)
 VALUES(old_tier.tier_code,old_tier.display_name,old_tier.annual_fee_cents,
        old_tier.specialist_slot_count,old_tier.version,NULL);
 UPDATE public.license_tier_catalog SET specialist_slot_count=3,
 version=old_tier.version+1,updated_at=now(),updated_by=NULL
 WHERE tier_code='complete';
END $hcn_tier$;

-- Other Specialists may join only through the verified professional workflow.
ALTER TABLE public.professional_applications DROP CONSTRAINT professional_applications_requested_office_check;
ALTER TABLE public.professional_applications ADD CONSTRAINT professional_applications_requested_office_check
 CHECK (requested_office IN ('director','caregiver','medical_professional','therapist','other_specialist'));
ALTER TABLE public.professional_applications DROP CONSTRAINT professional_applications_approved_office_check;
ALTER TABLE public.professional_applications ADD CONSTRAINT professional_applications_approved_office_check
 CHECK (approved_office IN ('director','caregiver','medical_professional','therapist','other_specialist'));
ALTER TABLE public.organization_memberships DROP CONSTRAINT organization_memberships_org_role_check;
ALTER TABLE public.organization_memberships ADD CONSTRAINT organization_memberships_org_role_check
 CHECK (org_role IN ('director','co_director','caregiver','therapist','medical_professional',
 'other_specialist','billing_admin','office_administrator','clinical_supervisor','auditor'));

-- save_application_draft
CREATE OR REPLACE FUNCTION public.save_application_draft(p_requested_office text, p_proposed_organization_name text, p_proposed_package_type text, p_legal_name text, p_preferred_name text, p_contact_email text, p_contact_phone text, p_professional_title text, p_profession_category text, p_application_details jsonb)
 RETURNS professional_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_requested_office NOT IN ('director', 'caregiver', 'medical_professional', 'therapist', 'other_specialist') THEN
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
$function$;

-- submit_professional_application
CREATE OR REPLACE FUNCTION public.submit_professional_application(p_requested_office text, p_target_organization_id uuid, p_proposed_organization_name text, p_proposed_package_type text, p_legal_name text, p_preferred_name text, p_contact_email text, p_contact_phone text, p_professional_title text, p_profession_category text, p_application_details jsonb, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS professional_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_requested_office NOT IN ('director', 'caregiver', 'medical_professional', 'therapist', 'other_specialist') THEN
    RAISE EXCEPTION 'Invalid requested office: %', p_requested_office;
  END IF;
  IF p_requested_office = 'other_specialist' AND
    (NULLIF(btrim(COALESCE(p_profession_category,'')),'') IS NULL OR NULLIF(btrim(COALESCE(p_professional_title,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'Other Specialists must specify profession category and professional title';
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
$function$;

-- director_approve_application
CREATE OR REPLACE FUNCTION public.director_approve_application(p_application_id uuid)
 RETURNS professional_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app professional_applications;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_package TEXT;
  v_role_cap INTEGER;
  v_role_count INTEGER;
  v_tier_code TEXT;
  v_specialist_slot_count INTEGER;
  v_specialist_count INTEGER;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office = 'director' THEN
    RAISE EXCEPTION 'Director applications are approved by the Platform Owner, not an organization director';
  END IF;
  IF v_app.status NOT IN ('pending_review', 'resubmitted') THEN RAISE EXCEPTION 'This application is not open for approval'; END IF;
  IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
    RAISE EXCEPTION 'Only an active director of the target organization may approve this application';
  END IF;
  IF v_app.applicant_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own application';
  END IF;
  IF v_app.credential_verification_status != 'independently_verified' THEN
    RAISE EXCEPTION 'This application cannot be approved until its credential has been independently verified (current status: %). Call record_credential_verification() first.', v_app.credential_verification_status;
  END IF;

  SELECT package_type INTO v_package FROM organizations WHERE id = v_app.target_organization_id;
  IF v_package = 'therapist' AND v_app.requested_office IN ('caregiver', 'medical_professional', 'other_specialist') THEN
    RAISE EXCEPTION 'This organization''s Therapist Enterprise package does not include caregiver or medical professional offices';
  END IF;

  PERFORM licensed_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id FOR UPDATE;
  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id;
  IF v_seats IS NOT NULL THEN
    SELECT count(*) INTO v_active_count FROM organization_memberships WHERE organization_id = v_app.target_organization_id AND status = 'active';
    IF v_active_count >= v_seats THEN
      RAISE EXCEPTION 'This organization has no remaining licensed seats. Increase licensed seats before approving this application.';
    END IF;
  END IF;

  v_role_cap := CASE v_app.requested_office
    WHEN 'caregiver' THEN (SELECT max_caregiver_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id)
    WHEN 'medical_professional' THEN (SELECT max_medical_professional_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id)
    WHEN 'therapist' THEN (SELECT max_therapist_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id)
    ELSE NULL
  END;
  IF v_role_cap IS NOT NULL THEN
    SELECT count(*) INTO v_role_count FROM organization_memberships
      WHERE organization_id = v_app.target_organization_id AND status = 'active' AND org_role = v_app.requested_office;
    IF v_role_count >= v_role_cap THEN
      RAISE EXCEPTION 'This organization has no remaining licensed % seats. Increase the per-role cap before approving this application.', v_app.requested_office;
    END IF;
  END IF;

  -- NEW: the combined specialist-slot cap, additive to every check
  -- above -- only engages for a tier-based organization and only for
  -- the two specialist offices the slot model actually governs.
  IF v_app.requested_office IN ('medical_professional', 'therapist', 'other_specialist') THEN
    SELECT license_tier_code, specialist_slot_count INTO v_tier_code, v_specialist_slot_count
    FROM organization_licenses WHERE organization_id = v_app.target_organization_id;
    IF v_tier_code IS NOT NULL THEN
      SELECT count(*) INTO v_specialist_count FROM organization_memberships
        WHERE organization_id = v_app.target_organization_id AND status = 'active' AND org_role IN ('medical_professional', 'therapist', 'other_specialist');
      IF v_specialist_count >= v_specialist_slot_count THEN
        RAISE EXCEPTION 'This organization''s % license has no remaining specialist slots (% of % used). Upgrade the license tier before approving this application.', v_tier_code, v_specialist_count, v_specialist_slot_count;
      END IF;
    END IF;
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_app.target_organization_id, v_app.applicant_user_id, v_app.requested_office, 'active', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role, status = 'active', updated_at = now();

  UPDATE professional_applications SET
    status = 'approved', approved_office = v_app.requested_office, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status)
  VALUES (p_application_id, 'approved', auth.uid(), 'director', 'pending_review', 'approved');

  RETURN v_app;
END;
$function$;

-- invite_org_member
CREATE OR REPLACE FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text)
 RETURNS organization_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_user_id UUID;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_row organization_memberships;
  v_is_director boolean;
  v_is_office_admin boolean;
  v_package TEXT;
  v_role_cap INTEGER;
  v_role_count INTEGER;
BEGIN
  v_is_director := public.is_active_org_director(p_org_id);
  v_is_office_admin := EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND org_role = 'office_administrator' AND status = 'active'
  );
  IF NOT v_is_director AND NOT v_is_office_admin THEN
    RAISE EXCEPTION 'Only an active director, co-director, or office administrator of this organization may invite staff';
  END IF;

  IF p_org_role IN ('therapist', 'medical_professional', 'other_specialist') THEN
    RAISE EXCEPTION 'A therapist or medical professional office requires independently verified credentials -- submit a professional application for this organization instead of a direct invite';
  END IF;

  SELECT package_type INTO v_package FROM organizations WHERE id = p_org_id;
  IF v_package = 'therapist' AND p_org_role = 'caregiver' THEN
    RAISE EXCEPTION 'This organization''s Therapist Enterprise package does not include the caregiver office';
  END IF;

  IF v_is_director THEN
    IF p_org_role NOT IN ('caregiver', 'billing_admin', 'co_director', 'office_administrator', 'clinical_supervisor', 'auditor') THEN
      RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
    END IF;
  ELSE
    IF p_org_role NOT IN ('caregiver', 'billing_admin') THEN
      RAISE EXCEPTION 'An office administrator may only invite caregiver or billing administrator roles';
    END IF;
  END IF;

  SELECT id INTO v_target_user_id FROM profiles WHERE lower(email) = lower(btrim(p_email));
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first, then invite them.', p_email;
  END IF;

  PERFORM licensed_seats FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;

  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
  END IF;

  v_role_cap := CASE p_org_role
    WHEN 'caregiver' THEN (SELECT max_caregiver_seats FROM organization_licenses WHERE organization_id = p_org_id)
    WHEN 'billing_admin' THEN (SELECT max_billing_admin_seats FROM organization_licenses WHERE organization_id = p_org_id)
    ELSE NULL
  END;
  IF v_role_cap IS NOT NULL THEN
    SELECT count(*) INTO v_role_count FROM organization_memberships
      WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role = p_org_role;
    IF v_role_count >= v_role_cap THEN
      RAISE EXCEPTION 'No licensed % seats are available for this organization (% of % used). Configure a higher per-role cap before inviting more.', p_org_role, v_role_count, v_role_cap;
    END IF;
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_org_id, v_target_user_id, p_org_role, 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = EXCLUDED.org_role,
    status = CASE WHEN organization_memberships.status = 'revoked' THEN 'invited' ELSE organization_memberships.status END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- hcn_enforce_active_specialist_capacity
CREATE OR REPLACE FUNCTION public.hcn_enforce_active_specialist_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tier text; v_slots integer; v_catalog_slots integer; v_used bigint;
BEGIN
 IF NEW.status <> 'active' OR NEW.org_role NOT IN ('medical_professional','therapist','other_specialist') THEN RETURN NEW; END IF;
 SELECT l.license_tier_code,l.specialist_slot_count INTO v_tier,v_slots
 FROM public.organization_licenses l WHERE l.organization_id=NEW.organization_id FOR UPDATE;
 IF NEW.org_role = 'other_specialist' THEN
   IF v_tier IS NULL THEN
     RAISE EXCEPTION 'Other Specialist requires a tier-based license' USING ERRCODE='23514';
   END IF;
   IF NOT EXISTS (
     SELECT 1 FROM public.professional_applications a
     WHERE a.applicant_user_id=NEW.user_id AND a.target_organization_id=NEW.organization_id
       AND a.requested_office='other_specialist' AND a.credential_verification_status='independently_verified'
       AND a.status IN ('pending_review','resubmitted','approved')
   ) THEN
     RAISE EXCEPTION 'Other Specialist needs a credential-verified application' USING ERRCODE='23514';
   END IF;
 END IF;
 IF v_tier IS NULL THEN RETURN NEW; END IF;
 SELECT specialist_slot_count INTO v_catalog_slots FROM public.license_tier_catalog WHERE tier_code=v_tier;
 IF v_catalog_slots IS NULL OR v_slots IS NULL THEN
  RAISE EXCEPTION 'Specialist capacity configuration missing for tier %',v_tier USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO v_used FROM public.organization_memberships m
 WHERE m.organization_id=NEW.organization_id AND m.status='active'
 AND m.org_role IN ('medical_professional','therapist','other_specialist')
 AND (TG_OP='INSERT' OR m.id<>NEW.id);
 IF v_used >= LEAST(v_slots,v_catalog_slots) THEN
  RAISE EXCEPTION 'No specialist slots remain for tier % (% of % occupied)',v_tier,v_used,LEAST(v_slots,v_catalog_slots) USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS hcn_specialist_capacity_guard ON public.organization_memberships;
CREATE TRIGGER hcn_specialist_capacity_guard
BEFORE INSERT OR UPDATE OF organization_id,org_role,status ON public.organization_memberships
FOR EACH ROW EXECUTE FUNCTION public.hcn_enforce_active_specialist_capacity();
REVOKE ALL ON FUNCTION public.hcn_enforce_active_specialist_capacity() FROM PUBLIC,anon,authenticated;
