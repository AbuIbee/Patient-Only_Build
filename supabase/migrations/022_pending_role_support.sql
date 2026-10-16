-- 022_pending_role_support.sql
-- MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 1.3 + PHASE 4.1 — the
-- "Pending Approvals" admin screen depends on a role value the tracked
-- schema has never actually allowed.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- EVIDENCE: src/pages/admin/AdminPendingApprovals.tsx (`.eq('role',
-- 'pending')`, a list of accounts awaiting admin review, with Approve ->
-- admin_set_role(id, 'patient') and Reject -> delete) and
-- src/pages/admin/AdminDashboard.tsx (a pending-count stat) both assume
-- `profiles.role` can be `'pending'`. It cannot, under the tracked schema:
--   - 002_identity_and_role_contract.sql's `profiles_role_check` CHECK
--     constraint is `role IN ('patient', 'admin', 'superadmin',
--     'caregiver', 'therapist')` — 'pending' is not in it, so no INSERT or
--     UPDATE could ever set it.
--   - admin_set_role()'s own validation (012_profiles_revoke_client_role_
--     authority.sql) is `p_role NOT IN ('patient', 'admin', 'superadmin',
--     'caregiver', 'therapist')` — RAISEs on 'pending' too, so even an
--     admin could never (re-)assign it through the one trusted role-change
--     path.
--   - handle_new_user() (001/012) only ever assigns 'patient' or
--     'caregiver' from signup metadata, defaulting everything else to
--     'patient' — no tracked signup path produces 'pending' either.
-- Net effect under the tracked schema alone: no row can ever have
-- role='pending', so the "Pending Approvals" screen can only ever show
-- zero results, by construction, regardless of how many people sign up.
--
-- THIS FILE closes the SCHEMA side only — the CHECK constraint and
-- admin_set_role()'s validation both now accept 'pending' as a value that
-- can EXIST and be READ/FILTERED/APPROVED/REJECTED through the already-
-- built admin screen and its existing, already-correct use of
-- admin_set_role() for the approve action and a plain DELETE for reject
-- (deliberately narrowed to role='pending' only in
-- 020_admin_profile_access_and_security_hardening.sql's own new DELETE
-- policy — unaffected by this file, still correct: an approved account's
-- role is 'patient' by the time Reject could ever apply to it, so
-- widening DELETE eligibility is not implied by this change).
--
-- *** BLOCKER, EXPLICITLY NOT RESOLVED HERE *** — THE ACTUAL PRODUCT
-- DECISION THIS DOES NOT MAKE: how a profile is meant to ever ARRIVE at
-- role='pending' in the first place is still completely unresolved. Three
-- real candidates exist and this file deliberately picks none of them,
-- per this engagement's standing instruction not to invent an account-
-- approval policy:
--   (a) Change handle_new_user() so EVERY new self-service signup starts
--       as 'pending' instead of defaulting to 'patient' immediately — a
--       significant behavior change (every new patient would need admin
--       approval before they could use the app at all) that needs
--       explicit owner sign-off, not an inference from this fix.
--   (b) A separate, currently-nonexistent signup surface (e.g. a
--       caregiver/professional self-registration flow distinct from the
--       patient self-service flow already in PricingPage.tsx) that
--       intentionally lands in 'pending' for admin review, while ordinary
--       patient self-service signup is unaffected.
--   (c) 'pending' is written today only via direct, out-of-band database
--       administration (mirroring how 012_profiles_revoke_client_role_
--       authority.sql already documents the very first admin account is
--       provisioned) — in which case this file is sufficient on its own
--       and no application-code change is needed at all.
-- Until the owner decides between these, this migration makes the admin
-- REVIEW side of the feature functionally correct without granting any
-- new self-service capability — it does not, by itself, cause a single
-- additional profile to ever become 'pending'.
DO $$ BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist', 'pending'));
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'profiles_role_check not reapplied — an existing row already has a role value outside this (now six-value) set; reconcile manually before executing.';
END $$;

-- Signature unchanged — CREATE OR REPLACE is safe.
CREATE OR REPLACE FUNCTION public.admin_set_role(
  p_user_id UUID,
  p_role TEXT
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change another account''s role';
  END IF;

  IF p_role NOT IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist', 'pending') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use a separate, explicitly audited action to change your own role, not this RPC';
  END IF;

  UPDATE profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for user %', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (positive): with a profile manually set to role='pending' (direct DB
--   administration, per blocker (c) above), confirm
--   AdminPendingApprovals.tsx's list query returns it and
--   AdminDashboard.tsx's pending count includes it.
-- T2 (positive, approve): an admin calls `admin_set_role(<that id>,
--   'patient')` (the Approve action). Expected: succeeds; the account now
--   behaves as an ordinary patient in every other existing check
--   (unaffected by this file).
-- T3 (positive, reject): an admin performs the Reject action's
--   `delete from profiles where id = <that id>`. Expected: succeeds,
--   governed by 020's existing `role = 'pending'` DELETE policy.
-- T4 (negative, unchanged): a non-admin, or an admin targeting a
--   role != 'pending' row, attempts the same DELETE. Expected: still
--   denied — unaffected by this file.
-- T5 (negative, self-service signup unaffected): confirm the ordinary
--   PricingPage.tsx signup flow still produces role='patient' profiles,
--   never 'pending' — this file does not change handle_new_user()'s own
--   logic at all.
