-- 032_registration_capacity_and_residential_trial.sql
-- OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR — Phase A item 7 (server-side
-- registration capacity) and Phase B (14-day residential trial granting
-- Daily Care only, replacing the permanent Free Tier for NEW customers).
--
-- STAGING-TARGETED. Not yet applied to production.
--
-- DOES NOT TOUCH: the Temporary User / Companion program mechanism
-- (migrations 018/019) — those remain tier='free_tier' programs with their
-- own 72-hour/30-day trusted expiry via is_my_program_active(), completely
-- separate from the new 'trial' status this file adds. DOES NOT TOUCH any
-- EXISTING subscriptions row — provision_free_subscription() below is
-- idempotent and only ever INSERTs for a caller with NO existing row
-- (requirement: "Keep existing Free Tier records and data intact").

-- ============================================================================
-- §1 — Phase A item 7: server-side registration capacity (mechanism only —
-- no commercial number is invented here; NULL = unlimited until the owner
-- sets a real value via the Admin Center / a future admin RPC).
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_patient_capacity INTEGER;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_max_patient_capacity_check
    CHECK (max_patient_capacity IS NULL OR max_patient_capacity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN profiles.max_patient_capacity IS 'OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR item 7: caps how many ACTIVE patients a caregiver may register (enforced in caregiver_initiate_patient_registration). NULL = unlimited (the default — no commercial limit has been set by the owner yet). Distinct from, and never conflated with, Auth user counts or email-delivery rate limits.';

-- caregiver_initiate_patient_registration() — same signature as migration
-- 030 (CREATE OR REPLACE is safe; no parameter list change), with a
-- capacity check inserted before the registration row is created.
CREATE OR REPLACE FUNCTION public.caregiver_initiate_patient_registration(
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_preferred_name TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_diagnosis_date DATE DEFAULT NULL,
  p_dementia_stage TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_emergency_contact_relationship TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_emergency_contact_email TEXT DEFAULT NULL,
  p_relationship_type TEXT DEFAULT 'primary'
) RETURNS pending_caregiver_registrations AS $$
DECLARE
  v_row pending_caregiver_registrations;
  v_capacity INTEGER;
  v_active_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'caregiver') THEN
    RAISE EXCEPTION 'Only an authenticated caregiver account may initiate patient registration';
  END IF;
  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Patient first and last name are required';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Patient email is required';
  END IF;
  IF p_relationship_type NOT IN ('daughter','son','spouse','professional','friend','primary','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- item 7: capacity is checked against the caller's OWN max_patient_capacity
  -- (never a client-supplied value) and the caller's CURRENT linked-patient
  -- count (caregiver_patients — the trusted relationship table, not Auth
  -- user counts, not email rate limits). NULL capacity = unlimited.
  SELECT p.max_patient_capacity INTO v_capacity FROM profiles p WHERE p.id = auth.uid();
  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_active_count FROM caregiver_patients WHERE caregiver_id = auth.uid();
    IF v_active_count >= v_capacity THEN
      RAISE EXCEPTION 'Patient registration capacity reached (% of % used). Contact support to increase capacity.', v_active_count, v_capacity;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM profiles WHERE lower(email) = lower(p_email) AND provisioning_status = 'complete'
  ) THEN
    RAISE EXCEPTION 'This email address is already registered to an existing account';
  END IF;

  INSERT INTO pending_caregiver_registrations (
    caregiver_id, patient_first_name, patient_last_name, patient_email,
    patient_preferred_name, patient_date_of_birth, patient_diagnosis_date, patient_dementia_stage,
    patient_location, patient_address, emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email, relationship_type
  ) VALUES (
    auth.uid(), btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)),
    p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage,
    p_location, p_address, p_emergency_contact_name, p_emergency_contact_relationship,
    p_emergency_contact_phone, p_emergency_contact_email, p_relationship_type
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.caregiver_initiate_patient_registration(
  TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_initiate_patient_registration(
  TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ============================================================================
-- §2 — Phase B: 14-day residential trial (Daily Care entitlements only),
-- replacing the permanent Free Tier for NEW customers going forward.
-- ============================================================================

-- 'trial' joins the six existing approved statuses — this is the exact
-- owner decision migration 013 itself flagged as deferred ("the six-value
-- list is the actual intended final state... or 'trialing' ... should be
-- added back ... which is also an owner decision"). Now approved.
DO $$ BEGIN
  ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo', 'trial'));
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'subscriptions_status_check NOT applied — existing rows contain a status value outside the seven approved values. Existing rows are preserved untouched; reconcile before re-running.';
END $$;

-- 'trial' status is reserved for exactly the residential Daily Care trial
-- shape — mirrors the existing program/free_tier coupling constraint
-- (migration 018) for the same defense-in-depth reason: a 'trial' row that
-- somehow carried a different tier/plan would silently grant the wrong
-- entitlement set via hasFeatureAccess()'s ordinary (tier, plan) read.
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_trial_requires_daily_care
    CHECK (status != 'trial' OR (tier = 'paid_tier' AND plan = 'daily_care'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── trial_history: prevents the SAME email from receiving a second trial
-- even if its original account is later deleted (requirement: "Prevent
-- repeated free-trial cycling using new emails or accounts... handle
-- eligible customer identities carefully"). This closes the
-- delete-and-re-signup-with-the-same-email loop specifically. It does NOT
-- and cannot prevent a genuinely different email address from starting a
-- new trial — no stronger identity-proofing (payment method, phone
-- verification, etc.) exists anywhere in this codebase to build that on;
-- flagged here rather than silently assumed solved.
CREATE TABLE IF NOT EXISTS trial_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL UNIQUE,
  user_id         UUID,
  issued_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE trial_history ENABLE ROW LEVEL SECURITY;
-- Deliberately ZERO client-facing policies — read/written only by
-- provision_free_subscription() below (SECURITY DEFINER), same
-- fail-closed-by-default pattern as pending_caregiver_registrations.

-- ── is_my_trial_active(): the ONLY trusted trial-expiry check — mirrors
-- is_my_program_active()'s exact shape and reasoning (now()-evaluated
-- inside Postgres, immune to a manipulated client clock).
CREATE OR REPLACE FUNCTION public.is_my_trial_active()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
      AND status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND now() <= trial_ends_at
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_my_trial_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_trial_active() TO authenticated;

COMMENT ON FUNCTION public.is_my_trial_active IS 'OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: the ONLY trusted residential-trial eligibility check — src/types/subscription.ts isSubscriptionActive() calls this, never a client Date() comparison, so an expired trial cannot retain Daily Care access.';

-- ── provision_free_subscription(): redefined to grant the new 14-day
-- Daily Care trial for a genuinely NEW caller (no existing subscriptions
-- row and no prior trial_history for their email) — falls back to the
-- original free_tier/active shape for a caller who already used a trial
-- under this email before. Same 0-argument signature; idempotent; NEVER
-- touches an existing row, exactly as before.
CREATE OR REPLACE FUNCTION public.provision_free_subscription()
RETURNS subscriptions AS $$
DECLARE
  v_row subscriptions;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_email TEXT;
  v_already_trialed BOOLEAN := false;
BEGIN
  SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
  IF v_row.id IS NOT NULL THEN
    RETURN v_row; -- idempotent — never touches an existing row
  END IF;

  SELECT lower(btrim(email)) INTO v_email FROM profiles WHERE id = auth.uid();

  IF v_email IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM trial_history WHERE email_normalized = v_email) INTO v_already_trialed;
  END IF;

  IF v_email IS NOT NULL AND NOT v_already_trialed THEN
    INSERT INTO subscriptions (user_id, tier, plan, status, trial_started_at, trial_ends_at)
    VALUES (auth.uid(), 'paid_tier', 'daily_care', 'trial', v_now, v_now + INTERVAL '14 days')
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NOT NULL THEN
      INSERT INTO trial_history (email_normalized, user_id, issued_at)
      VALUES (v_email, auth.uid(), v_now)
      ON CONFLICT (email_normalized) DO NOTHING;
      RETURN v_row;
    END IF;
    -- Lost a race (or an unexpected conflict) — fall through to the
    -- free_tier fallback path below only if still no row exists.
    SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
    IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;
  END IF;

  -- Fallback: email unknown, or this email already received a trial before
  -- (requirement 7 — no repeated trial cycling). Preserves the original,
  -- safe free_tier shape rather than leaving the caller with no
  -- subscription row at all.
  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at)
  VALUES (auth.uid(), 'free_tier', 'active', v_now, v_now)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.provision_free_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_free_subscription() TO authenticated;

COMMENT ON FUNCTION public.provision_free_subscription IS 'OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: the only path for a signed-in user to provision their first subscription row. NEW callers get a 14-day Daily Care trial (status=trial); a caller whose email already received one before, or with no resolvable email yet, falls back to the original free_tier/active shape. Still idempotent; never touches an existing row of any tier/status.';

-- admin_set_subscription(): add 'trial' to its own status validation so an
-- admin can also manually grant/extend/correct a trial via the Admin
-- Center — same signature as migration 018, CREATE OR REPLACE only.
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_user_id UUID,
  p_tier TEXT,
  p_plan TEXT,
  p_program TEXT,
  p_status TEXT,
  p_trial_started_at TIMESTAMP WITH TIME ZONE,
  p_trial_ends_at TIMESTAMP WITH TIME ZONE,
  p_promo_expires_at TIMESTAMP WITH TIME ZONE
) RETURNS subscriptions AS $$
DECLARE
  v_row subscriptions;
  v_trial_started TIMESTAMP WITH TIME ZONE := COALESCE(p_trial_started_at, now());
  v_trial_ends TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  IF p_status NOT IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo', 'trial') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  IF p_tier = 'paid_tier' AND p_plan IS NULL THEN
    RAISE EXCEPTION 'A plan (daily_care or full_support) is required when assigning paid_tier';
  END IF;
  IF p_tier != 'paid_tier' AND p_plan IS NOT NULL THEN
    RAISE EXCEPTION 'plan must be null for tier %', p_tier;
  END IF;
  IF p_plan IS NOT NULL AND p_plan NOT IN ('daily_care', 'full_support') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END IF;

  IF p_status = 'trial' AND (p_tier != 'paid_tier' OR p_plan != 'daily_care') THEN
    RAISE EXCEPTION 'status=trial requires tier=paid_tier and plan=daily_care, got tier=% plan=%', p_tier, p_plan;
  END IF;

  IF p_program IS NOT NULL AND p_tier != 'free_tier' THEN
    RAISE EXCEPTION 'program requires tier=free_tier, got %', p_tier;
  END IF;
  IF p_program IS NOT NULL AND p_program NOT IN ('temp_user', 'companion') THEN
    RAISE EXCEPTION 'Invalid program: %', p_program;
  END IF;

  IF p_program = 'temp_user' THEN
    v_trial_ends := v_trial_started + INTERVAL '72 hours';
  ELSIF p_program = 'companion' THEN
    v_trial_ends := v_trial_started + INTERVAL '30 days';
  ELSIF p_status = 'trial' THEN
    v_trial_ends := COALESCE(p_trial_ends_at, v_trial_started + INTERVAL '14 days');
  ELSE
    v_trial_ends := COALESCE(p_trial_ends_at, v_trial_started);
  END IF;

  INSERT INTO subscriptions (user_id, tier, plan, program, status, trial_started_at, trial_ends_at, promo_expires_at, updated_at)
  VALUES (p_user_id, p_tier, p_plan, p_program, p_status, v_trial_started, v_trial_ends, p_promo_expires_at, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = EXCLUDED.tier,
    plan              = EXCLUDED.plan,
    program           = EXCLUDED.program,
    status            = EXCLUDED.status,
    trial_started_at  = EXCLUDED.trial_started_at,
    trial_ends_at     = EXCLUDED.trial_ends_at,
    promo_expires_at  = EXCLUDED.promo_expires_at,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_subscription(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE
) TO authenticated;

-- ============================================================================
-- STAGING-ONLY AUTHORIZATION TESTS EXECUTED (real isolated staging project,
-- synthetic identities, cleaned up afterward) — recorded here for the
-- owner's review:
-- ============================================================================
-- T1 (positive): a brand-new caller with a resolvable profiles.email and no
--     existing subscriptions row, calling provision_free_subscription(),
--     receives tier=paid_tier/plan=daily_care/status=trial/trial_ends_at =
--     trial_started_at + 14 days, and a trial_history row is created for
--     their email.
-- T2 (negative, requirement 7): a second distinct account sharing the SAME
--     normalized email in trial_history receives the free_tier/active
--     fallback instead of a second trial.
-- T3 (positive): is_my_trial_active() returns true while now() <=
--     trial_ends_at, and would return false once expired (verified by
--     directly inserting an already-expired trial_ends_at and re-checking).
-- T4 (regression): an existing subscriptions row (free_tier or otherwise)
--     calling provision_free_subscription() again is returned unchanged —
--     no trial is ever granted to an existing account.
-- T5 (positive, capacity): a caregiver with max_patient_capacity=1 and one
--     existing caregiver_patients link is REJECTED by
--     caregiver_initiate_patient_registration() on a second registration
--     attempt; a caregiver with max_patient_capacity=NULL (the default) is
--     never rejected regardless of count.
-- T6 (regression): Temporary User / Companion program rows and
--     is_my_program_active() are completely untouched by this file.
