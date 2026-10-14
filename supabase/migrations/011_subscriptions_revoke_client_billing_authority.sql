-- 011_subscriptions_revoke_client_billing_authority.sql
-- CORRECTIVE migration for F10 / FQA-016 / SEC-004.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
--
-- WHY THIS FILE EXISTS: 010_subscriptions_and_admin_rpc.sql opened with
-- `CREATE TABLE IF NOT EXISTS subscriptions (...)`. That is a documented
-- no-op against a table that already exists — and it already exists.
-- Live-schema evidence (MyMemoria_Production_Audit/
-- 04_SUPABASE_SECURITY_AND_SCHEMA.md, section "public.subscriptions" —
-- read-only evidence, not a live connection) confirms the real table and
-- names the exact policies in force today:
--
--   Real shape 010 got wrong: PK is `id`, not `user_id`. `user_id` is a
--   plain NOT NULL column. Live columns also include current_period_start,
--   current_period_end, stripe_customer_id, canceled_at, promo_code — none
--   of which 010 proposed. `trial_ends_at` is confirmed NOT NULL live
--   (010's nullable-column reasoning was correct in direction, just against
--   a table shape that was otherwise wrong).
--
--   Client-writable policies confirmed present today (exact names, from
--   that evidence, "Policy symbols" line for public.subscriptions):
--     "Users can insert own subscription"     (INSERT, PERMISSIVE)
--     "Users insert own subscription"         (INSERT, PERMISSIVE)
--     "subscriptions_insert"                  (INSERT, PERMISSIVE)
--     "Users can update own subscription"     (UPDATE, PERMISSIVE)
--     "Users update own subscription"         (UPDATE, PERMISSIVE)
--     "subscriptions_update"                  (UPDATE, PERMISSIVE)
--     "subscriptions_delete"                  (DELETE, PERMISSIVE)
--     "Service role can update subscriptions" (UPDATE, PERMISSIVE) — per
--        SEC-004's own text this is MISNAMED: it applies to PUBLIC with
--        USING(true) — i.e. NOT actually restricted to the service_role,
--        and not restricted to the caller's own row either. This is the
--        single most severe grant on this table.
--
--   010's own-row SELECT policies, and the live SELECT-only policies
--   confirmed by the same evidence ("Users can read/view own subscription",
--   "Users view own subscription", "subscriptions_select") are left
--   completely untouched by this file — this correction removes WRITE
--   authority only, per the correction order's explicit instruction.
--
--   "Service role full access" and "Service role subscriptions" (both ALL,
--   PERMISSIVE) are ALSO left untouched: nothing in the available evidence
--   flags them as misscoped (unlike the explicitly-named "Service role can
--   update subscriptions"), and Supabase's `service_role` Postgres role has
--   BYPASSRLS by default regardless of policy content, so a genuine
--   service-role connection (e.g. the Stripe webhook) does not depend on
--   these policies to function. Dropping them on a guess risks breaking a
--   legitimate server path for no confirmed security benefit. If a future
--   live audit shows either is ALSO scoped to PUBLIC/anon rather than the
--   actual service_role, it needs the same treatment as "Service role can
--   update subscriptions" above — flagged here, not assumed.
--
--   No new pricing tiers, payment providers, or RLS policy broader than
--   what already existed is introduced anywhere in this file.

-- ============================================================
-- FORWARD FIX
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users insert own subscription" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users update own subscription" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_delete" ON subscriptions;
DROP POLICY IF EXISTS "Service role can update subscriptions" ON subscriptions;

-- Deliberately no replacement INSERT/UPDATE/DELETE policy for
-- authenticated/anon. With RLS enabled and zero PERMISSIVE policies
-- matching a given command, Postgres denies that command by default for
-- every role except one with BYPASSRLS (service_role). After this file: an
-- ordinary signed-in user can still SELECT their own row (untouched
-- policies) but cannot INSERT, UPDATE, or DELETE it directly — tier,
-- status, trial/promo expiry, and stripe_customer_id/stripe_subscription_id
-- can only change through admin_set_subscription() below or a genuine
-- service-role connection.

-- Redefine admin_set_subscription (originally from 010) to match the REAL
-- table: keyed by `id`, with `user_id` a plain column whose uniqueness this
-- engagement could not independently confirm from the available evidence
-- (010's `ON CONFLICT (user_id)` requires a UNIQUE constraint on that exact
-- column to function at all — unconfirmed, so not relied upon here). This
-- version uses an explicit existence check instead, which is correct
-- regardless of whether that constraint exists.
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_user_id UUID,
  p_tier TEXT,
  p_status TEXT,
  p_trial_started_at TIMESTAMP WITH TIME ZONE,
  p_trial_ends_at TIMESTAMP WITH TIME ZONE,
  p_promo_expires_at TIMESTAMP WITH TIME ZONE
) RETURNS void AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  -- NOTE: this allow-list matches 010's original list. FQA-011 (independent
  -- audit) states the live status CHECK constraint may not include
  -- 'trialing' — this could not be confirmed from available evidence (only
  -- column/policy data was available, not CHECK constraint definitions).
  -- If so, calling this RPC with p_status='trialing' will fail safely at
  -- the INSERT/UPDATE with a CHECK-constraint error (visible, not a
  -- security issue) rather than silently miscording. Not changed here
  -- without confirming the real constraint, per "no new pricing/providers."
  IF p_status NOT IN (
    'trialing', 'promo', 'active', 'canceled', 'expired',
    'pending_payment', 'requires_payment', 'past_due', 'incomplete'
  ) THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  SELECT id INTO v_existing_id FROM subscriptions WHERE user_id = p_user_id LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at, promo_expires_at, updated_at)
    VALUES (p_user_id, p_tier, p_status, p_trial_started_at, p_trial_ends_at, p_promo_expires_at, now());
  ELSE
    UPDATE subscriptions SET
      tier              = p_tier,
      status            = p_status,
      trial_started_at  = p_trial_started_at,
      trial_ends_at     = p_trial_ends_at,
      promo_expires_at  = p_promo_expires_at,
      updated_at        = now()
    WHERE id = v_existing_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;

