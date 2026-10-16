-- 017_daily_care_full_support_plan_identity.sql
-- MYMEMORIA-FUNCTIONAL-REPAIR-006 — trusted paid-plan identity, distinct
-- from tier/status/role/admin privilege.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- Does not duplicate any prior migration object. Builds strictly on top of
-- 013_subscriptions_atomic_lifecycle.sql's `subscriptions`/`promo_codes`
-- shape and 016_free_tier_entitlement_backend_enforcement.sql's
-- `patient_has_paid_entitlement()` (left untouched — see the note near the
-- bottom on why it does not need to become plan-aware). `admin_set_role`,
-- `create_patient_with_caregiver`, and every RLS policy from 012/014/016
-- are untouched.
--
-- ============================================================
-- 1. SCHEMA: subscriptions.plan — backward-compatible, additive
-- ============================================================
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT;

DO $$ BEGIN
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IS NULL OR plan IN ('daily_care', 'full_support'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- `plan` only has meaning for tier='paid_tier' — a free_tier or master row
-- with a non-null plan would be a data-integrity error, not a real state.
DO $$ BEGIN
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_plan_requires_paid_tier
    CHECK (plan IS NULL OR tier = 'paid_tier');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing rows are completely untouched by the ADD COLUMN above (a new
-- nullable column backfills every existing row with NULL, not an error,
-- not a rewrite of any other column) — requirement 4 ("preserve existing
-- subscription records") and requirement 1 ("backward-compatible schema
-- design") are the same fact here: this is purely additive.
--
-- *** REQUIREMENT 8 — THE EXACT MIGRATION DECISION NEEDED, REPORTED HERE,
-- NOT GUESSED ***: every EXISTING `tier='paid_tier'` row now has
-- `plan IS NULL` — there is no way for this migration (or any SQL) to
-- determine, after the fact, which of the two products a given historical
-- subscriber actually purchased; that information was never captured
-- anywhere (not in this table, not in any tracked migration, not in any
-- Stripe metadata this engagement has evidence of). Three real resolution
-- paths exist, and this file deliberately picks none of them:
--   (a) Leave them permanently unclassified, relying on the entitlement
--       fallback below (full historical access preserved indefinitely).
--   (b) Have the owner identify each legacy paid subscriber's real
--       purchased plan from Stripe's own records (the actual source of
--       truth for what they paid for) and run a ONE-TIME, reviewed,
--       targeted UPDATE assigning the correct plan per real customer.
--   (c) Treat ALL legacy paid_tier customers as grandfathered into
--       Full Support permanently as a deliberate, owner-approved business
--       decision (NOT an inference this file makes on its own — requirement
--       6 explicitly forbids automatically classifying them that way).
-- This file implements NONE of (a)/(b)/(c) as a choice — it only ensures
-- (a)'s SAFE, non-regressive default behavior holds automatically (see
-- hasFeatureAccess() in src/types/subscription.ts) until the owner
-- chooses (b) or (c) explicitly.

-- ============================================================
-- 2. promo_codes.plan — promo-granted paid access must name its plan too
-- ============================================================
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS plan TEXT;

