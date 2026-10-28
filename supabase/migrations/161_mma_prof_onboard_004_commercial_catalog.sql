-- MMA-PROF-ONBOARD-004 P0-2 Phase 1 -- the commercial catalog: three
-- license tiers, two promotional coupons, and the server-authoritative
-- monthly active-patient pricing formula. This migration is
-- deliberately self-contained (no changes to professional_applications,
-- organizations, or organization_licenses yet -- those follow in later
-- migrations) so the pricing/coupon math can be built and tested in
-- complete isolation before anything in the application/licensing
-- lifecycle depends on it.
--
-- Money is always computed here in integer CENTS, server-side, never
-- client-supplied and never floating point -- every coefficient in the
-- monthly formula ($8, $5, $4, $2.50 per patient) is an exact integer
-- number of cents (800, 500, 400, 250), so the whole calculation stays
-- exact integer arithmetic throughout.
--
-- Reuses the existing RPC-only write pattern already established
-- throughout this schema (sales_quotes, professional_applications,
-- etc.): these two catalog tables have NO client INSERT/UPDATE/DELETE
-- policy at all. Every write goes through a SECURITY DEFINER,
-- Platform-Owner-gated RPC below.

-- ============================================================================
-- license_tier_catalog -- the three standard tiers. One row per tier
-- code, updated in place when the Platform Owner changes a price (this
-- is the CURRENT live price only); a locked-in historical charge is
-- always captured as an explicit cents snapshot on the record that
-- actually charged it (enterprise_billing_accounts.unit_amount_cents,
-- already established in migration 110) -- never by re-reading this
-- table later, so a future price change here can never retroactively
-- alter what an already-issued invoice says. license_tier_catalog_history
-- additionally preserves every past version for audit/display purposes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS license_tier_catalog (
  tier_code              TEXT PRIMARY KEY CHECK (tier_code IN ('essential', 'plus', 'complete')),
  display_name           TEXT NOT NULL,
  annual_fee_cents       INTEGER NOT NULL CHECK (annual_fee_cents >= 0),
  specialist_slot_count  INTEGER NOT NULL CHECK (specialist_slot_count >= 0),
  version                INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_published           BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by             UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS license_tier_catalog_history (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_code              TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  annual_fee_cents       INTEGER NOT NULL,
  specialist_slot_count  INTEGER NOT NULL,
  version                INTEGER NOT NULL,
  superseded_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  superseded_by          UUID REFERENCES profiles(id)
);

ALTER TABLE license_tier_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_tier_catalog_history ENABLE ROW LEVEL SECURITY;

-- Published tiers and prices are public information (the whole point of
-- "visit the website, review pricing, select a plan" is that this is
-- readable by a visitor who is not yet signed in at all) -- explicitly
-- `TO anon, authenticated`, read-only, and only ever exposes published
-- rows.
CREATE POLICY "Published license tiers are publicly readable" ON license_tier_catalog
  FOR SELECT TO anon, authenticated USING (is_published = true);
CREATE POLICY "Platform Owner can view every license tier" ON license_tier_catalog
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "Platform Owner can view license tier history" ON license_tier_catalog_history
  FOR SELECT TO authenticated USING (is_platform_owner());

REVOKE EXECUTE ON FUNCTION is_platform_owner() FROM PUBLIC, anon;

-- Seed the three owner-approved tiers exactly as specified. ON CONFLICT
-- DO NOTHING -- this seed never silently overwrites a price the
-- Platform Owner has already changed via platform_owner_set_license_tier_price()
-- on a re-run of this migration (idempotent).
INSERT INTO license_tier_catalog (tier_code, display_name, annual_fee_cents, specialist_slot_count)
VALUES
  ('essential', 'Essential', 39900, 0),
  ('plus',      'Plus',      59900, 1),
  ('complete',  'Complete',  79900, 2)
ON CONFLICT (tier_code) DO NOTHING;

CREATE OR REPLACE FUNCTION platform_owner_set_license_tier_price(
  p_tier_code TEXT, p_display_name TEXT, p_annual_fee_cents INTEGER, p_specialist_slot_count INTEGER
) RETURNS license_tier_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old license_tier_catalog; v_new license_tier_catalog;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may change a license tier''s price or capacity';
  END IF;
  IF p_annual_fee_cents IS NULL OR p_annual_fee_cents < 0 THEN
    RAISE EXCEPTION 'Annual fee must be a non-negative number of cents';
  END IF;
  IF p_specialist_slot_count IS NULL OR p_specialist_slot_count < 0 THEN
    RAISE EXCEPTION 'Specialist slot count must be a non-negative integer';
  END IF;

  SELECT * INTO v_old FROM license_tier_catalog WHERE tier_code = p_tier_code FOR UPDATE;
  IF v_old.tier_code IS NULL THEN
    RAISE EXCEPTION 'No such license tier: %', p_tier_code;
  END IF;

  INSERT INTO license_tier_catalog_history (tier_code, display_name, annual_fee_cents, specialist_slot_count, version, superseded_by)
  VALUES (v_old.tier_code, v_old.display_name, v_old.annual_fee_cents, v_old.specialist_slot_count, v_old.version, auth.uid());

  UPDATE license_tier_catalog SET
    display_name = p_display_name, annual_fee_cents = p_annual_fee_cents, specialist_slot_count = p_specialist_slot_count,
    version = v_old.version + 1, updated_at = now(), updated_by = auth.uid()
  WHERE tier_code = p_tier_code
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_set_license_tier_price(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_set_license_tier_price(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_set_license_tier_published(p_tier_code TEXT, p_is_published BOOLEAN)
RETURNS license_tier_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row license_tier_catalog;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may publish or unpublish a license tier';
  END IF;
  UPDATE license_tier_catalog SET is_published = p_is_published, updated_at = now(), updated_by = auth.uid()
  WHERE tier_code = p_tier_code RETURNING * INTO v_row;
  IF v_row.tier_code IS NULL THEN RAISE EXCEPTION 'No such license tier: %', p_tier_code; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_set_license_tier_published(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_set_license_tier_published(TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- promo_coupon_catalog / enterprise_coupon_redemptions -- the two
-- approved WELCOME coupons, plus the owner's required administration
-- surface (pause/expire/revoke/limit) and concurrency-safe, one-per-
-- application redemption integrity.
--
-- Redemption is keyed to the APPLICATION, not an organization -- at the
-- moment Bilal enters a coupon code (Step 4, before checkout), no
-- organization exists yet; one is only created at approval. Since
-- exactly one organization is ever created per approved Director
-- application, "one coupon per application" and "one coupon per
-- organization" are the same guarantee by construction.
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_coupon_catalog (
  code                    TEXT PRIMARY KEY CHECK (code = upper(btrim(code)) AND char_length(code) BETWEEN 3 AND 40),
  discount_kind           TEXT NOT NULL CHECK (discount_kind IN ('full_waiver', 'half_off_minus_fifty_cents')),
  applies_to              TEXT NOT NULL DEFAULT 'first_annual_license_only' CHECK (applies_to = 'first_annual_license_only'),
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'revoked')),
  max_redemptions_total   INTEGER CHECK (max_redemptions_total IS NULL OR max_redemptions_total > 0),
  redemptions_used        INTEGER NOT NULL DEFAULT 0 CHECK (redemptions_used >= 0),
  expires_at              TIMESTAMP WITH TIME ZONE,
  notes                   TEXT,
  -- Nullable: the two WELCOME coupons below are seeded by this
  -- migration itself, at deploy time, before any Platform Owner
  -- profile necessarily exists yet -- NULL means "system-seeded,"
  -- never a fabricated actor id. Every coupon an owner creates
  -- afterward via platform_owner_create_coupon() always records a
  -- real auth.uid().
  created_by              UUID REFERENCES profiles(id),
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES profiles(id),
  CONSTRAINT coupon_redemptions_within_total_limit CHECK (max_redemptions_total IS NULL OR redemptions_used <= max_redemptions_total)
);

CREATE TABLE IF NOT EXISTS enterprise_coupon_redemptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code          TEXT NOT NULL REFERENCES promo_coupon_catalog(code),
  application_id       UUID NOT NULL UNIQUE,
  base_cents           INTEGER NOT NULL CHECK (base_cents >= 0),
  discount_cents       INTEGER NOT NULL CHECK (discount_cents >= 0),
  final_cents          INTEGER NOT NULL CHECK (final_cents >= 0),
  redeemed_by          UUID NOT NULL REFERENCES profiles(id),
  redeemed_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT coupon_redemption_math_consistent CHECK (base_cents = discount_cents + final_cents)
);

ALTER TABLE promo_coupon_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Deliberately NOT publicly readable (the directive: "Do not publicly
-- display, automatically select, recommend or prepopulate either
-- approved welcome coupon" -- a listing endpoint would let a client
-- enumerate every valid code without ever being told one). A code is
-- only ever validated one at a time, by exact value, through the RPC
-- below -- never browsed.
CREATE POLICY "Platform Owner can view the coupon catalog" ON promo_coupon_catalog
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "Platform Owner can view all coupon redemptions" ON enterprise_coupon_redemptions
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "An applicant can view their own coupon redemption" ON enterprise_coupon_redemptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM professional_applications pa WHERE pa.id = enterprise_coupon_redemptions.application_id AND pa.applicant_user_id = auth.uid())
  );