COMMENT ON FUNCTION public.admin_set_subscription IS 'F10/SEC-004 correction: admin-only, existence-check upsert against the REAL subscriptions table (keyed by id). Client-direct INSERT/UPDATE/DELETE on subscriptions is denied by default after this migration — see the DROP POLICY statements above.';

-- ============================================================
-- ROLLBACK (manual — do not auto-apply)
-- ============================================================
-- This migration is not executed, so there is nothing live to roll back
-- yet. If it IS applied to staging/production and needs to be reverted,
-- do NOT simply recreate the original policies by name — their exact
-- USING/WITH CHECK predicates were never captured verbatim by the
-- available evidence (only names and high-level behavior were), so
-- reconstructing them would be guessing, not a safe default. Instead:
--   1. Confirm via a fresh live policy dump that no legitimate path
--      actually depended on unrestricted client-direct subscriptions
--      writes having existed (expected: none should, since
--      admin_set_subscription is the only write path this application
--      code uses as of this branch).
--   2. If a genuine regression is found, add back ONLY a narrowly-scoped
--      replacement (e.g. own-row INSERT permitted only for a brand-new row
--      with tier='free_tier' AND status='trialing', never an UPDATE of an
--      existing row's billing fields) — not the original unrestricted
--      policies.
--   3. *** CORRECTED (C02-009): the step 3 previously written here was
--      WRONG and must not be followed. *** `DROP FUNCTION
--      public.admin_set_subscription(...)` does NOT "revert to whatever
--      010 left in place" — Postgres keeps no history of prior
--      `CREATE OR REPLACE FUNCTION` bodies at all. Once this file's
--      `CREATE OR REPLACE FUNCTION` has run, 010's original body is simply
--      gone; a `DROP FUNCTION` after that removes the ONLY copy that
--      exists, leaving admin_set_subscription entirely undefined and
--      breaking every legitimate admin account-type change with no
--      fallback. If this function specifically needs to be restored to an
--      earlier behavior: (a) capture the exact function body, owner, and
--      ACLs (`pg_get_functiondef`, `\df+`) from the environment BEFORE
--      applying any change there, kept outside this repo if it must stay
--      out of version control; (b) to roll back, run a fresh
--      `CREATE OR REPLACE FUNCTION` using that captured definition — never
--      a bare `DROP FUNCTION` with no replacement; (c) if no prior
--      definition was captured, the only safe path is forward: write and
--      review a NEW migration with the corrected behavior, matching the
--      rest of this file's own approach, rather than attempting to
--      "restore" anything.

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement)
-- ============================================================
-- T1 (negative, the FQA-016/SEC-004 regression test): as an authenticated
--   non-admin user, attempt `update subscriptions set tier='master' where
--   user_id=auth.uid()` via the client library against staging.
--   Expected: 0 rows affected / RLS denial, not silent success.
-- T2 (negative): same actor, `insert into subscriptions (user_id, tier,
--   status, trial_started_at) values (auth.uid(), 'master', 'active',
--   now())`. Expected: denied.
-- T3 (negative): same actor, `delete from subscriptions where
--   user_id=auth.uid()`. Expected: denied.
-- T4 (positive): an admin-role profile calls
--   `admin_set_subscription(<other_user_id>, 'paid_tier', 'active', now(),
--   null, null)`. Expected: succeeds; the target row reflects the new
--   values; updated_at advances.
-- T5 (negative): a non-admin profile calls admin_set_subscription(...).
--   Expected: `RAISE EXCEPTION 'Only admins can change subscription/account
--   type'`.
-- T6 (positive, idempotency/upsert correctness): call admin_set_subscription
--   twice in a row with the same arguments for a user with no existing row.
--   Expected: exactly one row exists afterward (first call inserts, second
--   updates in place) — proves the existence-check upsert works without
--   relying on an unconfirmed UNIQUE(user_id) constraint.
-- T7 (regression — existing rows preserved): before applying in staging,
--   snapshot `SELECT count(*), array_agg(user_id ORDER BY user_id) FROM
--   subscriptions`; after applying, re-run the identical query. Expected:
--   identical row count and identical user_id set. This migration drops
--   policies and redefines one function; it does not touch any row.
-- T8 (positive, service path unaffected): trigger (in staging only) whatever
--   writes `expire_trials` or the Stripe webhook perform against
--   `subscriptions` using the real service-role key. Expected: unaffected
--   by this migration, since service_role bypasses RLS independent of
--   policy content.
