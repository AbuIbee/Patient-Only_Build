-- 020_admin_profile_access_and_security_hardening.sql
-- MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 1 — three concrete
-- defects found while validating the full 012-019 migration chain against
-- the application code that actually depends on it.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.

-- ============================================================
-- 1. profiles: admins have NO row-level access to any OTHER account at all
-- ============================================================
-- EVIDENCE: 001_initial_schema.sql's only `profiles` RLS policies are
--   "Users can view their own profile"   FOR SELECT USING (auth.uid() = id)
--   "Users can update their own profile" FOR UPDATE USING (auth.uid() = id)
-- No tracked migration (001-019) ever adds an admin-bypass policy on
-- `profiles` itself, even though the exact same `EXISTS (SELECT 1 FROM
-- profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'))`
-- pattern is already used for subscriptions (010), patient_intake (009),
-- and inside every admin-only RPC (011/012/013/014/017/018). Under the
-- TRACKED schema alone, every admin-panel read/write of ANOTHER account's
-- profile row has no RLS path to succeed at all:
--   - src/pages/admin/AdminLayout.tsx's user list/table, AdminDashboard.tsx's
--     counts, AdminPatients.tsx's patient list, AdminPendingApprovals.tsx's
--     pending-signup list — all `.from('profiles').select(...)` with no
--     `.eq('id', auth.uid())` filter — would return zero rows (or only the
--     admin's own single row) for anyone other than the querying admin.
--   - AdminLayout.tsx's/AdminPatients.tsx's `saveUser()`/`saveRow()`
--     (`.update({ first_name, last_name, phone, ... }).eq('id', u.id)` for
--     ANOTHER user) would be denied outright.
--   - AdminPendingApprovals.tsx's `handleReject()`
--     (`.from('profiles').delete().eq('id', user.id)`) would be denied —
--     there has never been ANY DELETE policy on `profiles` in any tracked
--     migration, admin or otherwise.
-- This is exactly "incorrect policy dependencies" / "schema-dependent
-- policies that silently fail to install" (this closure order's own Phase
-- 1.4 checklist) — the admin UI code has looked complete since early
-- repairs, but its one load-bearing assumption (an admin-bypass policy on
-- `profiles`) was never actually written anywhere in this engagement's
-- tracked migrations.
--
-- FIX: add the three missing admin-bypass policies, using the SAME
-- established EXISTS pattern, PERMISSIVE (ORed with the existing
-- self-access policies, narrowing nothing). Column-level grants from
-- 012_profiles_revoke_client_role_authority.sql are UNCHANGED by this file
-- — an admin still cannot write `role` or `email` through a raw UPDATE
-- (even on another row), only through admin_set_role()/Supabase Auth,
-- exactly as before. DELETE is deliberately scoped to `role = 'pending'`
-- only — the one confirmed legitimate use (AdminPendingApprovals.tsx
-- rejecting a signup that has no patient data yet) — rather than a
-- blanket "admin may delete any profile," which would also let an admin
-- cascade-delete a real patient's entire record set
-- (`patients.id REFERENCES auth.users... ON DELETE CASCADE` by way of
-- `profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` once the
-- underlying auth.users row is implicated) with no confirmed UI flow that
-- intends that and no owner-approved retention decision for it.
DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update other profiles"
    ON profiles FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete pending signups only"
    ON profiles FOR DELETE
    USING (
      role = 'pending'
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. handle_new_user(): missing SET search_path hardening
-- ============================================================
-- Every OTHER SECURITY DEFINER function in this engagement's migrations
-- (003/010/011/012's admin_set_role/013/014/015/016/017/018/019) sets an
-- explicit `SET search_path = public` — standard Postgres hardening for
-- SECURITY DEFINER functions, preventing a caller-manipulable search_path
-- from redirecting an unqualified identifier to an attacker-controlled
-- object in a schema earlier in the resolution order.
-- 012_profiles_revoke_client_role_authority.sql's own redefinition of
-- `handle_new_user()` is the one remaining function in this codebase
-- without it (001's original has the same gap, but 012's CREATE OR
-- REPLACE already supersedes it — fixing 012's version is what matters).
-- Low severity in practice (the function already schema-qualifies its one
-- write as `public.profiles`, not a bare `profiles`), but there is no
-- reason for this one function to be the sole exception to an otherwise
-- universal, deliberate pattern. Signature and body are otherwise
-- byte-for-byte identical to 012's version — CREATE OR REPLACE is safe.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    CASE WHEN requested_role IN ('patient', 'caregiver') THEN requested_role ELSE 'patient' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. redeem_promo_code(): ON CONFLICT UPDATE never clears a pre-existing
--    `program` — can leave a redemption unable to commit, or ambiguous
-- ============================================================
-- EVIDENCE: 018_temporary_companion_program_identity.sql's
-- `subscriptions_program_requires_free_tier` CHECK requires `program IS
-- NULL OR tier = 'free_tier'`. redeem_promo_code()'s `ON CONFLICT (user_id)
-- DO UPDATE SET tier = v_promo.tier, plan = v_promo.plan, status='promo',
-- ...` (017) never mentions `program` at all, so a row that currently has
-- `program='temp_user'` or `program='companion'` (tier='free_tier') keeps
-- that `program` value untouched when a promo redemption tries to set
-- `tier='paid_tier'` — violating the CHECK constraint and aborting the
-- whole redemption with a raw, confusing constraint-violation error
-- instead of either succeeding cleanly or failing with a clear message.
-- This fails CLOSED (no corrupted row, no unintended privilege), so it is
-- a functional-correctness defect, not a security one — but it is exactly
-- the kind of "confirmed remaining implementation contradiction" this
-- closure order's Phase 6.3 asks to correct.
--
-- FIX: a redeemed promo code is itself a complete, specific, admin-
-- approved entitlement decision — exactly like any other
-- admin_set_subscription() assignment. Redeeming one supersedes whatever
-- program state existed before, the same way admin_set_subscription()
-- already lets an admin move a Temporary/Companion account onto a
-- different account type outright. Explicitly setting `program = NULL` on
-- conflict makes this supersession intentional and always constraint-safe,
-- for a redemption into EITHER tier (a free_tier promo code would also
-- correctly clear any prior program, rather than leave a stale Temporary/
-- Companion classification silently coexisting with a promo-granted status
-- that has nothing to do with either program).
-- Signature unchanged (still just p_code) — CREATE OR REPLACE is safe.
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
    -- REPAIR 009: redemption supersedes any prior Temporary/Companion
    -- program classification outright, and keeps this write constraint-
    -- safe regardless of which tier the promo grants.
    program           = NULL,
    status            = 'promo',
    promo_code        = v_promo.code,
    promo_expires_at  = v_promo_expiry,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (positive): admin A calls `select * from profiles` (or the exact
--   AdminLayout.tsx/AdminPatients.tsx/AdminDashboard.tsx/
--   AdminPendingApprovals.tsx queries). Expected: every profile row is
--   returned, not only A's own.
-- T2 (negative): a non-admin patient/caregiver calls the same `select *
--   from profiles`. Expected: only their own single row — unaffected by
--   this file (the new policies' EXISTS check is false for them).
-- T3 (positive): admin A updates another user's first_name/last_name/
--   phone via a plain `.update(...).eq('id', <other-id>)`. Expected:
--   succeeds now (previously denied).
-- T4 (negative, unchanged by this file): admin A attempts the same update
--   but includes `role` or `email` in the payload. Expected: still denied
--   — column-level grants from 012 are untouched; only admin_set_role()/
--   Supabase Auth may change those, for any row.
-- T5 (positive): admin A deletes a profile with role='pending'. Expected:
--   succeeds.
-- T6 (negative): admin A attempts to delete a profile with role='patient'
--   (or 'caregiver'/'admin'). Expected: denied — the new DELETE policy's
--   `role = 'pending'` condition excludes it.
-- T7 (negative): a non-admin attempts any DELETE on `profiles`, including
--   their own row. Expected: denied — the EXISTS admin check fails, and
--   there is still no self-delete policy anywhere.
-- T8 (positive, regression — self-access unaffected): an ordinary patient
--   reads/updates their OWN profile row via the existing self policies.
--   Expected: identical to before this file; it ADDS policies, replaces
--   none.
-- T9 (positive, promo supersedes program): a user with
--   subscriptions.program='companion' (tier='free_tier') redeems a valid
--   paid_tier promo code. Expected: succeeds; the resulting row has
--   tier='paid_tier', status='promo', program IS NULL — no constraint
--   violation.
-- T10 (positive, free-tier promo also clears program): same account,
--   redeeming a tier='free_tier' promo code instead. Expected: succeeds;
--   program IS NULL afterward (the promo's own entitlement — a free_tier
--   status change — is now the account's explicit state, not a leftover
--   program label).
-- T11 (regression — existing rows preserved): row-count/id-set snapshot
--   for `profiles` and `subscriptions` before/after. Expected: identical —
--   this file adds policies and replaces two function bodies; it updates
--   no existing row.
