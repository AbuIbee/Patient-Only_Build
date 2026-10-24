-- OWNER DIRECTIVE MMA-ENT-SALES-006 — Phase H5 ("Director... may
-- request upgrade/renewal/cancel but cannot self-issue, self-price or
-- alter entitlements") and Phase I1 ("Enterprise expansion... Director
-- request -> Platform Owner commercial review -> terms/amendment ->
-- applicable agreement/payment prerequisites -> validated entitlement
-- update -> notification/audit") are the SAME feature from two ends.
-- This migration builds it once, reusing the existing sales pipeline
-- (sales_prospects/sales_quotes, migration 107) rather than a second
-- quoting system, and the existing Enterprise billing/checkout
-- (migration 110) rather than a second payment path.
--
-- Flow: Director requests an amendment (expansion/renewal/downgrade/
-- cancellation) -> Platform Owner reviews and, if proceeding, quotes
-- it (one RPC call that creates a normal prospect+quote and links
-- them back to the request) -> Director pays via the EXISTING
-- create-enterprise-checkout-session Edge Function (quote-driven,
-- unchanged) -> the EXISTING stripe-webhook, on confirmed payment,
-- now ALSO tries apply_organization_amendment_from_quote() alongside
-- its existing activate_enterprise_license_from_quote() try (exactly
-- one of the two will find a match for any given quote) -> the
-- organization's EXISTING license (same license_number -- an
-- amendment changes entitlements, it is not a new license) is updated
-- in place with the new seats/capacity/fee.
CREATE TABLE IF NOT EXISTS organization_amendment_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  requested_by        UUID NOT NULL REFERENCES profiles(id),
  request_type        TEXT NOT NULL CHECK (request_type IN ('expansion', 'renewal', 'downgrade', 'cancellation')),
  requested_details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  director_notes       TEXT,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'quoted', 'rejected', 'withdrawn', 'completed')),
  resulting_quote_id   UUID REFERENCES sales_quotes(id),
  platform_owner_notes TEXT,
  reviewed_by          UUID REFERENCES profiles(id),
  reviewed_at          TIMESTAMP WITH TIME ZONE,
  completed_at         TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE organization_amendment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active org directors can view their own amendment requests"
  ON organization_amendment_requests FOR SELECT TO authenticated
  USING (is_active_org_director(organization_id));
CREATE POLICY "Platform Owner can view all amendment requests"
  ON organization_amendment_requests FOR SELECT TO authenticated
  USING (is_platform_owner());

