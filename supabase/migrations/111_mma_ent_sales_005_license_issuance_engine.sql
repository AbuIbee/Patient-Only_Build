-- OWNER DIRECTIVE MMA-ENT-SALES-005 Phase G — the license issuance
-- engine. Closes the loop the business scenario names explicitly:
-- prospect -> quote -> invitation -> application -> approval ->
-- LICENSE -> Director operations. Approval (migration 083's
-- platform_owner_approve_director_application()) already creates the
-- organization + active Director membership + a 'proposed' license
-- row; what has been missing is the step that turns 'proposed' into a
-- real, numbered, 'active' license once real payment is confirmed.
--
-- Deliberately does NOT touch admin_set_organization_license_status()
-- (migration 039) -- that stays exactly what its own comment says it
-- is: a staging-only, human-admin-triggered synthetic-test switch.
-- This migration adds the SEPARATE, genuinely automatic path: real
-- Stripe payment confirmation (the enterprise-billing webhook branch
-- added in migration 110 / the stripe-webhook Edge Function) driving
-- real license activation, with no human click in between. The two
-- mechanisms coexist for two different purposes; neither replaces the
-- other.
CREATE TABLE IF NOT EXISTS enterprise_license_sequences (
  year        INTEGER NOT NULL,
  prefix      TEXT NOT NULL,
  next_value  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year, prefix)
);
ALTER TABLE enterprise_license_sequences ENABLE ROW LEVEL SECURITY;
-- No client-readable/writable policy at all -- this is purely an
-- internal counter for activate_enterprise_license_from_quote() below,
-- never queried directly by any client.

ALTER TABLE organization_licenses ADD COLUMN IF NOT EXISTS license_number TEXT UNIQUE;

