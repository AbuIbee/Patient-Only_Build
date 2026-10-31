-- Issue #3 P0-01 — "Unpaid Director membership." Owner-approved
-- corrective directive, 2026-10-31.
--
-- DEFECT: platform_owner_approve_director_application() inserted
-- organization_memberships(status='active', org_role='director') at
-- the moment of Platform Owner approval, while organization_licenses
-- stayed 'proposed'. is_active_org_director() only checks membership
-- status/role -- it never looks at the license -- so an approved-but-
-- unpaid applicant already held full, unexpiring Director authority
-- over every RLS policy and RPC gated on is_active_org_director(),
-- months before any billing, agreement, or payment event.
--
-- FIX: approval now creates the membership as 'invited' (the existing
-- organization_memberships_status_check already allows invited/
-- active/revoked/declined -- no new state, per the directive).
-- activate_enterprise_license_from_quote() -- already the one place
-- that independently re-verifies annual billing, monthly billing
-- authorization, and executed SaaS+BAA agreements before issuing a
-- license -- is now ALSO the one place that promotes that SAME
-- Director's membership from 'invited' to 'active', atomically, in
-- the same transaction as license issuance. An applicant who never
-- pays simply never has an active membership; nothing else changes.
--
-- REGRESSION AVOIDED: is_active_org_director()/is_active_org_member()
-- gate a Director's own visibility into their own pending
-- organization and license row (OrganizationBillingPage.tsx ->
-- getOrgLicense() -> a direct, RLS-gated SELECT on
-- organization_licenses). Narrowing the Director's membership to
-- 'invited' pre-payment would silently blank that page for every
-- newly-approved applicant -- exactly the "preserve legitimate
-- preactivation billing/onboarding visibility" requirement the
-- directive calls out. Fixed with two ADDITIVE (not replacing) RLS
-- policies scoped to a new, narrow, director-only, invited-OR-active
-- predicate -- every existing policy and every other role's access is
-- completely untouched.