-- director_request_organization_amendment(): the ONLY client-reachable
-- write for a Director -- creates a 'pending' request only. Cannot
-- set price, seats, or any entitlement; cannot set status beyond
-- 'pending'/'withdrawn' (its own request, before the owner acts).
CREATE OR REPLACE FUNCTION director_request_organization_amendment(
  p_organization_id UUID, p_request_type TEXT, p_requested_details JSONB, p_director_notes TEXT
) RETURNS organization_amendment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row organization_amendment_requests;
BEGIN
  IF NOT is_active_org_director(p_organization_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may request an amendment';
  END IF;
  IF p_request_type NOT IN ('expansion', 'renewal', 'downgrade', 'cancellation') THEN
    RAISE EXCEPTION 'Invalid request type: %', p_request_type;
  END IF;

  INSERT INTO organization_amendment_requests (organization_id, requested_by, request_type, requested_details, director_notes)
  VALUES (p_organization_id, auth.uid(), p_request_type, coalesce(p_requested_details, '{}'::jsonb), p_director_notes)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION director_request_organization_amendment(UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION director_request_organization_amendment(UUID, TEXT, JSONB, TEXT) TO authenticated;

-- A Director may withdraw their own still-pending request (never a
-- quoted/completed one -- that requires the Platform Owner, since a
-- real quote may already exist by then).
CREATE OR REPLACE FUNCTION director_withdraw_amendment_request(p_request_id UUID)
RETURNS organization_amendment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row organization_amendment_requests;
BEGIN
  SELECT * INTO v_row FROM organization_amendment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF v_row.requested_by <> auth.uid() THEN RAISE EXCEPTION 'You may only withdraw your own request'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending request can be withdrawn'; END IF;

  UPDATE organization_amendment_requests SET status = 'withdrawn', updated_at = now() WHERE id = p_request_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION director_withdraw_amendment_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION director_withdraw_amendment_request(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_reject_amendment_request(p_request_id UUID, p_notes TEXT)
RETURNS organization_amendment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row organization_amendment_requests;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may reject an amendment request'; END IF;
  SELECT * INTO v_row FROM organization_amendment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending request can be rejected'; END IF;

  UPDATE organization_amendment_requests SET
    status = 'rejected', platform_owner_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_reject_amendment_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_reject_amendment_request(UUID, TEXT) TO authenticated;

-- platform_owner_quote_amendment_request(): the ONLY path from a
-- pending request to a real, priced quote. Creates a normal
-- sales_prospects + sales_quotes row through the EXISTING RPCs
-- (platform_owner_create_prospect/platform_owner_create_quote logic,
-- inlined here under the same owner-only gate) and links them back to
-- the request -- never a second quoting mechanism. The resulting quote
-- is immediately 'sent' (the owner is quoting a customer who already
-- asked for this, there is no separate draft/review step the way a
-- brand-new prospect quote has).
CREATE OR REPLACE FUNCTION platform_owner_quote_amendment_request(
  p_request_id UUID, p_contact_name TEXT, p_contact_email TEXT,
  p_package_type TEXT, p_proposed_licensed_seats INTEGER, p_proposed_covered_patient_capacity INTEGER,
  p_annual_license_fee NUMERIC, p_billing_cadence TEXT, p_quote_term_months INTEGER, p_notes TEXT
) RETURNS organization_amendment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_request organization_amendment_requests;
  v_org organizations;
  v_prospect sales_prospects;
  v_quote sales_quotes;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may quote an amendment request'; END IF;

  SELECT * INTO v_request FROM organization_amendment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending request can be quoted'; END IF;
  IF v_request.request_type = 'cancellation' THEN
    RAISE EXCEPTION 'A cancellation request is approved directly, not quoted -- use platform_owner_approve_cancellation_request';
  END IF;

  SELECT * INTO v_org FROM organizations WHERE id = v_request.organization_id;
  IF v_org.id IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  INSERT INTO sales_prospects (contact_name, contact_email, contact_phone, prospective_organization_name, notes, status, created_by)
  VALUES (p_contact_name, p_contact_email, NULL, v_org.name, p_notes, 'quoted', auth.uid())
  RETURNING * INTO v_prospect;

  INSERT INTO sales_quotes (
    prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity,
    annual_license_fee, billing_cadence, quote_term_months, discount_notes, status, created_by
  ) VALUES (
    v_prospect.id, p_package_type, p_proposed_licensed_seats, p_proposed_covered_patient_capacity,
    p_annual_license_fee, p_billing_cadence, p_quote_term_months, p_notes, 'sent', auth.uid()
  ) RETURNING * INTO v_quote;

  UPDATE organization_amendment_requests SET
    status = 'quoted', resulting_quote_id = v_quote.id, platform_owner_notes = p_notes,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_quote_amendment_request(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_quote_amendment_request(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, TEXT, INTEGER, TEXT) TO authenticated;

-- The Director's own read-path to find a quoted amendment for their
-- organization, so the dashboard can offer the same checkout flow
-- already built for initial activation.
CREATE OR REPLACE FUNCTION get_my_quoted_amendment_for_org(p_organization_id UUID)
RETURNS SETOF organization_amendment_requests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM organization_amendment_requests
  WHERE organization_id = p_organization_id AND status = 'quoted' AND is_active_org_director(p_organization_id)
  ORDER BY created_at DESC;
$$;
REVOKE ALL ON FUNCTION get_my_quoted_amendment_for_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_quoted_amendment_for_org(UUID) TO authenticated;

-- apply_organization_amendment_from_quote(): the ONLY path by which a
-- confirmed-paid amendment quote changes an EXISTING organization's
-- EXISTING license entitlements. service_role-only (called from the
-- stripe-webhook Edge Function), mirrors
-- activate_enterprise_license_from_quote()'s payment gate exactly.
-- Unlike that function, this one does NOT issue a new license
-- number -- an amendment changes what an existing license covers, it
-- is not a new commercial issuance. Handles 'expansion'/'renewal'/
-- 'downgrade' only -- 'cancellation' is intentionally a SEPARATE,
-- simpler, direct-approval path below: stopping payment should never
-- itself require routing through a NEW Stripe checkout, which is
-- backwards.
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

  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'No such quote %', p_quote_id; END IF;

  SELECT * INTO v_license FROM organization_licenses WHERE organization_id = v_request.organization_id FOR UPDATE;
  IF v_license.id IS NULL THEN RAISE EXCEPTION 'No license configuration row exists for organization %', v_request.organization_id; END IF;

  -- "Preserve prior effective entitlements while an amendment is
  -- pending": the license is left completely untouched at every
  -- status up to this point (pending/quoted) -- this UPDATE, gated on
  -- confirmed payment above, is the one and only moment entitlements
  -- actually change.
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

-- The separate, direct cancellation-approval path: no quote, no
-- checkout -- the Platform Owner directly confirms the organization's
-- license should stop. Reuses the exact same authority
-- admin_set_organization_license_status() already has (migration
-- 039's profiles.role IN ('admin','superadmin') gate), just scoped to
-- this one request/organization and auditable through the request
-- row itself.
CREATE OR REPLACE FUNCTION platform_owner_approve_cancellation_request(p_request_id UUID, p_notes TEXT)
RETURNS organization_amendment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_request organization_amendment_requests;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may approve a cancellation'; END IF;

  SELECT * INTO v_request FROM organization_amendment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'No such request'; END IF;
  IF v_request.request_type <> 'cancellation' THEN RAISE EXCEPTION 'This request is not a cancellation request'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending request can be approved'; END IF;

  UPDATE organization_licenses SET status = 'canceled', updated_at = now()
  WHERE organization_id = v_request.organization_id;

  UPDATE organization_amendment_requests SET
    status = 'completed', platform_owner_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now(), completed_at = now(), updated_at = now()
  WHERE id = p_request_id RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_approve_cancellation_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_approve_cancellation_request(UUID, TEXT) TO authenticated;