-- activate_enterprise_license_from_quote(): the ONLY path by which a
-- license moves 'proposed' -> 'active' as a result of a REAL Stripe
-- payment, and the only issuer of a license number. Restricted to
-- service_role (called directly by the stripe-webhook Edge Function,
-- which authenticates to Postgres with the service-role key) plus
-- internal PERFORM calls from platform_owner_approve_director_application
-- below -- a nested call from within another SECURITY DEFINER
-- function's body runs under that function's own privilege and needs
-- no separate grant.
--
-- Number format is the owner-specified MMA-FE-YYYY-NNNNNN (package_type
-- 'integrated_care', i.e. Full Enterprise) / MMA-TE-YYYY-NNNNNN
-- (package_type 'therapist', i.e. Therapist Enterprise) -- the only two
-- package types this schema has ever defined (migration 035). Fails
-- closed on any other package_type rather than guessing a prefix.
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

  -- CRITICAL GATE: this function is the only automatic path to a real
  -- license, and it must never activate one without confirmed payment.
  -- platform_owner_approve_director_application() calls this
  -- unconditionally on every approval of a quote-originated
  -- application (as a safety net for the "paid before approved"
  -- ordering) -- so this check, not the caller, is what actually
  -- prevents an unpaid application from getting a free license the
  -- moment it's approved.
  IF NOT EXISTS (
    SELECT 1 FROM enterprise_billing_accounts eba
    WHERE eba.quote_id = p_quote_id AND eba.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No confirmed-paid Enterprise billing account exists for quote % -- license cannot activate without confirmed payment', p_quote_id;
  END IF;

  -- The organization only exists once the Director application
  -- referencing this quote has been approved (migration 083). Paying
  -- before approval is possible (nothing in migration 110 requires
  -- approval first) but cannot activate anything yet -- fails closed
  -- here, and platform_owner_approve_director_application's own call
  -- below retries this the moment approval happens.
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

  -- Idempotent: a replayed webhook delivery (or this function being
  -- called from both the webhook and the approval path for the same
  -- quote) must never issue a second license number for the same
  -- organization.
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

  -- Seats/capacity/fee come from the SAME quote the applicant actually
  -- paid for -- never re-derived from org_configure_license()'s own
  -- (director-settable, pre-payment, advisory-only) values.
  UPDATE organization_licenses SET
    license_number = v_license_number,
    licensed_seats = v_quote.proposed_licensed_seats,
    covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
    annual_license_fee = v_quote.annual_license_fee,
    status = 'active',
    activated_by = NULL, -- system/payment-driven activation, not a human admin click
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

-- The counterpart for a full, confirmed Stripe subscription
-- cancellation (not a mere payment-failure grace period, which this
-- deliberately does NOT touch -- inventing a specific grace-period
-- policy/day-count was not asked for and risks cutting off a
-- dementia-care patient's coverage over a transient billing hiccup).
-- Keeps organization_licenses.status in sync with the ONE real
-- business event ("the subscription is actually gone") that already
-- has a clear, unambiguous answer.
CREATE OR REPLACE FUNCTION set_enterprise_license_status_for_quote(p_quote_id UUID, p_status TEXT)
RETURNS organization_licenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_license organization_licenses;
BEGIN
  IF p_status NOT IN ('expired', 'canceled', 'unpaid') THEN
    RAISE EXCEPTION 'set_enterprise_license_status_for_quote only handles non-activating transitions, got %', p_status;
  END IF;

  SELECT * INTO v_app FROM professional_applications
  WHERE application_details->>'originatingQuoteId' = p_quote_id::text
    AND status = 'approved' AND target_organization_id IS NOT NULL
  ORDER BY platform_owner_approved_at DESC
  LIMIT 1;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No approved Director application with an organization references quote %', p_quote_id;
  END IF;

  UPDATE organization_licenses SET status = p_status, updated_at = now()
  WHERE organization_id = v_app.target_organization_id
  RETURNING * INTO v_license;
  IF v_license.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration row exists for organization %', v_app.target_organization_id;
  END IF;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'enterprise_license_status_changed', NULL, 'system', v_app.status, v_app.status,
    'License set to ' || p_status || ' for organization ' || v_app.target_organization_id);

  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION set_enterprise_license_status_for_quote(UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION set_enterprise_license_status_for_quote(UUID, TEXT) TO service_role;

-- Safety net for the "paid before approved" ordering: the instant an
-- application is approved, check whether its originating quote already
-- has a confirmed-paid (status='active') Enterprise billing account
-- and, if so, activate the license immediately rather than waiting on
-- a Stripe webhook retry window. Never blocks or fails approval itself
-- -- a quote that hasn't been paid for yet (the expected, common
-- ordering: approve first, pay after) is exactly the normal case, not
-- an error.
CREATE OR REPLACE FUNCTION public.platform_owner_approve_director_application(p_application_id UUID) RETURNS organizations AS $$
DECLARE
  v_app professional_applications;
  v_org organizations;
  v_quote_id UUID;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may approve a Director application';
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office <> 'director' THEN RAISE EXCEPTION 'This is not a Director application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'resubmitted') THEN RAISE EXCEPTION 'This application is not open for approval'; END IF;

  INSERT INTO organizations (name, package_type, created_by)
  VALUES (v_app.proposed_organization_name, v_app.proposed_package_type, v_app.applicant_user_id)
  RETURNING * INTO v_org;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, v_app.applicant_user_id, 'director', 'active', auth.uid());

  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  UPDATE professional_applications SET
    status = 'approved', approved_office = 'director', target_organization_id = v_org.id,
    platform_owner_approved_by = auth.uid(), platform_owner_approved_at = now(),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'platform_owner_approved', auth.uid(), 'platform_owner', v_app.status, 'approved', 'Organization ' || v_org.name || ' created and Director activated');

  BEGIN
    v_quote_id := (v_app.application_details->>'originatingQuoteId')::uuid;
    IF v_quote_id IS NOT NULL THEN
      PERFORM public.activate_enterprise_license_from_quote(v_quote_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Not yet paid (the common case), not an Enterprise-billed
    -- application at all, or a malformed originatingQuoteId -- the
    -- license simply stays 'proposed' until the Stripe webhook
    -- activates it later. Never fails approval itself over this.
    NULL;
  END;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_approve_director_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_approve_director_application(UUID) TO authenticated;