-- ============================================================================
-- is_invited_or_active_org_director(): the narrow preactivation
-- predicate. Deliberately NOT a replacement for is_active_org_director
-- (which must keep meaning "has CONFIRMED, PAID authority" for every
-- clinical/operational/financial gate) -- this one means only "is the
-- director-of-record for this org, paid or not," and must never be
-- used to gate anything beyond read-only visibility of the org's own
-- identity and its own license/billing status.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_invited_or_active_org_director(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND org_role IN ('director', 'co_director') AND status IN ('invited', 'active')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_invited_or_active_org_director(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_invited_or_active_org_director(UUID) TO authenticated;

-- "TO authenticated" is deliberate and required, not stylistic: this
-- repository has a hard, absolute invariant (migration 106, and its own
-- EXHAUSTIVE GUARD regression test) that NO function in the public
-- schema ever grants anon EXECUTE, via any path. A bare policy (no TO
-- clause) defaults to PUBLIC, meaning Postgres must evaluate this
-- policy's USING clause for an anon query too, which would need EXECUTE
-- on this function for anon -- exactly what must never be granted.
-- Scoping the policy itself to authenticated means Postgres never even
-- attempts to evaluate it for anon, so no such grant is ever needed.
DO $$ BEGIN
  CREATE POLICY "An invited director can view their own pending organization"
    ON organizations FOR SELECT TO authenticated
    USING (public.is_invited_or_active_org_director(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "An invited director can view their own pending license status"
    ON organization_licenses FOR SELECT TO authenticated
    USING (public.is_invited_or_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- platform_owner_approve_director_application(): the ONLY change is
-- the membership INSERT's status. Everything else -- organization
-- creation, license row creation ('proposed', unchanged), application
-- status transition, the best-effort immediate activate_enterprise_
-- license_from_quote() attempt for the "paid before approved"
-- ordering -- is preserved exactly as migration 111 left it.
-- ============================================================================
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

  -- P0-01 FIX: 'invited', not 'active'. Operational Director authority
  -- (is_active_org_director()) is granted ONLY by
  -- activate_enterprise_license_from_quote() below, once payment and
  -- agreements are independently verified.
  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, v_app.applicant_user_id, 'director', 'invited', auth.uid());

  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  UPDATE professional_applications SET
    status = 'approved', approved_office = 'director', target_organization_id = v_org.id,
    platform_owner_approved_by = auth.uid(), platform_owner_approved_at = now(),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'platform_owner_approved', auth.uid(), 'platform_owner', v_app.status, 'approved', 'Organization ' || v_org.name || ' created; Director membership invited, pending verified billing');

  BEGIN
    v_quote_id := (v_app.application_details->>'originatingQuoteId')::uuid;
    IF v_quote_id IS NOT NULL THEN
      PERFORM public.activate_enterprise_license_from_quote(v_quote_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Not yet paid (the common case), not an Enterprise-billed
    -- application at all, or a malformed originatingQuoteId -- the
    -- license simply stays 'proposed' and the membership stays
    -- 'invited' until the Stripe webhook activates it later. Never
    -- fails approval itself over this.
    NULL;
  END;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.platform_owner_approve_director_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_approve_director_application(UUID) TO authenticated;

-- ============================================================================
-- activate_enterprise_license_from_quote(): identical prerequisite
-- gates as the current (migration 20261030013820) version -- annual
-- billing active, monthly billing authorized when the application has
-- one, both SaaS and BAA agreements executed, an approved application
-- with a target organization. The ONLY addition: once the license
-- itself is confirmed issued/active, atomically promote that SAME
-- applicant's 'invited' Director membership in that SAME organization
-- to 'active'. The WHERE clause matches status='invited' only --
-- never 'revoked' or 'declined' -- so a revoked Director can never be
-- resurrected by a payment retry (required negative scenario 5), and
-- re-running this function (webhook retry, replay) is a no-op once
-- the membership is already 'active' (idempotent).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.activate_enterprise_license_from_quote(p_quote_id UUID)
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
  v_required_type TEXT;
  v_tier license_tier_catalog;
  v_anchor_date DATE;
  v_anchor_tz TEXT;
  v_already_active BOOLEAN := false;
BEGIN
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'No such quote (%)', p_quote_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enterprise_billing_accounts eba WHERE eba.quote_id = p_quote_id AND eba.billing_component = 'annual_license' AND eba.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No confirmed-paid Enterprise billing account exists for quote % -- license cannot activate without confirmed payment', p_quote_id;
  END IF;

  IF (EXISTS (SELECT 1 FROM professional_applications WHERE application_details->>'originatingQuoteId' = p_quote_id::text AND selected_tier_code IS NOT NULL)
      OR EXISTS (SELECT 1 FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'monthly_patients'))
     AND NOT EXISTS (SELECT 1 FROM enterprise_billing_accounts WHERE quote_id = p_quote_id AND billing_component = 'monthly_patients' AND status = 'active' AND NULLIF(btrim(stripe_subscription_id), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'The monthly active-patient subscription has no confirmed recurring-payment authorization yet for quote %', p_quote_id;
  END IF;

  FOREACH v_required_type IN ARRAY ARRAY['saas_license', 'baa'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM enterprise_contracts ec
      WHERE ec.quote_id = p_quote_id AND ec.contract_type = v_required_type AND ec.status = 'executed'
        AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
    ) THEN
      RAISE EXCEPTION 'A required % agreement for quote % has not yet been executed -- license cannot activate until it is', v_required_type, p_quote_id;
    END IF;
  END LOOP;

  SELECT * INTO v_app FROM professional_applications
  WHERE application_details->>'originatingQuoteId' = p_quote_id::text
    AND status IN ('approved', 'payment_verified', 'provisioning_pending') AND target_organization_id IS NOT NULL
  ORDER BY platform_owner_approved_at DESC
  LIMIT 1;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No approved Director application with an organization references quote % yet -- license cannot activate before approval', p_quote_id;
  END IF;

  SELECT * INTO v_license FROM organization_licenses WHERE organization_id = v_app.target_organization_id FOR UPDATE;
  IF v_license.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration row exists for organization %', v_app.target_organization_id;
  END IF;

  v_already_active := (v_license.status = 'active' AND v_license.license_number IS NOT NULL);

  -- P0-01 FIX, and ORDERING FIX: promote the Director's own membership
  -- to 'active' BEFORE the organization_licenses UPDATE below, not
  -- after. trg_notify_license_status() (migration 141) fires
  -- synchronously on that UPDATE and looks up an org_role='director'
  -- membership with status='active' to notify -- if the promotion
  -- happened afterward, that lookup would always find none yet and
  -- the "your license is active" notification would silently never
  -- fire (caught and reproduced via enterpriseNotifications.test.ts
  -- while verifying this migration). WHERE status='invited' is
  -- deliberate and exhaustive -- a no-op for an already-active
  -- membership (idempotent replay) and it can NEVER match a 'revoked'
  -- or 'declined' row (required negative scenario 5: a revoked
  -- Director cannot be resurrected by a payment retry).
  UPDATE organization_memberships SET status = 'active', updated_at = now()
  WHERE organization_id = v_app.target_organization_id
    AND user_id = v_app.applicant_user_id
    AND org_role = 'director'
    AND status = 'invited';

  IF NOT v_already_active THEN
    IF v_app.selected_tier_code IS NOT NULL THEN
      SELECT * INTO v_tier FROM license_tier_catalog WHERE tier_code = v_app.selected_tier_code;
      v_prefix := CASE v_app.selected_tier_code
        WHEN 'essential' THEN 'MMA-ES' WHEN 'plus' THEN 'MMA-PL' WHEN 'complete' THEN 'MMA-CO' ELSE NULL
      END;
    ELSE
      v_prefix := CASE v_quote.package_type
        WHEN 'integrated_care' THEN 'MMA-FE'
        WHEN 'therapist' THEN 'MMA-TE'
        ELSE NULL
      END;
    END IF;
    IF v_prefix IS NULL THEN
      RAISE EXCEPTION 'Unrecognized package type % / tier % on quote % -- cannot issue a license number', v_quote.package_type, v_app.selected_tier_code, p_quote_id;
    END IF;

    v_year := EXTRACT(YEAR FROM now())::INTEGER;

    INSERT INTO enterprise_license_sequences (year, prefix, next_value)
    VALUES (v_year, v_prefix, 1)
    ON CONFLICT (year, prefix) DO UPDATE SET next_value = enterprise_license_sequences.next_value + 1
    RETURNING next_value INTO v_seq;

    v_license_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');

    v_anchor_date := NULLIF(v_app.application_details->>'monthlyBillingAnchorDate', '')::DATE;
    v_anchor_tz := NULLIF(v_app.application_details->>'monthlyBillingTimezone', '');

    UPDATE organization_licenses SET
      status = 'active', license_number = v_license_number,
      licensed_seats = v_quote.proposed_licensed_seats, covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
      annual_license_fee = v_quote.annual_license_fee,
      license_tier_code = v_app.selected_tier_code,
      specialist_slot_count = COALESCE(v_tier.specialist_slot_count, specialist_slot_count),
      legacy_package_type_at_issuance = v_quote.package_type,
      monthly_billing_anchor_date = v_anchor_date,
      monthly_billing_timezone = v_anchor_tz,
      activated_by = v_app.applicant_user_id, activated_at = now(), updated_at = now()
    WHERE id = v_license.id
    RETURNING * INTO v_license;

    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (v_app.id, 'enterprise_license_activated', v_app.applicant_user_id, 'system', v_app.status, v_app.status, 'License activated: ' || v_license_number);
  END IF;

  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_enterprise_license_from_quote(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.activate_enterprise_license_from_quote(UUID) TO service_role;

-- ============================================================================
-- Remediation diagnostic (read-only; mutates nothing). "Design
-- explicit remediation for old active unpaid Directors" -- this
-- repository has no production data, and this migration must never
-- touch staging/production per the governing directive, so the
-- correct remediation here is a surfaced, reviewable list, not a
-- blind automatic downgrade: an org whose Director membership is
-- already 'active' while its license is anything but 'active' is
-- exactly the pre-fix defect signature and needs a human decision
-- (was this organization legitimately hand-activated by the Platform
-- Owner for a real reason outside this bug, or is it an unpaid
-- approval that predates this fix?) before any membership is revoked.
-- ============================================================================
DO $$
DECLARE
  v_count INTEGER;
  v_row RECORD;
BEGIN
  SELECT count(*) INTO v_count
  FROM organization_memberships om
  JOIN organization_licenses ol ON ol.organization_id = om.organization_id
  WHERE om.org_role = 'director' AND om.status = 'active' AND ol.status <> 'active';

  IF v_count > 0 THEN
    RAISE NOTICE 'P0-01 REMEDIATION REVIEW REQUIRED: % existing active Director membership(s) found whose organization license is NOT active (pre-fix defect signature). Review each before any manual action -- this migration does not revoke them automatically.', v_count;
    FOR v_row IN
      SELECT om.organization_id, om.user_id, ol.status AS license_status
      FROM organization_memberships om
      JOIN organization_licenses ol ON ol.organization_id = om.organization_id
      WHERE om.org_role = 'director' AND om.status = 'active' AND ol.status <> 'active'
      LIMIT 50
    LOOP
      RAISE NOTICE '  org=% user=% license_status=%', v_row.organization_id, v_row.user_id, v_row.license_status;
    END LOOP;
  ELSE
    RAISE NOTICE 'P0-01 REMEDIATION REVIEW: no existing active-Director/non-active-license rows found.';
  END IF;
END;
$$;