DO $$ BEGIN
  ALTER TABLE promo_codes
    ADD CONSTRAINT promo_codes_plan_check
    CHECK (plan IS NULL OR plan IN ('daily_care', 'full_support'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE promo_codes
    ADD CONSTRAINT promo_codes_plan_requires_paid_tier
    CHECK (plan IS NULL OR tier = 'paid_tier');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A NEW promo code that grants tier='paid_tier' must name its plan
-- explicitly — requirement 6 ("promo access follows its separately
-- approved scope... do not assume every promo code grants Full Support").
-- promo_codes is currently seeded with zero rows (confirmed in prior
-- corrective passes), so this has no live effect on any existing code; it
-- only constrains codes added from here on.
DO $$ BEGIN
  ALTER TABLE promo_codes
    ADD CONSTRAINT promo_codes_paid_tier_requires_plan
    CHECK (tier != 'paid_tier' OR plan IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. admin_set_subscription() — the ONLY trusted path to assign a plan
-- ============================================================
-- Requirement 2/3: users cannot assign/upgrade their own plan through any
-- client-controlled write — `subscriptions` already has zero client
-- INSERT/UPDATE/DELETE grant (011/013, unchanged by this file); the only
-- way to set `plan` is this same admin-only RPC every other subscription
-- field already goes through. Requirement 9: a NEW assignment can never
-- leave `plan` ambiguously null for a paid tier — enforced below by
-- requiring p_plan whenever p_tier='paid_tier'. This does NOT retroactively
-- touch any existing row (requirement 4) — it only governs what a FUTURE
-- call to this function may create or change.
--
-- Signature changes (one new parameter) — DROP first. Postgres cannot
-- CREATE OR REPLACE a function into a different signature; the exact bug
-- CORRECTIVE-002 found and fixed for a RETURN TYPE change applies
-- identically to an added PARAMETER.
DROP FUNCTION IF EXISTS public.admin_set_subscription(
  UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE
);

CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_user_id UUID,
  p_tier TEXT,
  p_plan TEXT,
  p_status TEXT,
  p_trial_started_at TIMESTAMP WITH TIME ZONE,
  p_trial_ends_at TIMESTAMP WITH TIME ZONE,
  p_promo_expires_at TIMESTAMP WITH TIME ZONE
) RETURNS subscriptions AS $$
DECLARE
  v_row subscriptions;
  v_trial_started TIMESTAMP WITH TIME ZONE := COALESCE(p_trial_started_at, now());
  v_trial_ends TIMESTAMP WITH TIME ZONE := COALESCE(p_trial_ends_at, v_trial_started);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  IF p_status NOT IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- REPAIR 006 requirement 9: a NEW paid_tier assignment must name its
  -- plan explicitly — never left ambiguous going forward.
  IF p_tier = 'paid_tier' AND p_plan IS NULL THEN
    RAISE EXCEPTION 'A plan (daily_care or full_support) is required when assigning paid_tier';
  END IF;
  IF p_tier != 'paid_tier' AND p_plan IS NOT NULL THEN
    RAISE EXCEPTION 'plan must be null for tier %', p_tier;
  END IF;
  IF p_plan IS NOT NULL AND p_plan NOT IN ('daily_care', 'full_support') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END IF;

  INSERT INTO subscriptions (user_id, tier, plan, status, trial_started_at, trial_ends_at, promo_expires_at, updated_at)
  VALUES (p_user_id, p_tier, p_plan, p_status, v_trial_started, v_trial_ends, p_promo_expires_at, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = EXCLUDED.tier,
    plan              = EXCLUDED.plan,
    status            = EXCLUDED.status,
    trial_started_at  = EXCLUDED.trial_started_at,
    trial_ends_at     = EXCLUDED.trial_ends_at,
    promo_expires_at  = EXCLUDED.promo_expires_at,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;

COMMENT ON FUNCTION public.admin_set_subscription IS 'REPAIR 006: admin-only, atomic upsert — now plan-aware. Requires an explicit daily_care/full_support plan for every NEW paid_tier assignment (never ambiguous going forward); rejects a plan value for any non-paid tier. Existing rows are only touched if this function is called again for that user_id — never automatically.';

-- ============================================================
-- 4. redeem_promo_code() — propagate the promo's OWN configured plan
-- ============================================================
-- Signature unchanged (still just p_code) — CREATE OR REPLACE is safe here,
-- only the body changes.
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code TEXT)
RETURNS subscriptions AS $$
DECLARE
  v_promo promo_codes;
  v_email TEXT;
  v_existing_redemption_count INTEGER;
  v_already_redeemed_by_me INTEGER;
  v_current subscriptions;
  v_row subscriptions;
  v_signup_date TIMESTAMP WITH TIME ZONE;
  v_promo_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT * INTO v_promo FROM promo_codes WHERE code = upper(trim(p_code));
  IF v_promo.code IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired promotional code.';
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RAISE EXCEPTION 'Invalid or expired promotional code.';
  END IF;

  -- REPAIR 006 requirement 6: a promo code granting paid_tier must have
  -- its own plan configured (enforced by promo_codes_paid_tier_requires_plan
  -- above at insert time already) — re-checked here defensively so a
  -- redemption can never silently produce an ambiguous paid_tier row even
  -- if that constraint were ever bypassed by a direct, non-RPC write.
  IF v_promo.tier = 'paid_tier' AND v_promo.plan IS NULL THEN
    RAISE EXCEPTION 'This promotional code is misconfigured (no plan set for a paid tier code). Contact support.';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user.';
  END IF;
  v_email := lower(v_email);

  SELECT count(*) INTO v_already_redeemed_by_me
  FROM promo_redemptions WHERE email = v_email AND promo_code = v_promo.code;
  IF v_already_redeemed_by_me > 0 THEN
    RAISE EXCEPTION 'This promotional code has already been used on this email address.';
  END IF;

  IF v_promo.max_uses IS NOT NULL THEN
    SELECT count(*) INTO v_existing_redemption_count
    FROM promo_redemptions WHERE promo_code = v_promo.code;
    IF v_existing_redemption_count >= v_promo.max_uses THEN
      RAISE EXCEPTION 'Invalid or expired promotional code.';
    END IF;
  END IF;

  SELECT * INTO v_current FROM subscriptions WHERE user_id = auth.uid();
  IF v_current.tier = 'master' THEN
    RAISE EXCEPTION 'Master accounts already have full access.';
  END IF;
  IF v_current.status = 'promo' THEN
    RAISE EXCEPTION 'A promotional code is already active on your account.';
  END IF;

  INSERT INTO promo_redemptions (email, user_id, promo_code)
  VALUES (v_email, auth.uid(), v_promo.code);

  v_signup_date := COALESCE(v_current.trial_started_at, now());
  v_promo_expiry := v_signup_date + (v_promo.days || ' days')::interval;

  INSERT INTO subscriptions (user_id, tier, plan, status, trial_started_at, trial_ends_at, promo_code, promo_expires_at)
  VALUES (auth.uid(), v_promo.tier, v_promo.plan, 'promo', v_signup_date, v_promo_expiry, v_promo.code, v_promo_expiry)
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = v_promo.tier,
    plan              = v_promo.plan,
    status            = 'promo',
    promo_code        = v_promo.code,
    promo_expires_at  = v_promo_expiry,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.redeem_promo_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(TEXT) TO authenticated;

COMMENT ON FUNCTION public.redeem_promo_code IS 'REPAIR 006: now also propagates the redeemed promo code''s OWN configured plan into the subscription row — never assumes Full Support, never invents a plan for a code that doesn''t specify one for a paid tier (refused instead, since the table CHECK already prevents such a code from existing).';

-- ============================================================
-- 5. provision_free_subscription() — unchanged in behavior, noted for
--    completeness
-- ============================================================
-- Not redefined: it already only ever inserts tier='free_tier', and the
-- new `plan` column has no explicit value in that INSERT — it is left
-- NULL by column default, which is exactly correct (free_tier rows must
-- never have a plan; subscriptions_plan_requires_paid_tier enforces this
-- regardless). No signature or body change needed.

-- ============================================================
-- 6. patient_has_paid_entitlement() (016) — deliberately NOT made plan-
--    aware
-- ============================================================
-- The two backend restrictions it gates (memories INSERT,
-- care_partner_checkins INSERT) correspond to memories_unlimited and
-- care_partner_checkin — both DAILY CARE-level features, granted equally
-- to daily_care AND full_support. A tier-only check (paid_tier/master +
-- active-ish status) remains exactly correct for both; narrowing it by
-- plan would incorrectly also block Daily Care subscribers from a feature
-- their own plan includes. If a FUTURE feature needs backend enforcement
-- that is Full-Support-exclusive specifically, that needs a NEW,
-- plan-aware sibling function — not a change to this one. No such
-- backend-enforceable Full-Support-exclusive feature exists today (see
-- the completion report: voice_messages/ai_voices/slideshow_autoplay have
-- no backing table; sms_alerts/mood_email are unimplemented).

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (negative, requirement 9): admin calls
--   `admin_set_subscription(<user>, 'paid_tier', NULL, 'active', ...)`.
--   Expected: `RAISE EXCEPTION 'A plan ... is required...'`.
-- T2 (negative): admin calls
--   `admin_set_subscription(<user>, 'free_tier', 'daily_care', 'active', ...)`.
--   Expected: `RAISE EXCEPTION 'plan must be null for tier free_tier'`.
-- T3 (positive, requirement 3): admin calls
--   `admin_set_subscription(<user>, 'paid_tier', 'daily_care', 'active', ...)`.
--   Expected: succeeds; subscriptions.plan = 'daily_care' for that user.
-- T4 (negative, requirement 2 — self-upgrade): a non-admin authenticated
--   user calls admin_set_subscription(...) for their OWN user_id (or
--   attempts a direct `update subscriptions set plan='full_support' where
--   user_id=auth.uid()`). Expected: both denied — the function's own
--   admin-role check for the RPC; column/table-level REVOKE (011/013,
--   unchanged) for the direct write.
-- T5 (positive, requirement 4 — legacy preserved): snapshot every existing
--   subscriptions row's (tier, status, trial_ends_at, ...) before applying
--   this migration; re-run after. Expected: identical, plus a new `plan`
--   column that is NULL on every pre-existing row — no other value changed
--   anywhere.
-- T6 (positive, requirement 7 — no revocation for legacy rows): a user
--   with a pre-existing paid_tier/active/plan=NULL row (simulated by
--   inserting such a row directly, since this migration never produces
--   one itself) still passes `hasFeatureAccess('paid_tier', 'voice_messages', null)`
--   (application-level — see entitlementMatrix.test.ts) = true.
-- T7 (positive, requirement 6 — promo scope): seed a promo_codes row with
--   tier='paid_tier', plan='daily_care'; redeem it. Expected: the
--   resulting subscription has plan='daily_care', NOT 'full_support'.
-- T8 (negative, requirement 6 continued): attempt to seed a promo_codes
--   row with tier='paid_tier' and plan=NULL directly.
--   Expected: CHECK constraint violation (promo_codes_paid_tier_requires_plan).
-- T9 (regression — existing rows preserved): row-count and id-set snapshot
--   for subscriptions and promo_codes, before/after. Expected: identical —
--   this file adds columns/constraints and redefines two functions; it
--   touches no row.
