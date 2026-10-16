-- 002_identity_and_role_contract.sql
-- F01 (login/profile hydration) + F02 (registration/onboarding) remediation.
--
-- PROPOSAL ONLY — NOT EXECUTED. Per MYMEMORIA-FUNC-REMEDIATION-001 section 4/5:
-- no isolated staging exists, and production (ktehhvmmwnsbcvpjcmzt) is a
-- read-only evidence source, not a migration target. This file has not been
-- run against any database.
--
-- Written defensively (IF NOT EXISTS / idempotent DO blocks) because the
-- tracked migration history in this repo (001_initial_schema.sql) does not
-- match what application code already depends on in production — see
-- MyMemoria_Functional_Remediation_001/00_BASELINE_AND_SCOPE.md. These
-- statements are safe to run whether or not the live schema already has
-- some of these columns, but MUST be manually reconciled against the real
-- live schema (e.g. via `supabase db diff` or a schema dump) before
-- execution, since this file cannot see production.

-- ── F01: profiles columns referenced by App.tsx / patientService.ts / ──────
-- ── AdminLayout.tsx / AdminPatients.tsx / MFASettings.tsx but absent from ──
-- ── the tracked 001 migration. ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_enabled           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url             TEXT,
  ADD COLUMN IF NOT EXISTS phone_normalized      TEXT;

-- F02: resumable-provisioning marker so createPatient() can detect and
-- continue a partially-completed signup instead of re-calling auth.signUp
-- (which Supabase rejects as "already registered") on retry.
-- Existing rows default to 'complete' — they already exist and are in use,
-- not mid-provisioning.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'complete';

DO $$ BEGIN
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_provisioning_status_check
    CHECK (provisioning_status IN ('profile_created', 'patient_created', 'complete'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- src/lib/identity.ts:51 queries phone_normalized for duplicate-phone
-- detection, but nothing in the tracked codebase ever writes it — the
-- uniqueness check has been silently inert. Keep it populated automatically
-- so assertUniqueProfileIdentity() (used by F02's createPatient and the
-- self-serve PricingPage signup) actually works going forward, without
-- requiring every call site to remember to set it.
CREATE OR REPLACE FUNCTION public.sync_phone_normalized()
RETURNS TRIGGER AS $$
BEGIN
  NEW.phone_normalized := CASE
    WHEN NEW.phone IS NULL OR regexp_replace(NEW.phone, '\D', '', 'g') = '' THEN NULL
    WHEN length(regexp_replace(NEW.phone, '\D', '', 'g')) = 11
         AND left(regexp_replace(NEW.phone, '\D', '', 'g'), 1) = '1'
      THEN substring(regexp_replace(NEW.phone, '\D', '', 'g') from 2)
    ELSE regexp_replace(NEW.phone, '\D', '', 'g')
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_phone_normalized ON profiles;
CREATE TRIGGER trg_sync_phone_normalized
  BEFORE INSERT OR UPDATE OF phone ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_phone_normalized();

-- Backfill existing rows once (safe to re-run).
UPDATE profiles SET phone = phone WHERE phone IS NOT NULL AND phone_normalized IS NULL;

-- F01: the tracked profiles.role CHECK only allows ('patient','caregiver',
-- 'therapist') — it has no 'admin' or 'superadmin' value, yet AdminLayout.tsx,
-- App.tsx's isPrivileged/allowedRoles lists, and CLAUDE.md all assume these
-- roles exist and are assignable. Broaden rather than narrow, so this is
-- additive for whatever role values are already live.
--
-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION ***: this list
-- originally omitted 'pending'. 022_pending_role_support.sql later re-adds
-- the SAME constraint name with 'pending' included — but between THIS file
-- running and 022 running, if the target database already has any row with
-- role='pending' (confirmed live on production, since
-- AdminPendingApprovals.tsx filters on exactly that value today), the
-- DROP CONSTRAINT above succeeds, the subsequent ADD CONSTRAINT fails
-- (check_violation), the EXCEPTION handler only logs a notice, and
-- profiles.role is left with NO CHECK constraint at all until 022 runs —
-- "never leave profiles.role without its CHECK." Including 'pending' here
-- from the start (matching 022's own eventual six-value set exactly, so
-- 022's later DROP+ADD of the identical definition is a harmless no-op)
-- closes that gap without waiting for 022.
DO $$ BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist', 'pending'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'profiles_role_check not reapplied — existing rows may contain a role value outside this (six-value) set; reconcile manually before executing. profiles.role currently has NO CHECK constraint as a result — do not proceed to later migrations until this is resolved.';
END $$;

COMMENT ON COLUMN profiles.must_change_password IS 'F01: gates forced password reset at login; enforced client-side in App.tsx restoreSession + handlePasswordSet, re-verified (not just locally cleared) after ResetPasswordPage.';
COMMENT ON COLUMN profiles.provisioning_status IS 'F02: tracks admin-provisioned patient signup progress (createPatient in patientService.ts) so a retry resumes instead of re-running auth.signUp.';