INSERT INTO promo_coupon_catalog (code, discount_kind, created_by)
VALUES ('WELCOME100', 'full_waiver', NULL)
ON CONFLICT (code) DO NOTHING;
INSERT INTO promo_coupon_catalog (code, discount_kind, created_by)
VALUES ('WELCOME50', 'half_off_minus_fifty_cents', NULL)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION platform_owner_create_coupon(
  p_code TEXT, p_discount_kind TEXT, p_max_redemptions_total INTEGER, p_expires_at TIMESTAMP WITH TIME ZONE, p_notes TEXT
) RETURNS promo_coupon_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row promo_coupon_catalog;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may create a coupon'; END IF;
  INSERT INTO promo_coupon_catalog (code, discount_kind, max_redemptions_total, expires_at, notes, created_by)
  VALUES (upper(btrim(p_code)), p_discount_kind, p_max_redemptions_total, p_expires_at, p_notes, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_create_coupon(TEXT, TEXT, INTEGER, TIMESTAMP WITH TIME ZONE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_create_coupon(TEXT, TEXT, INTEGER, TIMESTAMP WITH TIME ZONE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_set_coupon_status(p_code TEXT, p_status TEXT) RETURNS promo_coupon_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row promo_coupon_catalog;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may change a coupon''s status'; END IF;
  IF p_status NOT IN ('active', 'paused', 'expired', 'revoked') THEN RAISE EXCEPTION 'Invalid coupon status: %', p_status; END IF;
  UPDATE promo_coupon_catalog SET status = p_status, updated_at = now(), updated_by = auth.uid()
  WHERE code = upper(btrim(p_code)) RETURNING * INTO v_row;
  IF v_row.code IS NULL THEN RAISE EXCEPTION 'No such coupon: %', p_code; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_set_coupon_status(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_set_coupon_status(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_set_coupon_limit(p_code TEXT, p_max_redemptions_total INTEGER) RETURNS promo_coupon_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row promo_coupon_catalog;
BEGIN
  IF NOT is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may change a coupon''s redemption limit'; END IF;
  UPDATE promo_coupon_catalog SET max_redemptions_total = p_max_redemptions_total, updated_at = now(), updated_by = auth.uid()
  WHERE code = upper(btrim(p_code)) RETURNING * INTO v_row;
  IF v_row.code IS NULL THEN RAISE EXCEPTION 'No such coupon: %', p_code; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_set_coupon_limit(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_set_coupon_limit(TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- calculate_annual_license_charge(): pure, read-only pricing math.
-- Deliberately has NO side effect on promo_coupon_catalog.redemptions_used
-- -- this is the function the frontend calls, as many times as the
-- customer edits the form, to show a live price preview. The ONLY
-- function that actually consumes a redemption is
-- redeem_coupon_for_application() below, called exactly once, at the
-- moment checkout is initiated.
--
-- WELCOME50 math, exactly as specified: final = round(base / 2) - 50
-- cents. Verified against the owner's own worked examples: Essential
-- 39900 -> 19950 -> 19900 ($199.00); Plus 59900 -> 29950 -> 29900
-- ($299.00); Complete 79900 -> 39950 -> 39900 ($399.00).
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_annual_license_charge(p_tier_code TEXT, p_coupon_code TEXT DEFAULT NULL)
RETURNS TABLE(base_cents INTEGER, discount_cents INTEGER, final_cents INTEGER, coupon_code TEXT, coupon_rejected_reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tier license_tier_catalog;
  v_coupon promo_coupon_catalog;
  v_base INTEGER;
  v_final INTEGER;
  v_code TEXT := NULLIF(upper(btrim(coalesce(p_coupon_code, ''))), '');
BEGIN
  SELECT * INTO v_tier FROM license_tier_catalog WHERE tier_code = p_tier_code AND is_published = true;
  IF v_tier.tier_code IS NULL THEN
    RAISE EXCEPTION 'Unknown or unpublished license tier: %', p_tier_code;
  END IF;
  v_base := v_tier.annual_fee_cents;

  IF v_code IS NULL THEN
    RETURN QUERY SELECT v_base, 0, v_base, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_coupon FROM promo_coupon_catalog WHERE code = v_code;
  IF v_coupon.code IS NULL THEN
    RETURN QUERY SELECT v_base, 0, v_base, NULL::TEXT, 'This promotional code is not valid.';
    RETURN;
  END IF;
  IF v_coupon.status <> 'active' THEN
    RETURN QUERY SELECT v_base, 0, v_base, NULL::TEXT, 'This promotional code is no longer active.';
    RETURN;
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN
    RETURN QUERY SELECT v_base, 0, v_base, NULL::TEXT, 'This promotional code has expired.';
    RETURN;
  END IF;
  IF v_coupon.max_redemptions_total IS NOT NULL AND v_coupon.redemptions_used >= v_coupon.max_redemptions_total THEN
    RETURN QUERY SELECT v_base, 0, v_base, NULL::TEXT, 'This promotional code has reached its redemption limit.';
    RETURN;
  END IF;

  v_final := CASE v_coupon.discount_kind
    WHEN 'full_waiver' THEN 0
    WHEN 'half_off_minus_fifty_cents' THEN GREATEST(ROUND(v_base / 2.0)::INTEGER - 50, 0)
    ELSE v_base
  END;

  RETURN QUERY SELECT v_base, (v_base - v_final), v_final, v_coupon.code, NULL::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION calculate_annual_license_charge(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calculate_annual_license_charge(TEXT, TEXT) TO authenticated, anon;

-- redeem_coupon_for_application(): the ONLY function that actually
-- consumes a redemption slot. Row-locks the coupon (FOR UPDATE) so two
-- concurrent redemptions racing against the last remaining slot cannot
-- both succeed; the UNIQUE constraint on enterprise_coupon_redemptions.
-- application_id is a second, independent guard against the same
-- application redeeming twice (e.g. a retried client request).
CREATE OR REPLACE FUNCTION redeem_coupon_for_application(p_application_id UUID, p_tier_code TEXT, p_coupon_code TEXT)
RETURNS enterprise_coupon_redemptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_tier license_tier_catalog;
  v_coupon promo_coupon_catalog;
  v_code TEXT := upper(btrim(coalesce(p_coupon_code, '')));
  v_base INTEGER;
  v_final INTEGER;
  v_row enterprise_coupon_redemptions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_code = '' THEN RAISE EXCEPTION 'A promotional code is required'; END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id AND applicant_user_id = auth.uid();
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'No matching application found for this account';
  END IF;

  -- Idempotent, not an error: redeeming the same already-applied coupon
  -- again (e.g. a retried request) returns the existing redemption
  -- rather than consuming a second slot or raising.
  SELECT * INTO v_row FROM enterprise_coupon_redemptions WHERE application_id = p_application_id;
  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  SELECT * INTO v_tier FROM license_tier_catalog WHERE tier_code = p_tier_code AND is_published = true;
  IF v_tier.tier_code IS NULL THEN RAISE EXCEPTION 'Unknown or unpublished license tier: %', p_tier_code; END IF;
  v_base := v_tier.annual_fee_cents;

  SELECT * INTO v_coupon FROM promo_coupon_catalog WHERE code = v_code FOR UPDATE;
  IF v_coupon.code IS NULL THEN RAISE EXCEPTION 'This promotional code is not valid.'; END IF;
  IF v_coupon.status <> 'active' THEN RAISE EXCEPTION 'This promotional code is no longer active.'; END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN RAISE EXCEPTION 'This promotional code has expired.'; END IF;
  IF v_coupon.max_redemptions_total IS NOT NULL AND v_coupon.redemptions_used >= v_coupon.max_redemptions_total THEN
    RAISE EXCEPTION 'This promotional code has reached its redemption limit.';
  END IF;

  v_final := CASE v_coupon.discount_kind
    WHEN 'full_waiver' THEN 0
    WHEN 'half_off_minus_fifty_cents' THEN GREATEST(ROUND(v_base / 2.0)::INTEGER - 50, 0)
    ELSE v_base
  END;

  UPDATE promo_coupon_catalog SET redemptions_used = redemptions_used + 1, updated_at = now() WHERE code = v_coupon.code;

  INSERT INTO enterprise_coupon_redemptions (coupon_code, application_id, base_cents, discount_cents, final_cents, redeemed_by)
  VALUES (v_coupon.code, p_application_id, v_base, v_base - v_final, v_final, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION redeem_coupon_for_application(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_coupon_for_application(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- calculate_monthly_patient_fee_cents(): the server-authoritative
-- continuous monthly active-patient pricing schedule. Pure integer-cent
-- arithmetic throughout -- every per-patient coefficient ($8, $5, $4,
-- $2.50) is an exact whole number of cents (800, 500, 400, 250), so no
-- step in this computation ever touches a float.
--
-- 1,001+ returns NULL -- a sentinel meaning "requires a custom
-- Enterprise quote," deliberately never an automatic, ambiguous charge,
-- exactly as directed. Callers (the frontend price preview, the
-- monthly billing job) must treat NULL as "do not auto-charge," not as
-- zero or an error.
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_monthly_patient_fee_cents(p_active_patients INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_active_patients IS NULL OR p_active_patients < 0 THEN
    RAISE EXCEPTION 'Active patient count must be a non-negative integer';
  END IF;

  IF p_active_patients > 1000 THEN
    RETURN NULL;
  ELSIF p_active_patients <= 15 THEN
    RETURN 25000;
  ELSIF p_active_patients <= 50 THEN
    RETURN 25000 + 800 * (p_active_patients - 15);
  ELSIF p_active_patients <= 250 THEN
    RETURN 53000 + 500 * (p_active_patients - 50);
  ELSIF p_active_patients <= 500 THEN
    RETURN 153000 + 400 * (p_active_patients - 250);
  ELSE
    RETURN 253000 + 250 * (p_active_patients - 500);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION calculate_monthly_patient_fee_cents(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calculate_monthly_patient_fee_cents(INTEGER) TO authenticated, anon;
