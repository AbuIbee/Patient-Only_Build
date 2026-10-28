-- MMA-PROF-ONBOARD-004 P0-2 Phase 2 -- extends the EXISTING
-- professional_applications lifecycle (never a second, parallel status
-- field) with the additional states the self-service canonical journey
-- needs; separates Organization Owner from Organization Director as a
-- first-class, audited distinction; introduces the combined
-- "specialist slot" licensed-capacity model (configurable, dynamically
-- assignable to medical_professional OR therapist, never a hardcoded
-- mix); and fixes a latent license-numbering concurrency bug.
--
-- Status vocabulary reconciliation (documented decision, per the
-- directive's own instruction to "reconcile with existing database
-- states rather than introducing contradictory parallel status
-- fields"): the existing column already has draft/submitted/
-- pending_review/info_required/resubmitted/approved/rejected/withdrawn/
-- suspended/revoked. This migration ADDS auto_verification_pending,
-- manual_review, agreements_pending, agreements_executed,
-- payment_authorization_pending, payment_verified, provisioning_pending,
-- active, canceled to the SAME column/CHECK -- it does not add a
-- second status column. 'needs_information' (named in the earlier
-- commercial directive) is deliberately NOT a new, separate value --
-- it is the SAME concept the existing 'info_required' value already
-- models, and is mapped onto it rather than duplicated. 'verified' is
-- likewise not a persisted resting state: a self-service application
-- that passes every automated check moves directly from
-- auto_verification_pending to agreements_pending (there is nothing
-- further to do while "verified" that isn't already agreements_pending)
-- -- "verified" is reported to the applicant as a transient event
-- (professional_application_events), not a status value an application
-- can be stuck in.
ALTER TABLE professional_applications DROP CONSTRAINT professional_applications_status_check;
ALTER TABLE professional_applications ADD CONSTRAINT professional_applications_status_check CHECK (status IN (
  'draft', 'submitted', 'pending_review', 'info_required', 'resubmitted', 'approved', 'rejected', 'withdrawn', 'suspended', 'revoked',
  'auto_verification_pending', 'manual_review', 'agreements_pending', 'agreements_executed',
  'payment_authorization_pending', 'payment_verified', 'provisioning_pending', 'active', 'canceled'
));

-- entry_method distinguishes the two permitted self-service entry
-- points (public website vs. a secure invitation) from the pre-existing
-- Platform-Owner-driven manual_quote path -- nullable, since every
-- application created before this migration predates the distinction
-- and is neither (legacy rows stay NULL, meaning "pre-existing manual
-- path," not a fabricated classification).
ALTER TABLE professional_applications
  ADD COLUMN IF NOT EXISTS entry_method TEXT CHECK (entry_method IS NULL OR entry_method IN ('public_website', 'invitation', 'manual_quote')),
  ADD COLUMN IF NOT EXISTS selected_tier_code TEXT REFERENCES license_tier_catalog(tier_code),
  ADD COLUMN IF NOT EXISTS initial_expected_active_patients INTEGER CHECK (initial_expected_active_patients IS NULL OR initial_expected_active_patients >= 0),
  -- Locked in at the moment Step 4 (pricing/coupon) completes, never
  -- re-derived from a possibly-since-changed catalog price afterward --
  -- the same "snapshot, not a live reference" principle
  -- enterprise_billing_accounts already establishes for quote-based
  -- billing (migration 110).
  ADD COLUMN IF NOT EXISTS annual_license_fee_snapshot_cents INTEGER CHECK (annual_license_fee_snapshot_cents IS NULL OR annual_license_fee_snapshot_cents >= 0),
  ADD COLUMN IF NOT EXISTS auto_verification_result JSONB,
  ADD COLUMN IF NOT EXISTS exception_review_reason TEXT;

-- ============================================================================
-- Organization Owner vs. Organization Director (directive §4). Every
-- organization created BEFORE this migration has exactly one real-world
-- owner already: organizations.created_by (the applicant whose Director
-- application created it) -- this has always meant "the person who
-- bought this license," identically to what "Owner" now means
-- explicitly. get_organization_owner() makes that existing, implicit
-- fact explicit and queryable, with zero migration/backfill required
-- and zero change to any existing organization's real authority:
-- organization_owner_user_id is nullable and NULL for every
-- pre-existing row, falling back to created_by.
-- ============================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_owner_user_id UUID REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION get_organization_owner(p_organization_id UUID) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT organization_owner_user_id FROM organizations WHERE id = p_organization_id),
    (SELECT created_by FROM organizations WHERE id = p_organization_id)
  );
$$;
REVOKE ALL ON FUNCTION get_organization_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_organization_owner(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION is_organization_owner(p_organization_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT get_organization_owner(p_organization_id) = auth.uid();
$$;
REVOKE ALL ON FUNCTION is_organization_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_organization_owner(UUID) TO authenticated;

-- Append-only audit of every ownership-relevant event: initial owner
-- assignment at provisioning, a Director appointment or replacement the
-- Owner makes, and a Platform Owner recovery action. No UPDATE/DELETE
-- policy anywhere in this migration -- same default-deny pattern every
-- other audit table in this schema already uses.
CREATE TABLE IF NOT EXISTS organization_ownership_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL CHECK (event_type IN ('owner_set_at_provisioning', 'director_appointed', 'director_replaced', 'owner_recovery')),
  actor_user_id        UUID REFERENCES profiles(id),
  previous_director_id UUID REFERENCES profiles(id),
  new_director_id      UUID REFERENCES profiles(id),
  previous_owner_id    UUID REFERENCES profiles(id),
  new_owner_id         UUID REFERENCES profiles(id),
  reason               TEXT,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE organization_ownership_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform Owner can view all organization ownership events" ON organization_ownership_events
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "The organization's own owner can view its ownership history" ON organization_ownership_events
  FOR SELECT TO authenticated USING (is_organization_owner(organization_id));

-- owner_replace_director(): Director status does NOT inherently grant
-- ownership, billing-control, legal-signatory authority, or the ability
-- to replace the Owner -- only the recognized Owner (get_organization_owner)
-- may call this. Revokes every currently-active director membership,
-- then invites the replacement via the SAME invite_org_member() RPC
-- every other staff invitation already goes through (so the new
-- Director still must accept the invitation through the existing
-- respond_to_org_invite() flow -- "authenticated appointment,
-- invitation acceptance" is satisfied by reusing that real mechanism,
-- not inventing a second one).
CREATE OR REPLACE FUNCTION owner_replace_director(p_organization_id UUID, p_new_director_email TEXT, p_reason TEXT)
RETURNS organization_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_previous_director_id UUID;
  v_new_director_id UUID;
  v_row organization_memberships;
BEGIN
  IF NOT is_organization_owner(p_organization_id) THEN
    RAISE EXCEPTION 'Only this organization''s Owner may replace its Director';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required to replace a Director';
  END IF;

  SELECT id INTO v_new_director_id FROM profiles WHERE lower(email) = lower(btrim(p_new_director_email));
  IF v_new_director_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first.', p_new_director_email;
  END IF;

  SELECT user_id INTO v_previous_director_id FROM organization_memberships
    WHERE organization_id = p_organization_id AND org_role = 'director' AND status = 'active' LIMIT 1;

  UPDATE organization_memberships SET status = 'revoked', updated_at = now()
    WHERE organization_id = p_organization_id AND org_role = 'director' AND status = 'active';

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_organization_id, v_new_director_id, 'director', 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET org_role = 'director', status = 'invited', updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO organization_ownership_events (organization_id, event_type, actor_user_id, previous_director_id, new_director_id, reason)
  VALUES (p_organization_id, 'director_replaced', auth.uid(), v_previous_director_id, v_new_director_id, p_reason);

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION owner_replace_director(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_replace_director(UUID, TEXT, TEXT) TO authenticated;

-- platform_owner_recover_organization_ownership(): the SEPARATELY
-- controlled recovery procedure the directive requires for a verified
-- ownership dispute, distinct from the ordinary owner_replace_director
-- path above (which only the CURRENT owner can invoke) -- this is the
-- only way organization_owner_user_id itself is ever directly
-- reassigned, Platform-Owner-only, fully audited, never an "arbitrary
-- ownership takeover."
CREATE OR REPLACE FUNCTION platform_owner_recover_organization_ownership(p_organization_id UUID, p_new_owner_email TEXT, p_reason TEXT)
RETURNS organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_previous_owner_id UUID;
  v_new_owner_id UUID;
  v_row organizations;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may recover organization ownership';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required for an ownership recovery action';
  END IF;

  SELECT id INTO v_new_owner_id FROM profiles WHERE lower(email) = lower(btrim(p_new_owner_email));
  IF v_new_owner_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %', p_new_owner_email;
  END IF;

  v_previous_owner_id := get_organization_owner(p_organization_id);

  UPDATE organizations SET organization_owner_user_id = v_new_owner_id, updated_at = now()
  WHERE id = p_organization_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  INSERT INTO organization_ownership_events (organization_id, event_type, actor_user_id, previous_owner_id, new_owner_id, reason)
  VALUES (p_organization_id, 'owner_recovery', auth.uid(), v_previous_owner_id, v_new_owner_id, p_reason);

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_recover_organization_ownership(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_recover_organization_ownership(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Specialist slots (directive §2/§4): a combined, tier-sized capacity
-- shared across medical_professional AND therapist offices, assignable
-- dynamically rather than a hardcoded mix -- distinct from, and layered
-- additively on top of, the existing independent per-role
-- max_medical_professional_seats/max_therapist_seats caps (migration
-- 140), which keep working exactly as before for any organization that
-- sets them. license_tier_code IS NULL (every pre-existing organization)
-- means "legacy package-based org" -- the old organizations.package_type
-- ('therapist' excludes caregiver/medical professional entirely,
-- 'integrated_care' is unrestricted) keeps governing those organizations
-- completely unchanged. Only a NEW, tier-based organization
-- (license_tier_code IS NOT NULL) is additionally subject to the
-- combined specialist-slot cap below.
-- ============================================================================
ALTER TABLE organization_licenses
  ADD COLUMN IF NOT EXISTS license_tier_code TEXT REFERENCES license_tier_catalog(tier_code),
  ADD COLUMN IF NOT EXISTS specialist_slot_count INTEGER NOT NULL DEFAULT 0 CHECK (specialist_slot_count >= 0),
  ADD COLUMN IF NOT EXISTS monthly_billing_anchor_date DATE,
  ADD COLUMN IF NOT EXISTS monthly_billing_timezone TEXT,
  ADD COLUMN IF NOT EXISTS coupon_code_applied TEXT REFERENCES promo_coupon_catalog(code),
  -- One-time snapshot of the LEGACY package_type at the moment this
  -- license activated, for audit/display only -- never read by any
  -- authorization check (package_type on `organizations` itself remains
  -- the one real source of truth for a legacy org's restriction).
  -- Explicit backwards-compatibility mapping, documented here rather
  -- than silently inferred: 'integrated_care' (Full Enterprise,
  -- MMA-FE-...) is the closest legacy equivalent of 'complete' (2
  -- specialist slots, unrestricted office mix); 'therapist' (Therapist
  -- Enterprise, MMA-TE-...) is the closest legacy equivalent of 'plus'
  -- (1 specialist slot, therapist-only) -- this mapping is DISPLAY
  -- GUIDANCE ONLY for the Platform Owner's own reporting; it is never
  -- applied automatically to any existing license, and no existing
  -- license's actual entitlements, price, or number change as a result
  -- of this migration.
  ADD COLUMN IF NOT EXISTS legacy_package_type_at_issuance TEXT;

ALTER TABLE organization_licenses DROP CONSTRAINT organization_licenses_status_check;
ALTER TABLE organization_licenses ADD CONSTRAINT organization_licenses_status_check CHECK (status IN ('proposed', 'active', 'expired', 'suspended', 'canceled'));

COMMENT ON COLUMN organization_licenses.legacy_package_type_at_issuance IS
  'Audit/display snapshot only. Mapping guidance for Platform Owner reporting: integrated_care ~ complete; therapist ~ plus. Never auto-applied to any existing license''s real entitlements.';

-- director_approve_application(): base body is migration 140's
-- (per-role seat caps) -- copied verbatim with ONE new check added
-- (the combined specialist-slot cap), per this engagement's own
-- documented lesson (migration 140's own header) that copying from
-- anything OTHER than the latest prior version silently reverts
-- accumulated fixes. Every pre-existing check (credential verification,
-- self-approval block, legacy package restriction, aggregate seats,
-- per-role caps) is unchanged below.
CREATE OR REPLACE FUNCTION public.director_approve_application(p_application_id UUID) RETURNS professional_applications AS $$
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
  IF v_package = 'therapist' AND v_app.requested_office IN ('caregiver', 'medical_professional') THEN
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
  IF v_app.requested_office IN ('medical_professional', 'therapist') THEN
    SELECT license_tier_code, specialist_slot_count INTO v_tier_code, v_specialist_slot_count
    FROM organization_licenses WHERE organization_id = v_app.target_organization_id;
    IF v_tier_code IS NOT NULL THEN
      SELECT count(*) INTO v_specialist_count FROM organization_memberships
        WHERE organization_id = v_app.target_organization_id AND status = 'active' AND org_role IN ('medical_professional', 'therapist');
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.director_approve_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.director_approve_application(UUID) TO authenticated;

-- ============================================================================
-- License numbering concurrency fix. Migration 123 (closing the
-- missing-contract-gate finding F-04) replaced the original, genuinely
-- atomic enterprise_license_sequences-table approach (migration 111:
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which serializes two
-- concurrent callers on the same (year, prefix) row) with a MAX-scan
-- over organization_licenses.license_number -- a real, latent
-- concurrency bug: two different organizations' FIRST-EVER activation
-- under the same prefix/year, racing, can both compute the SAME next
-- sequence value before either commits (each holds a FOR UPDATE lock on
-- its OWN different license row, not a shared one), and the second to
-- commit fails on the pre-existing license_number UNIQUE constraint
-- (migration 111) with a raw, unhandled unique-violation error instead
-- of succeeding. The UNIQUE constraint already prevented a silent
-- duplicate from ever being stored -- this fix restores the atomic
-- counter so a legitimate concurrent activation actually succeeds
-- instead of erroring, which the directive's own "1,000 simultaneous
-- license issuance" acceptance test requires.
--
-- New tier prefixes, backward-compatible by construction: the legacy
-- MMA-FE-YYYY-NNNNNN (package_type 'integrated_care') and
-- MMA-TE-YYYY-NNNNNN ('therapist') formats are UNCHANGED and continue
-- to be issued for any quote whose package_type drives issuance (the
-- existing manual/negotiated path). A NEW tier-based application
-- (selected_tier_code IS NOT NULL) instead issues MMA-ES- (essential),
-- MMA-PL- (plus), or MMA-CO- (complete) -- same table, same atomic
-- mechanism, same immutable-once-issued guarantee, explicitly still
-- under the existing MMA- namespace per the directive's own
-- instruction to preserve backward compatibility with it.
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
  v_required_type TEXT;
  v_tier license_tier_catalog;
BEGIN
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'No such quote (%)', p_quote_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enterprise_billing_accounts eba WHERE eba.quote_id = p_quote_id AND eba.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No confirmed-paid Enterprise billing account exists for quote % -- license cannot activate without confirmed payment', p_quote_id;
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

  IF v_license.status = 'active' AND v_license.license_number IS NOT NULL THEN
    RETURN v_license;
  END IF;

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

  UPDATE organization_licenses SET
    status = 'active', license_number = v_license_number,
    licensed_seats = v_quote.proposed_licensed_seats, covered_patient_capacity = v_quote.proposed_covered_patient_capacity,
    annual_license_fee = v_quote.annual_license_fee,
    license_tier_code = v_app.selected_tier_code,
    specialist_slot_count = COALESCE(v_tier.specialist_slot_count, specialist_slot_count),
    legacy_package_type_at_issuance = v_quote.package_type,
    activated_by = v_app.applicant_user_id, activated_at = now(), updated_at = now()
  WHERE id = v_license.id
  RETURNING * INTO v_license;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (v_app.id, 'enterprise_license_activated', v_app.applicant_user_id, 'system', v_app.status, v_app.status, 'License activated: ' || v_license_number);

  RETURN v_license;
END;
$$;
REVOKE ALL ON FUNCTION activate_enterprise_license_from_quote(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION activate_enterprise_license_from_quote(UUID) TO service_role;
