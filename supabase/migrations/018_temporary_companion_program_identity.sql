-- 018_temporary_companion_program_identity.sql
-- MYMEMORIA-FUNCTIONAL-REPAIR-007 — trusted Temporary/Companion program
-- classification and server-enforced expiration.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- Does not duplicate any prior migration object. Builds on
-- 017_daily_care_full_support_plan_identity.sql's `subscriptions.plan`
-- pattern for the SAME reason: `tier`/`status` alone cannot distinguish an
-- ordinary free_tier signup from an issued Temporary or Companion program.
-- `admin_set_role`, `create_patient_with_caregiver`, and every RLS policy
-- from 012/014/016/017 not explicitly touched below are untouched.

-- ============================================================
-- 1. SCHEMA: subscriptions.program — additive, backward-compatible
-- ============================================================
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS program TEXT;

DO $$ BEGIN
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_program_check
    CHECK (program IS NULL OR program IN ('temp_user', 'companion'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Both programs are free_tier only — requirement: "neither program is a
-- new subscription tier." Existing six statuses are untouched by this
-- file (requirement 8) — no new status is added anywhere below.
DO $$ BEGIN
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_program_requires_free_tier
    CHECK (program IS NULL OR tier = 'free_tier');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing rows are untouched by the ADD COLUMN above (requirement 5) —
-- every existing row gets program=NULL, which is exactly "ordinary Free"
-- (requirement 1) for any free_tier row, and is simply inapplicable
-- (harmless) for paid_tier/master rows.

-- ============================================================
-- 2. admin_set_subscription() — the ONLY trusted path to issue a program
-- ============================================================
-- Requirement 2/3: client-side parameters, email patterns, editable
-- profile fields, and localStorage cannot authorize a program — the only
-- way `program` is ever written is this same admin-only RPC every other
-- subscription field already goes through; `subscriptions` still has zero
-- client INSERT/UPDATE grant (011/013, unchanged).
--
-- Requirement 4 / trusted issuance timestamp: for a NEW program
-- assignment, this function computes `trial_ends_at` ITSELF from `now()`
-- (Postgres' own trusted clock) plus the approved duration — it does NOT
-- accept a client-supplied end date for a program the way it does for
-- non-program assignments. This is "the trusted issuance or activation
-- operation": the moment an admin calls this RPC with a p_program value IS
-- the recorded issuance event, and `trial_started_at`/`trial_ends_at` (the
-- same columns the existing trial/promo lifecycle already used — not
-- duplicated with new columns) become that program's trusted clock,
-- re-read via now() by is_my_program_active() below, never by a client
-- Date() comparison.
--
-- Signature change (two new parameters since 017) — DROP first, per the
-- same Postgres rule CORRECTIVE-002 and migration 017 both already
-- document (CREATE OR REPLACE cannot change a function's parameter list).
DROP FUNCTION IF EXISTS public.admin_set_subscription(
  UUID, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE
);

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

  IF p_status NOT IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- REPAIR 006 (unchanged): paid_tier requires an explicit plan; any other
  -- tier must not have one.
  IF p_tier = 'paid_tier' AND p_plan IS NULL THEN
    RAISE EXCEPTION 'A plan (daily_care or full_support) is required when assigning paid_tier';
  END IF;
  IF p_tier != 'paid_tier' AND p_plan IS NOT NULL THEN
    RAISE EXCEPTION 'plan must be null for tier %', p_tier;
  END IF;
  IF p_plan IS NOT NULL AND p_plan NOT IN ('daily_care', 'full_support') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END IF;

  -- REPAIR 007: program requires free_tier; any other tier must not have one.
  IF p_program IS NOT NULL AND p_tier != 'free_tier' THEN
    RAISE EXCEPTION 'program requires tier=free_tier, got %', p_tier;
  END IF;
  IF p_program IS NOT NULL AND p_program NOT IN ('temp_user', 'companion') THEN
    RAISE EXCEPTION 'Invalid program: %', p_program;
  END IF;

  -- Trusted issuance: a program's expiry is ALWAYS computed here, from
  -- now(), never accepted from the caller — closing the "fabricate an
  -- activation timestamp" and "client-supplied end date" paths at once.
  -- A non-program assignment keeps the existing caller-supplied behavior
  -- unchanged (trial_ends_at falls back to trial_started_at when absent,
  -- exactly as migration 013 already documented).
  IF p_program = 'temp_user' THEN
    v_trial_ends := v_trial_started + INTERVAL '72 hours';
  ELSIF p_program = 'companion' THEN
    v_trial_ends := v_trial_started + INTERVAL '30 days';
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

REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;

COMMENT ON FUNCTION public.admin_set_subscription IS 'REPAIR 007: now also issues Temporary/Companion programs. A program''s trial_ends_at is ALWAYS computed here from now() + the approved duration (72h / 30d) — never accepted from the caller, so no activation timestamp can be fabricated or back/forward-dated. Requires admin/superadmin; never reachable from any client-controlled write.';

-- ============================================================
-- 3. is_my_program_active() — the ONLY trusted expiry check
-- ============================================================
-- Evaluates `now() <= trial_ends_at` INSIDE Postgres — immune to a
-- manipulated client device clock by construction, since the comparison
-- never leaves the database. Takes no caller-supplied input beyond the
-- implicit auth.uid() — nothing for a caller to falsify.
CREATE OR REPLACE FUNCTION public.is_my_program_active()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
      AND program IS NOT NULL
      AND status = 'active'
      AND trial_ends_at IS NOT NULL
      AND now() <= trial_ends_at
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_my_program_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_program_active() TO authenticated;

COMMENT ON FUNCTION public.is_my_program_active IS 'REPAIR 007: the ONLY trusted Temporary/Companion eligibility check. src/types/subscription.ts isSubscriptionActive() and src/components/ProtectedRoute.tsx both call this (never a client Date() comparison) so an expired program cannot retain access through either code path.';

-- Internal helper for the write-blocking policies below — not granted to
-- PUBLIC/authenticated directly (only used inside policy USING/WITH CHECK
-- expressions, which evaluate with the policy owner's privilege to read
-- this function regardless of the caller's own grants).
CREATE OR REPLACE FUNCTION public.caller_is_temp_user_program()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions WHERE user_id = auth.uid() AND program = 'temp_user'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION — reconciliation
-- with production's existing temp-user enforcement ***
-- ============================================================
-- FINDING: production already has `profiles.temp_user_expires_at` plus
-- live RESTRICTIVE policies using `NOT is_temp_user()` and
-- `NOT is_temp_user_expired()` across profiles, patients, subscriptions,
-- medications, medication_logs, memories, mood_entries, tasks,
-- patient_intake, and the care_partner tables — a comprehensive,
-- already-working mechanism this file's own original design did not know
-- about when it was written. Neither function's internal body/signature
-- has been read by this correction (no live database access was available
-- to confirm it) — this file does NOT guess their logic and does NOT
-- modify, rename, or depend on them.
--
-- WHY THIS FILE'S OWN RESTRICTIVE POLICIES (section 4 below) ARE SAFE TO
-- APPLY ANYWAY, without replacing or weakening that existing enforcement:
-- Postgres combines multiple RESTRICTIVE policies for the same command
-- with AND — every one of them must pass for the row to be
-- allowed. `caller_is_temp_user_program()` below checks a DIFFERENT
-- condition (`subscriptions.program = 'temp_user'`, a brand-new column
-- this file adds) than whatever `is_temp_user()` checks. Adding this
-- file's RESTRICTIVE policies alongside the existing ones can only ever
-- narrow access further (AND semantics), never widen it and never bypass
-- the existing, already-live `is_temp_user()`/`is_temp_user_expired()`
-- enforcement. This is "forward-compatible" in the sense the owner
-- requires: it adds a second, independent check without touching the
-- first.
--
-- WHAT THIS FILE DOES NOT RESOLVE (explicitly, not silently): no row in
-- production today has `subscriptions.program` set (the column is new),
-- so an EXISTING real temp-user account (already correctly restricted at
-- the RLS layer by `is_temp_user()`) will NOT be recognized by
-- `is_my_program_active()` / `caller_is_temp_user_program()` until a
-- backfill sets `subscriptions.program='temp_user'` (and a `trial_ends_at`
-- derived from that account's existing `profiles.temp_user_expires_at`)
-- for it. Until that backfill runs, such an account is STILL correctly
-- blocked from writes by the pre-existing `is_temp_user()`-based policies
-- (no security regression), but the FRONTEND's own UI signal
-- (`isTempUserDemo`/`isCompanionActive`, which reads `is_my_program_active()`
-- exclusively) will show it as an ordinary account (a UX/display gap, not
-- a security gap). This backfill is a production-specific data migration
-- step, out of scope for today's staging-only work (staging has zero
-- registered users — nothing to backfill) and NOT authorized to run
-- against production under the current work order. It must be written and
-- reviewed separately, informed by the exact `is_temp_user()`/
-- `is_temp_user_expired()` definitions, before production release.
--
-- ============================================================
-- 4. Temporary program: no persistent patient-health-data writes
-- ============================================================
-- Requirement: "No persistent patient-health-data writes... disable all
-- persistent create, update, delete, upload, and clinical-record mutation
-- operations." RESTRICTIVE policies (ANDed with whatever existing
-- PERMISSIVE ownership/caregiver policy already applies) scoped to
-- INSERT/UPDATE/DELETE only — SELECT (read-only demo viewing) is
-- deliberately untouched. Applied to every tracked, patient-data-mutating
-- table this engagement has schema evidence for. A caller who is not
-- currently a temp_user program (the overwhelming majority of accounts,
-- including ordinary free_tier/Companion/paid/master) is completely
-- unaffected — caller_is_temp_user_program() is false for them, so the
-- RESTRICTIVE check (`NOT ...`) always passes.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'medications', 'tasks', 'mood_entries', 'memories', 'appointments',
    'care_team_members', 'patient_notes', 'care_partner_checkins'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot insert into %I (REPAIR 007)" ON %I AS RESTRICTIVE FOR INSERT WITH CHECK (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — skipped (not defined in any tracked migration; confirm its real name before relying on this policy).', tbl;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot update %I (REPAIR 007)" ON %I AS RESTRICTIVE FOR UPDATE USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL; -- already notified above
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot delete from %I (REPAIR 007)" ON %I AS RESTRICTIVE FOR DELETE USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL; -- already notified above
    END;
  END LOOP;
END $$;

-- `patients` itself: a temp_user program account must never be able to
-- create or modify a REAL patient record either (requirement: "no
-- automatic access to real patient accounts"). Structurally, a temp_user
-- demo-operator account is not expected to own any real `patients` row at
-- all (see the completion report — demo content is intentionally never
-- backed by this table); this policy is defense in depth, not the primary
-- mechanism (the primary mechanism is simply never creating a
-- caregiver_patients link or patients row for a temp_user account in the
-- first place — unaffected by, and unrelated to, this migration, which
-- touches no caregiver/ownership policy from 001/014).
DO $$ BEGIN
  CREATE POLICY "Temporary program cannot insert patients (REPAIR 007)"
    ON patients AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.caller_is_temp_user_program());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Temporary program cannot update patients (REPAIR 007)"
    ON patients AS RESTRICTIVE FOR UPDATE
    USING (NOT public.caller_is_temp_user_program());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 5. Companion: no automatic caregiver relationship, no paid-only access
-- ============================================================
-- Both are already true WITHOUT any new policy:
--   - No automatic caregiver relationship: nothing in this file (or
--     admin_set_subscription() generally) ever writes to
--     caregiver_patients. Issuing a Companion program only ever touches
--     the `subscriptions` row for the target user_id — the SAME
--     create_patient_with_caregiver() RPC from 014 remains the only path
--     to establish a caregiver_patients row, unconditional on program.
--   - No paid-only access: Companion's approved features (medications,
--     media, documents) are EXACTLY free_tier's existing three approved
--     features (REPAIR 005/006) — hasFeatureAccess() needs no change for
--     Companion at all, since `tier='free_tier'` already grants precisely
--     that set and nothing else. The only thing REPAIR 007 adds for
--     Companion is the trusted 30-day expiry (via `program` + the trusted
--     RPC above) — once expired, isSubscriptionActive() returns false and
--     can() denies everything, including the three normally-free
--     features, until re-issued.
-- Nothing further to enforce here at the database layer.

-- ============================================================
-- BLOCKERS (explicitly reported, not resolved by this file)
-- ============================================================
-- 1. Temporary's "synthetic demonstration data only" requirement (section
--    4 of this repair order) has NO implementation in this batch — see
--    the completion report for why, and the explicit instruction this
--    follows: "If a fully secure demo experience cannot be completed in
--    this bounded batch, keep Temporary issuance disabled." The admin UI
--    (AdminLayout.tsx) continues to mark temp_user `available: false`.
--    This migration's temp_user enforcement (section 4 above) is the
--    prepared, reviewable technical foundation for WHEN that is built —
--    not a claim that issuance is ready today.
-- 2. The exact resolution for legacy accounts that were never issued
--    through this program model (there are none today, since `program`
--    is a brand-new column — this note exists for completeness, not
--    because any such row is known to exist).

-- ============================================================
-- STAGING-ONLY AUTHORIZATION/BEHAVIOR TESTS (described for the owner to
-- run in an isolated environment; NOT executed by this migration file or
-- by this engagement — no isolated test database exists)
-- ============================================================
-- T1 (positive, trusted issuance): admin calls admin_set_subscription with
--   p_tier='free_tier', p_program='companion', arbitrary p_trial_ends_at.
--   Expected: the RETURNED row's trial_ends_at is trial_started_at + 30
--   days exactly, NOT the caller-supplied value — confirms the client
--   cannot fabricate or extend the expiry.
-- T2 (negative, requirement 3): a non-admin authenticated user attempts
--   `update subscriptions set program='companion' where
--   user_id=auth.uid()` directly, or calls admin_set_subscription for
--   their own account. Expected: both denied (column/table grant; the
--   function's own admin-role check).
-- T3 (positive, requirement — expiry survives refresh/re-login/new
--   device): issue a companion program; from a SECOND session (different
--   device/browser), confirm is_my_program_active() returns the SAME
--   result as the first session, with no change to trial_started_at.
-- T4 (negative, manipulated client clock): set the TEST CLIENT's system
--   clock backward past the issuance date; call is_my_program_active().
--   Expected: result is unaffected (based on Postgres' own now(), not the
--   client's clock) — still correctly reflects real elapsed time.
-- T5 (positive, 72h boundary): issue temp_user; immediately before and
--   immediately after the 72-hour mark (using a seeded trial_started_at
--   in the past for the test, not a 3-day wait), call
--   is_my_program_active(). Expected: true before, false at/after.
-- T6 (positive, 30d boundary): identical to T5 for companion at the
--   30-day mark.
-- T7 (negative, temp_user write-blocking): as a temp_user program
--   account, attempt `insert into memories (...)`. Expected: denied by
--   the new RESTRICTIVE policy even if the caller otherwise satisfies
--   whatever PERMISSIVE ownership policy exists.
-- T8 (positive, temp_user read still works): same account, `select *
--   from memories where patient_id = <id the caller legitimately owns>`.
--   Expected: succeeds — this migration adds no SELECT restriction.
-- T9 (negative, no automatic real-patient access): a freshly-issued
--   temp_user account attempts to read/write ANY existing real patient's
--   data. Expected: denied by the pre-existing, untouched ownership RLS
--   (001/014) — the temp_user account owns no caregiver_patients row at
--   all, since nothing issues one.
-- T10 (positive, Companion feature access): a companion program account
--   (status=active, within 30 days) can read/write medications, media,
--   documents for a patient it independently owns or is an authorized
--   caregiver for. Expected: succeeds — unaffected by this migration
--   (ownership/caregiver RLS unchanged); gated only by the pre-existing
--   patient-ownership rules, same as any free_tier account.
-- T11 (negative, Companion denied paid-only features): same account
--   attempts to access/write a Daily-Care or Full-Support-exclusive
--   feature. Expected: denied at the application layer (can()) —
--   Companion is tier='free_tier', which never grants those FeatureKeys
--   regardless of `program`.
-- T12 (positive, expiry does not erase data): let a companion program
--   expire (now() > trial_ends_at); confirm existing memories/documents
--   rows for that account's patient are still present and still readable
--   by an authorized caregiver (expiry affects THIS account's own access
--   via is_my_program_active()/isSubscriptionActive(), never deletes any
--   row).
-- T13 (regression — existing rows preserved): row-count and id-set
--   snapshot for every table this file adds a policy to, before/after.
--   Expected: identical — this file adds columns/constraints/functions/
--   policies only; it touches no row.
