-- ============================================================================
-- MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — PRODUCTION MIGRATION PACKAGE (v5)
-- v2 corrected per MyMemoria_Production_Migration_Approval_Review_2026-10-17.md
-- (13 findings, P01-P13, marked inline as "REVIEW Pxx"). v3 completed P08
-- using the real production policy catalog supplied in the
-- "MYMEMORIA FINAL MIGRATION CLOSURE" follow-up. v4 corrects 5 further
-- blockers (B1-B5) from a second independent review, marked inline as
-- "REVIEW ROUND 2 / Bx FIX" — most significantly B1: the v3 fix for the
-- original P05 finding was ITSELF wrong (verified directly against
-- src/pages/admin/accountTypes.ts, the real admin UI) and has been
-- replaced; see §9's comment block. v5 ("MYMEMORIA FINAL RELEASE CLOSURE")
-- addressed three items: (2) the Free Tier entitlement discrepancy is
-- fixed at the entitlement-logic and provisioning layers, never by
-- touching existing row data — new §13; (3) paid-to-free downgrade
-- data-access preservation is verified using migration 016's own
-- previously-designed, never-before-included mechanism — new §14.
-- (1) the caregiver-initiated-registration question was RE-INVESTIGATED
-- after a follow-up correctly pointed out the first pass only showed the
-- ADMIN-initiated path was self-consistent, not that a distinct
-- caregiver-initiates/admin-approves workflow exists. Corrected finding:
-- it does NOT exist in this application today, in any form — see the note
-- near §8's create_patient_with_caregiver for the full evidence trail. No
-- code change was made for item 1 (building it is new functionality,
-- outside this round's scope); the admin-only gate and existing-patient
-- protection are unchanged.
-- Forward-only. NOT EXECUTED. Target: ktehhvmmwnsbcvpjcmzt (production) —
-- NEVER run against anything else.
--
-- REVIEW ROUND 2 / transaction-invocation fix: the file brackets itself in
-- a single `BEGIN; ... COMMIT;` below — that is the ONLY transaction
-- wrapper. Do NOT also pass `--single-transaction` to psql; nesting it with
-- this file's own explicit BEGIN/COMMIT produces misleading "already a
-- transaction in progress" / "no transaction in progress" warnings (caught
-- by this round's own dry-run) without adding any real additional safety.
-- Invoke as:
--   psql -v ON_ERROR_STOP=1 -f 14_PRODUCTION_MIGRATION_PACKAGE.sql
-- and explicitly check the process exit status afterward (`echo $?` in a
-- shell, or the equivalent in whatever tool runs it) — do not rely on
-- eyeballing the output alone. A nonzero exit status means the transaction
-- did not commit and production is unchanged; do not treat partial output
-- as a partial success.
--
-- Run 14a_PRODUCTION_PREFLIGHT_CHECKS.sql FIRST (read-only) and confirm every
-- check passes before running this file. Run
-- 14b_PRODUCTION_POSTFLIGHT_VERIFICATION.sql AFTER (read-only). Rollback
-- instructions: 14c_PRODUCTION_ROLLBACK_AND_DEPLOYMENT_NOTES.md.
--
-- Dry-run status: executed in full against an isolated, disposable local
-- PostgreSQL 17 container seeded with a production-shaped baseline schema
-- (zero real customer records, zero connection to any Supabase project).
-- See 16_PRODUCTION_MIGRATION_CORRECTIONS_RESPONSE.md for the transcript and
-- its honest limits (notably: Supabase's own `auth`/`storage` runtime and
-- `is_admin_check()`'s real body are stubbed, not the genuine production
-- implementations, since this session has no access to either).
--
-- REVIEW P13 — CORRECTED FRAMING (carried forward from v2): this file does
-- NOT claim everything in it "can only narrow production access." The
-- admin-bypass profiles policies (§4) and the P08 caregiver-read/storage
-- policies (§11) are deliberate, reviewed wideners, distinct from the
-- narrowing-only/name-independent pieces elsewhere.
--
-- EXPLICITLY EXCLUDED (unchanged across all rounds, per direct instruction):
--   - 001 (historical init) — never replay against production.
--   - 027, 028 in full — staging-only schema-parity migrations.
--   - 005/008 — held, SEC-003/SEC-006 clearance not granted.
-- ============================================================================

BEGIN;

-- ============================================================================
-- §1 — profiles: columns, provisioning_status, six-value role CHECK (002, 022)
-- REVIEW P06 — CORRECTED: the role-CHECK exception handler below now
-- RAISE EXCEPTION (aborting and rolling back the whole transaction) instead
-- of RAISE NOTICE-and-continue. 14a's preflight query 1 should already have
-- confirmed zero disallowed rows; this handler is the enforced backstop, not
-- the only check.
-- ============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_enabled           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url             TEXT,
  ADD COLUMN IF NOT EXISTS phone_normalized      TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'complete';

DO $$ BEGIN
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_provisioning_status_check
    CHECK (provisioning_status IN ('profile_created', 'patient_created', 'complete'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- REVIEW P11 — CORRECTED CLAIM, NOT CORRECTED BEHAVIOR: this statement IS
-- necessary (it backfills the derived phone_normalized column for existing
-- rows that already have a phone on file — without it, duplicate-phone
-- detection silently stays broken for every pre-existing patient until they
-- next edit their phone number) and IS kept. What changes here is only the
-- file's own claim about it: this is NOT "zero existing rows change" — it
-- fires the trigger and writes phone_normalized on every existing row with a
-- non-null phone. No other column is touched, and no user-visible value
-- changes (phone itself is reassigned to itself). It is now inside this
-- file's single transaction, so a later failure in this file rolls it back
-- too, same as everything else.
UPDATE profiles SET phone = phone WHERE phone IS NOT NULL AND phone_normalized IS NULL;

DO $$ BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist', 'pending'));
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'profiles_role_check cannot be reapplied — an existing row has a role value outside this set. Run 14a preflight query 1, reconcile the offending row(s), and re-run this migration. Aborting (this is REVIEW P06''s fix: this file no longer continues past a constraint it failed to apply).';
END $$;


-- ============================================================================
-- §2 — handle_new_user(): final version (020) — role gate + search_path hardening
-- Narrowing/self-contained — trigger function, always one signature, safe.
-- ============================================================================
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


-- ============================================================================
-- §3 — is_admin() helper (024, A1) — REVIEW P03 FIX, REVIEW ROUND 2 / B2 FIX
-- SECURITY DEFINER + table ownership means this function's own internal
-- SELECT never triggers profiles' own RLS, so using it (instead of an inline
-- EXISTS(SELECT ... FROM profiles) subquery) inside a policy ON profiles
-- itself cannot recurse. This was already designed and written in this
-- engagement's own migration 024.
-- REVIEW ROUND 2 / B2: the independent review's own read-only production
-- check found `public.is_admin()` ALREADY EXISTS on production (definition
-- confirmed SECURITY DEFINER), alongside a separate `is_admin_check()`.
-- Blindly `CREATE OR REPLACE`-ing an already-existing, already-possibly-
-- depended-upon function with this file's own body risks silently changing
-- behavior for whatever already calls it, without this file knowing what
-- that current body actually does. State-aware instead: only create it if
-- it does not already exist; if it does, leave it completely untouched and
-- use it as-is — confirm its real definition matches this migration's
-- admin-role-check expectation via 14a preflight (which now fetches it)
-- BEFORE relying on it, rather than this file overwriting an unknown,
-- already-live function.
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin' AND pg_get_function_arguments(p.oid) = ''
  ) THEN
    CREATE FUNCTION public.is_admin()
    RETURNS boolean AS $body$
      SELECT EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
      );
    $body$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
    REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  ELSE
    RAISE NOTICE 'public.is_admin() already exists — left untouched by this migration. Confirm via 14a preflight (which fetches its real definition) that its existing behavior matches the admin-role-check semantics the policies in this file depend on.';
  END IF;
END $$;


-- ============================================================================
-- §4 — profiles: admin-bypass policies, using is_admin() (REVIEW P03 FIX)
-- REVIEW P13 — HONEST FRAMING: these three policies are DELIBERATE, REVIEWED
-- WIDENERS. They are new, distinctly-named PERMISSIVE policies that grant
-- admin/superadmin accounts access to rows they could not otherwise see —
-- that is the intended effect (the admin panel's own read/write of other
-- users' profiles), not an accidental side effect. This is the one place in
-- this file that genuinely widens access beyond what exists today, and it is
-- called out as such rather than folded into a blanket "narrowing" claim.
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update other profiles"
    ON profiles FOR UPDATE
    USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete pending signups only"
    ON profiles FOR DELETE
    USING (role = 'pending' AND public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- §5 — profiles: column-scoped grant allowlist (012, final FINALIZATION-003
-- shape) + REVIEW P09 hardening (explicit anon/PUBLIC revoke + a postflight
-- check of actual effective grants, not just trusting the GRANT ran).
-- Narrowing/self-contained.
-- ============================================================================
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  first_name, last_name, phone, photo_url, phone_normalized,
  must_change_password, mfa_enabled, provisioning_status, updated_at
) ON public.profiles TO authenticated;

REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (
  id, email, first_name, last_name, phone, phone_normalized,
  must_change_password, mfa_enabled, provisioning_status, created_at, updated_at
) ON public.profiles TO authenticated;

DO $$ BEGIN
  ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'patient';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Could not set profiles.role default — reconcile manually before executing (REVIEW P06: fail closed, do not continue past this).';
END $$;

-- REVIEW P09: anon has no legitimate direct access to profiles at all (the
-- only write path for a new row is handle_new_user(), SECURITY DEFINER, and
-- the client never sees an anon-authenticated profiles row by design — every
-- read goes through an authenticated session). PUBLIC is the default-grant
-- pseudo-role every other role inherits from unless explicitly revoked;
-- closing it here prevents any future role from silently inheriting
-- table-wide access to profiles that was never intended.
REVOKE ALL ON public.profiles FROM PUBLIC, anon;


-- ============================================================================
-- §6 — admin_set_role() — final version (022, includes 'pending')
-- Narrowing/self-contained.
-- ============================================================================
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

REVOKE ALL ON FUNCTION public.admin_set_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_role(UUID, TEXT) TO authenticated;


-- ============================================================================
-- §7 — MISSING PRODUCTION SCHEMA DEPENDENCIES (REVIEW P01 FIX)
-- Read-only production catalog inspection (per the review) confirmed these
-- are genuinely absent, not guessed. All additive/IF NOT EXISTS — narrowing/
-- self-contained; nothing here removes or widens access to anything that
-- already exists, because none of it exists yet.
-- ============================================================================

-- ── 7a. subscriptions.plan (017) + promo_codes.plan (017) ──────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan TEXT;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IS NULL OR plan IN ('daily_care', 'full_support'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_requires_paid_tier
    CHECK (plan IS NULL OR tier = 'paid_tier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7b. subscriptions.program (018) ─────────────────────────────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS program TEXT;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_program_check
    CHECK (program IS NULL OR program IN ('temp_user', 'companion'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_program_requires_free_tier
    CHECK (program IS NULL OR tier = 'free_tier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7c. promo_codes (013) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  code        TEXT PRIMARY KEY,
  tier        TEXT NOT NULL CHECK (tier IN ('free_tier', 'paid_tier', 'master')),
  days        INTEGER NOT NULL CHECK (days > 0),
  max_uses    INTEGER,
  expires_at  TIMESTAMP WITH TIME ZONE,
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS plan TEXT;
DO $$ BEGIN
  ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_plan_check
    CHECK (plan IS NULL OR plan IN ('daily_care', 'full_support'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_plan_requires_paid_tier
    CHECK (plan IS NULL OR tier = 'paid_tier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_paid_tier_requires_plan
    CHECK (tier != 'paid_tier' OR plan IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read the promo code catalog"
    ON promo_codes FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- promo_redemptions (013, corrected shape per staging verification)
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  promo_code  TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE promo_redemptions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
DO $$ BEGIN
  ALTER TABLE promo_redemptions ADD CONSTRAINT promo_redemptions_email_code_unique UNIQUE (email, promo_code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
-- No client-facing policy — only redeem_promo_code() (SECURITY DEFINER)
-- writes this table; RLS enabled with zero policies is fail-closed by
-- default.

-- ── 7d. reminders (026) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  title         TEXT,
  message       TEXT,
  type          TEXT,
  time          TEXT,
  days_of_week  INTEGER[],
  is_active     BOOLEAN DEFAULT true,
  sound         TEXT,
  vibrate       BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients can view their own reminders"
    ON reminders FOR SELECT USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Patients can manage their own reminders"
    ON reminders FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Caregivers can view reminders for their patients"
    ON reminders FOR SELECT USING (
      EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = reminders.patient_id AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Caregivers can manage reminders for their patients"
    ON reminders FOR ALL
    USING (EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = reminders.patient_id AND cp.caregiver_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = reminders.patient_id AND cp.caregiver_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7e. therapist_relationships (026) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS therapist_relationships (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  therapist_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id        UUID REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  relationship_type TEXT NOT NULL DEFAULT 'primary'
                      CHECK (relationship_type IN ('primary', 'consulting', 'supervising', 'secondary')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE therapist_relationships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients can view their own therapist relationships"
    ON therapist_relationships FOR SELECT USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Therapists can view their own relationships"
    ON therapist_relationships FOR SELECT USING (therapist_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Caregivers can manage therapist relationships (P08)"
    ON therapist_relationships FOR ALL
    USING (EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = therapist_relationships.patient_id AND cp.caregiver_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = therapist_relationships.patient_id AND cp.caregiver_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Uses is_admin() (§3), not the inline subquery 026's own original draft
-- used — therapist_relationships is a different table than profiles, so the
-- inline form was never actually recursive there, but is_admin() is now
-- already defined and is the single consistent predicate this file uses
-- everywhere an admin bypass is needed.
DO $$ BEGIN
  CREATE POLICY "Admins can view all therapist relationships"
    ON therapist_relationships FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7f. patient-documents bucket + its storage policies (007) ──────────────
-- Bucket confirmed absent on production; patient_document_uploads TABLE
-- itself was not flagged as missing by the review, so only the bucket +
-- storage.objects policies are added here (the table/its own RLS policies
-- are assumed already live, per the review's silence on that table).
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-documents', 'patient-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Patients can manage their own document storage objects"
    ON storage.objects FOR ALL
    USING (bucket_id = 'patient-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'patient-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Caregivers can read their patients' document storage objects"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'patient-documents'
      AND EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id::text = (storage.foldername(name))[1] AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7g. patient-media / audio-files / music-files buckets (029) ────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('patient-media', 'patient-media', false, NULL, NULL),
  ('audio-files',   'audio-files',   false, 104857600, ARRAY['audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm']::text[]),
  ('music-files',   'music-files',   false, 262144000, NULL)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- §8 — caregiver_patients / patients: lock down direct INSERT, restore the
-- self-service GRANT (REVIEW P02 FIX — 024/A2), the one trusted admin
-- creation path with the NOT NULL fix (REVIEW P04 FIX), and the view
-- hardening done in place (REVIEW P07 FIX — ALTER VIEW, not DROP+CREATE).
-- ============================================================================
REVOKE INSERT ON public.caregiver_patients FROM authenticated;
DROP POLICY IF EXISTS "Caregivers can create relationships" ON caregiver_patients;
DROP FUNCTION IF EXISTS public.claim_unclaimed_patient(UUID, TEXT);

REVOKE INSERT ON public.patients FROM authenticated;
DROP POLICY IF EXISTS "Caregivers can create patients" ON patients;
DO $$ BEGIN
  CREATE POLICY "Patients can create their own patient record"
    ON patients FOR INSERT
    WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REVIEW P02 FIX (= migration 024's A2): a REVOKE removes the table-level
-- privilege entirely; the RLS policy above is unreachable for EVERY caller,
-- including a patient inserting their own row, until INSERT is re-GRANTed.
-- The policy's own `id = auth.uid()` check is the actual, sufficient
-- protection against an arbitrary caregiver inserting someone else's record
-- — this GRANT does not reopen that. Confirmed against
-- PatientIntakeForm.tsx's real self-service `.from('patients').upsert({id:
-- userId, ...})` call site, which is a direct table call, not the
-- create_patient_with_caregiver RPC.
GRANT INSERT ON public.patients TO authenticated;

ALTER TABLE caregiver_patients
  ADD COLUMN IF NOT EXISTS relationship_type TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- REVIEW P04 FIX: added p_first_name/p_last_name (NOT NULL in production,
-- no default) as required parameters, included in the INSERT. The
-- admin-only caller gate is UNCHANGED from this package's prior version —
-- that is migration 014's own deliberate SEC-003 fix (an ordinary caregiver
-- self-service path was found to have no verifiable trusted-authorization
-- mechanism and was closed on purpose, across several corrective rounds).
--
-- REVIEW ROUND 3 / item 1 — CORRECTED FINDING (an earlier pass of this
-- comment wrongly concluded "no fix needed"; that conclusion only showed
-- the ADMIN-initiated path is internally self-consistent — it did not
-- check whether a DISTINCT "ordinary caregiver initiates, admin reviews,
-- that same caregiver becomes linked after approval" workflow exists at
-- all. It does not, confirmed by a focused re-check, not assumed:
--   1. No admin screen reads or displays caregiver-submitted
--      `patient_intake` rows for review. `AdminPendingApprovals.tsx` (the
--      only "pending" admin screen in this codebase) is entirely about a
--      DIFFERENT concept — `profiles.role = 'pending'` self-service
--      signups awaiting role assignment (migration 022) — confirmed by
--      direct read; it has no reference to `patient_intake` at all.
--   2. The only two functions that would support this — `createPatientIntake()`
--      (captures a real, distinct `caregiver_profile_id`) and
--      `getCaregiverIntakes()` (would let an admin screen look them up) —
--      are dead code: `grep -rn` across the ENTIRE `src/` tree (not just
--      `src/pages`) finds zero call sites for either, anywhere.
--   3. Structurally, even a hypothetical admin-review screen could not
--      complete this today: this RPC has NO parameter for "which caregiver
--      to link" at all — `caregiver_id` is always `auth.uid()`, the
--      caller. There is no code path, reachable or not, capable of linking
--      an identified THIRD-PARTY caregiver to a patient.
--   4. If an ordinary (non-admin) caregiver attempts the one reachable
--      flow (`createAndProvisionPatient()`) today: intake Step 1 succeeds
--      (`patient_intake.caregiver_profile_id` = their real id, saved), but
--      Step 2B fails outright at this RPC's admin-only gate — leaving an
--      orphaned `patient_intake` row with no subsequent review or recovery
--      path. The caregiver sees "account creation failed" and nothing more
--      happens.
-- CONCLUSION: the ordinary-caregiver-initiates / admin-approves /
-- that-caregiver-becomes-linked workflow does NOT exist in this
-- application today, in any form — not a preserved design decision, a
-- missing feature. Building it (a trusted caregiver-selection mechanism +
-- an admin review surface) is new functionality outside this round's
-- scope ("do not redesign unrelated components") and is exactly the
-- "genuine patient-consent or admin-mediated mechanism, designed and
-- approved separately" migration 014 itself already named as an open,
-- unresolved product decision — not invented here. The admin-only caller
-- gate and the "no claiming an existing/already-complete patient by id
-- alone" protections below are UNCHANGED and NOT weakened by this finding.
CREATE OR REPLACE FUNCTION public.create_patient_with_caregiver(
  p_patient_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_preferred_name TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_diagnosis_date DATE DEFAULT NULL,
  p_dementia_stage TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_affirmation TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_emergency_contact_relationship TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_emergency_contact_email TEXT DEFAULT NULL,
  p_relationship_type TEXT DEFAULT 'primary'
) RETURNS patients AS $$
DECLARE
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_patient_id = auth.uid() THEN
    RAISE EXCEPTION 'A caregiver cannot create a patient record under their own account id';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may create a new patient record on behalf of another account. Caregiver self-service enrollment has no verifiable trusted-authorization mechanism yet and is not permitted through this path.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_patient_id AND role = 'patient' AND provisioning_status = 'profile_created'
  ) THEN
    RAISE EXCEPTION 'No patient profile pending provisioning exists for id %. This id must belong to an account currently mid-signup (provisioning_status = ''profile_created''), never an arbitrary or already-complete existing patient.', p_patient_id;
  END IF;

  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'p_first_name and p_last_name are required (patients.first_name/last_name are NOT NULL in production).';
  END IF;

  IF p_relationship_type NOT IN (
    'daughter', 'son', 'spouse', 'professional', 'friend', 'primary', 'secondary'
  ) THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF v_patient.id IS NOT NULL THEN
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END IF;

  BEGIN
    INSERT INTO patients (
      id, first_name, last_name, preferred_name, date_of_birth, diagnosis_date, dementia_stage, location, address,
      affirmation, emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_email
    ) VALUES (
      p_patient_id, p_first_name, p_last_name, p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage, p_location, p_address,
      COALESCE(p_affirmation, 'You are safe. You are loved. You are at home.'),
      p_emergency_contact_name, p_emergency_contact_relationship, p_emergency_contact_phone, p_emergency_contact_email
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END;

  INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary)
  VALUES (auth.uid(), p_patient_id, p_relationship_type, true)
  RETURNING * INTO v_link;

  RETURN v_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_patient_with_caregiver(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_patient_with_caregiver(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- REVIEW P07 FIX: ALTER VIEW in place (production's caregiver_patient_list
-- already exists with matching columns — do not DROP+CREATE it, which risks
-- dependent-object/privilege loss the review flagged). State-aware: a no-op
-- if already security_invoker.
DO $$
DECLARE v_already_secured BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'caregiver_patient_list' AND c.relkind = 'v'
      AND c.reloptions IS NOT NULL AND 'security_invoker=true' = ANY (c.reloptions)
  ) INTO v_already_secured;

  IF NOT v_already_secured AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'caregiver_patient_list' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.caregiver_patient_list SET (security_invoker = true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'caregiver_patient_list' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.caregiver_patient_list FROM PUBLIC, anon';
    EXECUTE 'GRANT SELECT ON public.caregiver_patient_list TO authenticated';
  END IF;
END $$;

DO $$
DECLARE v_already_secured BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'therapist_relationship_list' AND c.relkind = 'v'
      AND c.reloptions IS NOT NULL AND 'security_invoker=true' = ANY (c.reloptions)
  ) INTO v_already_secured;
  IF NOT v_already_secured AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'therapist_relationship_list' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.therapist_relationship_list SET (security_invoker = true)';
  END IF;
END $$;


-- ============================================================================
-- §9 — admin_set_subscription(): final version
-- REVIEW ROUND 2 / B1 FIX, SUPERSEDING THE PRIOR ROUND's P05 FIX: the prior
-- round's fix (RAISE EXCEPTION whenever p_program IS NULL AND
-- p_trial_ends_at IS NULL) was itself wrong — verified directly against
-- src/pages/admin/accountTypes.ts, the REAL admin UI this RPC serves: four
-- of its seven presets (daily_care, full_support, master, canceled) have
-- `trialDays: null`, and saveAccountType() passes that straight through as
-- `p_trial_ends_at: null`. The prior round's fix would have made the real
-- admin UI fail to assign ANY of those four account types. That file's own
-- comment (accountTypes.ts lines 262-267) confirms the actual, already-
-- intended design: "the migration makes the column nullable instead, so
-- 'canceled'/'companion' ... stop risking a constraint violation and
-- 'master' no longer needs the far-future placeholder" — i.e.
-- `subscriptions.trial_ends_at` is MEANT to be nullable, and NULL is the
-- correct, intentional representation of "does not expire on a trial
-- clock" for these presets. The second independent review's own read-only
-- production check confirms this directly: "Live has_active_subscription
-- (uuid) checks for a future OR NULL trial_ends_at" — NULL is a positively
-- handled, valid "active" state there, not an oversight.
-- FIX: §9a below makes the column nullable (idempotent if already so —
-- some earlier evidence in this chain, 011/013, asserted it was NOT NULL;
-- the review's live read and accountTypes.ts's own design comment both say
-- otherwise, and are trusted here as the more recent, directly-verified
-- evidence). The function then simply passes p_trial_ends_at through
-- (possibly NULL) for a non-program assignment, instead of either
-- defaulting it to "now" (the ORIGINAL bug) or refusing it outright (the
-- prior round's OVER-correction).
-- REVIEW P10 FIX (unchanged from prior round): no dynamic "discover and
-- drop every overload" block — production has no function of this name.
-- ============================================================================

-- §9a — REVIEW B1: subscriptions.trial_ends_at must accept NULL (the
-- intentional "no trial-clock expiry" representation for daily_care/
-- full_support/master/canceled presets). Idempotent regardless of current
-- nullability.
ALTER TABLE subscriptions ALTER COLUMN trial_ends_at DROP NOT NULL;

DROP FUNCTION IF EXISTS public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS public.admin_set_subscription(UUID, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);

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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  IF p_status NOT IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo') THEN
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
  ELSE
    -- REVIEW B1 FIX: pass through as-is, including NULL. NULL is the
    -- correct, intentional "no trial-clock expiry" value for daily_care/
    -- full_support/master/canceled (accountTypes.ts's own design, and
    -- has_active_subscription()'s confirmed real behavior treats NULL as
    -- valid/non-expiring) — not an error condition.
    v_trial_ends := p_trial_ends_at;
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


-- ============================================================================
-- §10 — redeem_promo_code(): REVIEW P12 FIX
-- (a) promo expiry now computed from the REDEMPTION moment (now()), not the
--     account's original signup/trial_started_at — the prior version let a
--     long-registered user redeem a promo that was already expired the
--     instant it was granted, since it back-dated the window to their old
--     signup date.
-- (b) the promo_codes row is locked (SELECT ... FOR UPDATE) before the
--     max_uses count check, serializing concurrent redemption attempts for
--     the SAME code against each other — the previous COUNT-then-INSERT had
--     a race window where multiple concurrent callers could each pass the
--     count check before any of their INSERTs committed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code TEXT)
RETURNS subscriptions AS $$
DECLARE
  v_promo promo_codes;
  v_email TEXT;
  v_existing_redemption_count INTEGER;
  v_already_redeemed_by_me INTEGER;
  v_current subscriptions;
  v_row subscriptions;
  v_promo_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  -- REVIEW P12(b): lock the code row for the duration of this transaction so
  -- concurrent redeem attempts for the same code serialize here rather than
  -- racing past the max_uses check below.
  SELECT * INTO v_promo FROM promo_codes WHERE code = upper(trim(p_code)) FOR UPDATE;
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

  -- REVIEW P12(a): expiry window starts at REDEMPTION time, not the
  -- account's historical trial_started_at.
  v_promo_expiry := now() + (v_promo.days || ' days')::interval;

  INSERT INTO subscriptions (user_id, tier, plan, program, status, trial_started_at, trial_ends_at, promo_code, promo_expires_at)
  VALUES (auth.uid(), v_promo.tier, v_promo.plan, NULL, 'promo', now(), v_promo_expiry, v_promo.code, v_promo_expiry)
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = v_promo.tier,
    plan              = v_promo.plan,
    program           = NULL,
    status            = 'promo',
    trial_started_at  = now(),
    trial_ends_at     = v_promo_expiry,
    promo_code        = v_promo.code,
    promo_expires_at  = v_promo_expiry,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.redeem_promo_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(TEXT) TO authenticated;


-- ============================================================================
-- §11 — 023: subscriptions dynamic PERMISSIVE-write drop (name-independent)
-- + RESTRICTIVE narrowing policies (safe) + the DEFERRED PERMISSIVE
-- caregiver-scope widening (REVIEW P08 — PLACEHOLDER, not fabricated)
-- ============================================================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND permissive = 'PERMISSIVE'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.subscriptions', pol.policyname);
  END LOOP;
END $$;

DO $$ BEGIN
  CREATE POLICY "Calm-Me videos are patient-owned only (FQA-017/SEC-006)"
    ON storage.objects AS RESTRICTIVE FOR ALL
    USING (
      bucket_id != 'music-files'
      OR (storage.foldername(name))[1] IS NULL
      OR (storage.foldername(name))[1] != 'videos'
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR public.is_admin()
    )
    WITH CHECK (
      bucket_id != 'music-files'
      OR (storage.foldername(name))[1] IS NULL
      OR (storage.foldername(name))[1] != 'videos'
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR public.is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER POLICY "Calm-Me videos are patient-owned only (FQA-017/SEC-006)"
  ON storage.objects
  USING (
    bucket_id != 'music-files'
    OR (storage.foldername(name))[1] IS NULL
    OR (storage.foldername(name))[1] != 'videos'
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id::text = (storage.foldername(name))[2] AND cp.caregiver_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    bucket_id != 'music-files'
    OR (storage.foldername(name))[1] IS NULL
    OR (storage.foldername(name))[1] != 'videos'
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id::text = (storage.foldername(name))[2] AND cp.caregiver_id = auth.uid()
    )
    OR public.is_admin()
  );

-- REVIEW ROUND 2 / B5 FIX: both tables are CONFIRMED to exist on production
-- (the independent review's own read-only catalog: care_partner_checkins =
-- 5 permissive + 4 restrictive policies already live; media_uploads = 3
-- permissive, 0 restrictive). The undefined_table/undefined_column lenient
-- fallbacks below (and throughout this section) have been REMOVED — this
-- file no longer catches those exceptions here. A genuinely unexpected
-- schema surprise on a security-critical patient-isolation policy must now
-- abort the whole transaction (uncaught exceptions propagate normally),
-- matching 14c's own stated "any required statement failure always aborts"
-- claim, which this leniency previously contradicted.
DROP POLICY IF EXISTS "Caller must be the check-in's own patient (FQA-019/SEC-008)" ON care_partner_checkins;
DROP POLICY IF EXISTS "Caller must be the media's own patient (FQA-019/SEC-008)" ON media_uploads;

DO $$ BEGIN
  CREATE POLICY "Checkin patient or linked caregiver (FQA-019/SEC-008)"
    ON care_partner_checkins AS RESTRICTIVE FOR INSERT
    WITH CHECK (
      patient_id = auth.uid()
      OR EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = care_partner_checkins.patient_id AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REVIEW P08 FIX: production's confirmed-live `media_insert` PERMISSIVE
-- policy is `uploader is caller OR is_admin_check()` — i.e. an admin can
-- already upload media for ANY patient today, not only a patient they are
-- personally linked to as caregiver. A RESTRICTIVE policy here with only
-- `patient_id = auth.uid() OR linked caregiver` (no admin clause) would
-- NARROW that already-existing admin capability — a regression this file
-- must not introduce. `is_admin_check()` is referenced, therefore already
-- defined, on production; this references it by name rather than
-- introducing a second, possibly-divergent admin-check function for this
-- one policy.
-- is_admin_check() is referenced (not defined) here — confirmed live on
-- production (it's referenced by media_insert/media_select/media_delete/
-- patient_media_* themselves, so it must already exist for those to have
-- been created at all; 14a's preflight Q5 also now checks for it
-- explicitly). If it were somehow absent, this statement fails and aborts
-- the transaction (REVIEW B5: no undefined_function leniency here either)
-- rather than silently installing a policy that omits the admin bypass.
DO $$ BEGIN
  CREATE POLICY "Media patient or linked caregiver (FQA-019/SEC-008)"
    ON media_uploads AS RESTRICTIVE FOR INSERT
    WITH CHECK (
      patient_id = auth.uid()
      OR EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = media_uploads.patient_id AND cp.caregiver_id = auth.uid())
      OR public.is_admin_check()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- care_partner_checkins' own confirmed PERMISSIVE INSERT policies
-- ("Authenticated users can insert checkins" / "...insert_own_submission")
-- check ONLY `submitted_by = auth.uid()` — neither mentions
-- is_admin_check() — so admin has no existing INSERT bypass to preserve
-- here; the RESTRICTIVE policy above (patient_id = self OR linked
-- caregiver, no admin clause) narrows nothing admin could already do.

-- ============================================================================
-- REVIEW P08 FIX — caregiver SELECT (both tables) and the storage.objects
-- caregiver SELECT/INSERT/DELETE for patient-media, using the real
-- production policy catalog supplied in the FINAL MIGRATION CLOSURE
-- follow-up:
--   care_partner_checkins: "Authenticated users can insert checkins" (INSERT,
--     submitted_by=caller), "care_partner_checkins_insert_own_submission"
--     (INSERT, same), "Users can read checkins linked to them" (SELECT,
--     patient=caller OR submitter=caller), "care_partner_checkins_select_
--     own_patient" (SELECT, patient=caller), "care_partner_checkins_update_
--     own_submission" (UPDATE, submitter=caller) — 5 PERMISSIVE policies.
--   media_uploads: media_insert (INSERT, uploader=caller OR
--     is_admin_check()), media_select (SELECT, patient=caller OR
--     uploader=caller OR is_admin_check()), media_delete (DELETE,
--     uploader=caller OR is_admin_check()) — 3 PERMISSIVE policies.
--   storage.objects: patient_media_select/insert/delete (patient's own
--     folder OR is_admin_check()) — PRESERVED UNTOUCHED below; new policies
--     are added under new names rather than altering these, since this file
--     has only a paraphrase of their exact USING/WITH CHECK text, not the
--     literal SQL, and `ALTER POLICY` would require the exact expression.
--
-- REVIEW ROUND 2 / B3 CORRECTION: the second independent review's own live
-- catalog read additionally found care_partner_checkins already carries 4
-- RESTRICTIVE policies today (this file's own earlier count of "5 total
-- confirmed policies" for that table was wrong — it is 5 PERMISSIVE + 4
-- RESTRICTIVE = 9 before this migration runs). Their exact names/predicates
-- are not known to this file (only the count and permissive/restrictive
-- split). This does not change the SAFETY of the two new policies below —
-- RESTRICTIVE policies only ever narrow, so any number of unknown existing
-- ones can only further constrain what these new PERMISSIVE additions
-- actually permit, never let them exceed their own intended scope — but it
-- DOES mean the caregiver-SELECT addition's actual functional effect is not
-- fully predictable from this file alone if any of those 4 unknown
-- RESTRICTIVE policies also apply to SELECT (not just INSERT/UPDATE/
-- DELETE). Confirm their exact `cmd`/predicates via 14a preflight Q2
-- (already fetches all policies, permissive and restrictive, for this
-- table) before treating the caregiver-read functional outcome as fully
-- verified — the SAFETY property above holds regardless either way.
--
-- CONFIRMED GAP: neither table's existing SELECT policies, and none of the
-- three storage.objects policies, grant a linked-but-not-submitting/
-- uploading caregiver read access to their patient's checkins/media, nor
-- storage access to their patient's media folder at all. INSERT at the
-- TABLE level for both tables already works for a linked caregiver via the
-- existing broad PERMISSIVE policy (submitted_by/uploader = caller) ANDed
-- with the RESTRICTIVE narrowing just above — no new table-level INSERT
-- policy is needed. The STORAGE-level INSERT gap is real, though: a
-- caregiver uploading to `patient-media/<patientId>/...` where patientId is
-- not their own auth.uid() fails patient_media_insert's own-folder check
-- today, so the upload's actual storage write would fail even though the
-- DB-row insert would now succeed — closed below.
--
-- Every policy below is a NEW, separately-named PERMISSIVE addition. None
-- of the existing policies per table/bucket above (9 care_partner_checkins,
-- 3 media_uploads, 3 patient_media_select/insert/delete) are dropped,
-- altered, or duplicated. Any existing Temporary User RESTRICTIVE policy on
-- these tables/bucket is unaffected by construction — RESTRICTIVE policies
-- AND into the overall check regardless of how many PERMISSIVE policies
-- exist, so adding a new PERMISSIVE policy here cannot bypass a RESTRICTIVE
-- one this file does not touch (confirmed by dry-run: an active Temporary
-- User was still correctly denied after these additions).
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Linked caregivers can read their patients' checkins (P08)"
    ON care_partner_checkins FOR SELECT
    USING (EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = care_partner_checkins.patient_id AND cp.caregiver_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Linked caregivers can read their patients' media (P08)"
    ON media_uploads FOR SELECT
    USING (EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id = media_uploads.patient_id AND cp.caregiver_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Linked caregivers can read patient-media storage objects (P08)"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'patient-media'
      AND EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id::text = (storage.foldername(name))[1] AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Linked caregivers can upload patient-media objects (P08)"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'patient-media'
      AND EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id::text = (storage.foldername(name))[1] AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DELETE: without this, a caregiver could delete their own media_uploads
-- row (table-level "uploader is caller" already covers that — no table
-- change needed) but not the underlying storage object itself, leaving an
-- orphaned file. Scoped identically to the select/insert pair above.
DO $$ BEGIN
  CREATE POLICY "Linked caregivers can delete patient-media objects (P08)"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'patient-media'
      AND EXISTS (SELECT 1 FROM caregiver_patients cp WHERE cp.patient_id::text = (storage.foldername(name))[1] AND cp.caregiver_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §12 — subscriptions: close the table-GRANT path independent of RLS (029)
-- Narrowing/self-contained.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- §13 — REVIEW ROUND 3 / item 2: Free Tier entitlement discrepancy
-- Production has 16 subscriptions rows with tier='free_tier', status=
-- 'active', trial_ends_at already in the past. has_active_subscription()
-- (per both independent reviews' own live reads) requires trial_ends_at to
-- be NULL or in the future even for status='active' — so these 16 accounts
-- currently register as inactive despite being legitimately, permanently
-- free. Root cause, confirmed by direct read of this engagement's own
-- tracked provision_free_subscription() (013): ordinary free-tier
-- self-provisioning has ALWAYS written trial_ends_at = now() (the exact
-- same "immediately expired" shape REVIEW B1 already fixed for the
-- admin-grant path) — free tier was never meant to carry a trial-clock
-- expiry at all, it just inherited one from the same column every tier
-- uses for different reasons.
--
-- CONSTRAINT: "do not modify live user records" — no UPDATE statement
-- touches the 16 existing rows' data anywhere below. The fix is entirely
-- at the ENTITLEMENT-LOGIC layer (so the 16 existing rows are correctly
-- read as active without their stored values changing) plus the
-- PROVISIONING layer (so no new row ever recreates this same problem
-- going forward).
-- ============================================================================

-- §13a — going forward: ordinary free-tier self-provisioning no longer
-- writes a now()-valued trial_ends_at (the root cause). Matches B1's
-- already-established "NULL = no trial-clock expiry" model exactly.
-- State-aware: only touches this specific, narrowly-scoped, no-argument
-- function if it already exists (production may already have it under
-- this exact name, per 013's own design — it was never confirmed absent
-- by either review, unlike admin_set_subscription); if present, its
-- signature cannot differ (no arguments), so CREATE OR REPLACE is safe
-- regardless of its current body. If NOT present, this creates it fresh.
CREATE OR REPLACE FUNCTION public.provision_free_subscription()
RETURNS subscriptions AS $$
DECLARE
  v_row subscriptions;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at)
  VALUES (auth.uid(), 'free_tier', 'active', v_now, NULL)
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

-- §13b — the 16 existing rows: fixed by correcting the ENTITLEMENT CHECK,
-- not the data. Defensive precondition FIRST: if has_active_subscription()'s
-- real current definition does not match what BOTH independent reviews
-- described (referencing trial_ends_at and status, matching 'active'/
-- 'trialing'/'promo'), this ABORTS rather than blindly overwriting unknown
-- logic — the same discipline REVIEW B2 established for is_admin(), applied
-- here because this function is even more central (the actual entitlement
-- gate) and guessing wrong risks exactly what this item warns against:
-- inadvertently granting indefinite access somewhere it shouldn't.
DO $$
DECLARE
  v_current_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_current_def
  FROM pg_proc WHERE proname = 'has_active_subscription';

  IF v_current_def IS NULL THEN
    RAISE EXCEPTION 'public.has_active_subscription(uuid) not found. This fix assumes it already exists (per both independent reviews'' own confirmed live reads) and only ADDS one condition to it — it does not define this function''s full behavior from scratch. Aborting rather than guessing. Reconcile manually: confirm the real function name/signature and write this fix against its actual body.';
  END IF;

  IF v_current_def NOT ILIKE '%trial_ends_at%' OR v_current_def NOT ILIKE '%status%' THEN
    RAISE EXCEPTION 'public.has_active_subscription(uuid)''s current definition does not reference trial_ends_at/status as both independent reviews described. Aborting rather than overwriting unknown logic. Current definition: %', v_current_def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing', 'promo')
      AND (
        s.trial_ends_at IS NULL
        OR s.trial_ends_at > now()
        -- REVIEW ROUND 3 / item 2: an ordinary, non-program free_tier grant
        -- was never meant to be trial-clock-limited — only a genuine trial/
        -- promo window, or a Temporary User / Companion PROGRAM (program IS
        -- NOT NULL), is. This clause explicitly excludes program rows via
        -- `program IS NULL` — a temp_user/companion row with an expired
        -- trial_ends_at is NOT exempted by this clause and must still pass
        -- the trial_ends_at check above exactly as before. This is the
        -- confirmed root cause of the 16-row discrepancy: ordinary free
        -- tier inherited a trial-clock column it was never supposed to be
        -- gated by.
        OR (s.tier = 'free_tier' AND s.program IS NULL)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.has_active_subscription IS 'REVIEW ROUND 3 / item 2: additive fix — ordinary free_tier/no-program rows are active regardless of trial_ends_at (permanent free access was never meant to be trial-clock-gated). Temporary User / Companion programs (program IS NOT NULL) and genuine trial/promo windows are UNAFFECTED and still correctly expire via trial_ends_at. No existing row''s stored data is modified by this fix.';


-- ============================================================================
-- §14 — REVIEW ROUND 3 / item 3: paid-to-free downgrade data-access
-- preservation, verified using migration 016's own already-designed,
-- already-test-matrixed mechanism (never previously included in this
-- package — a genuine gap, not a new invention this round).
--
-- VERIFIED, not assumed: this package's own §7d `reminders` policies
-- (patient ownership / caregiver-link only, no tier check) were checked
-- against this exact requirement and found to ALREADY correctly allow full
-- read/write access to existing reminders regardless of current tier — no
-- change needed there. The deliberate absence of a reminders WRITE gate is
-- not an oversight: migration 016's own evidence (`grep -rn
-- "from('reminders')" src/` — reconfirmed this round) shows zero
-- patient-initiated INSERT/UPDATE/DELETE call sites anywhere in tracked
-- application code; adding a write restriction would be guessing at a
-- write path that may not exist. `memories` and `care_partner_checkins`
-- are the only two tables this engagement can confirm a real,
-- patient-initiated write path for (CarePartnerCheckin.tsx's own INSERT
-- call site; `memories` confirmed defined with a `patient_id` column in
-- 001_initial_schema.sql, the original production schema).
--
-- DESIGN (unchanged from 016): a RESTRICTIVE policy, INSERT-only, keyed on
-- the PATIENT's OWN entitlement (not the caller's) — SELECT/UPDATE/DELETE
-- on rows a patient or caregiver already legitimately created are
-- completely untouched by this section, regardless of the patient's
-- CURRENT tier. This is exactly "previously authorized patient data
-- remains accessible following a paid-to-free downgrade, while creation of
-- new paid-only records is still blocked" — the INSERT-only scope is the
-- mechanism that guarantees the first half of that sentence, not an
-- afterthought.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.patient_has_paid_entitlement(p_patient_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_patient_id
      AND s.tier IN ('paid_tier', 'master')
      AND (
        s.status = 'active'
        OR (s.status = 'promo' AND (s.promo_expires_at IS NULL OR s.promo_expires_at > now()))
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.patient_has_paid_entitlement(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_has_paid_entitlement(UUID) TO authenticated;

DO $$ BEGIN
  CREATE POLICY "Free-tier accounts cannot create new memories (REPAIR C)"
    ON memories
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (public.patient_has_paid_entitlement(patient_id));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN
    RAISE NOTICE 'memories does not exist in this database — skipped.';
END $$;

-- care_partner_checkins is CONFIRMED to exist (both independent reviews'
-- own live reads) — matching REVIEW B5's discipline, no undefined_table
-- leniency is needed or used here.
DO $$ BEGIN
  CREATE POLICY "Free-tier checkins blocked (REPAIR C)"
    ON care_partner_checkins
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (public.patient_has_paid_entitlement(patient_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ============================================================================
-- STILL REQUIRED BEFORE PRODUCTION RELEASE (not resolved by this file):
--   1. is_temp_user()/is_temp_user_expired() real bodies — the second
--      independent review confirms these are already known/read by that
--      review ("The real Temporary User helper bodies are known") but their
--      text was not included in what reached this file's author. This file
--      still does not redefine either function.
--   2. Stripe Daily Care/Full Support plan-identity owner decision.
--   3. RESOLVED THIS ROUND (§13): the 16-row free-tier discrepancy is fixed
--      at the entitlement-logic/provisioning layer, not by touching the 16
--      rows' data. §13's own defensive precondition check means this
--      ABORTS (not silently misapplies) if has_active_subscription()'s real
--      body turns out not to match what both independent reviews described
--      — confirm via 14a's Q4 before running.
--   4. EXISTING DESIGN QUESTION, NOT CAUSED BY THIS MIGRATION, NOT CHANGED
--      HERE, NOT ASKED FOR THIS ROUND: care_partner_checkins' and
--      media_uploads' existing SELECT policies (`submitted_by = auth.uid()`
--      / `uploader_id = auth.uid()`) let a caregiver who SUBMITTED/UPLOADED
--      something keep reading it even after their caregiver_patients link
--      to that patient is later revoked — those policies already exist,
--      independent of this migration, and this file never touches,
--      narrows, or removes them (doing so would be a scope decision
--      outside "preserve existing production data and authorization
--      policies"). Still flagged for an explicit owner decision on whether
--      retained contributor access is intentional — distinct from item 3's
--      resolved question (§14), which is specifically about blocking NEW
--      paid-only record creation post-downgrade, not about read access to
--      content a caregiver personally contributed.
--   5. CONFIRMED GENUINE GAP, NOT A PRESERVED DESIGN DECISION — OWNER
--      DECISION REQUIRED: P04's admin-vs-caregiver linkage, re-investigated
--      after a follow-up correctly noted the first pass only showed the
--      admin-initiated path is self-consistent, not that an ordinary
--      caregiver can initiate registration and become linked after admin
--      approval. It cannot, today: no admin screen reviews caregiver-
--      submitted `patient_intake` rows (`AdminPendingApprovals.tsx` is
--      about an unrelated `profiles.role='pending'` concept);
--      `createPatientIntake()`/`getCaregiverIntakes()` (the only functions
--      that would support this) are dead code, zero call sites anywhere in
--      `src/`; and structurally, create_patient_with_caregiver() has no
--      parameter to link any caregiver other than its own caller. Building
--      this is new functionality (a trusted caregiver-selection mechanism +
--      an admin review surface) — exactly the "genuine patient-consent or
--      admin-mediated mechanism, designed and approved separately"
--      migration 014 already named as an open product decision, not
--      invented or built here. No code change made; the admin-only gate
--      and existing-patient-claim protection are unchanged.
--   6. This file has been dry-run against a LOCAL, isolated, disposable
--      Postgres 17 container with a reconstructed production-shaped schema
--      (zero real customer data, zero connection to any Supabase project) —
--      not against the real staging or production project. It has NOT been
--      run against axurszlibxwwptkczztt or ktehhvmmwnsbcvpjcmzt themselves;
--      this session still has no service-role credential for either (see
--      13_STAGING_PROVISIONING_AND_AUTHORIZATION_TEST_PROCEDURE.md §3).
--   7. A rollback plan and backup/restore verification in hand before
--      execution — see 14c_PRODUCTION_ROLLBACK_AND_DEPLOYMENT_NOTES.md.
--   8. Reviewed merge of remediation/mymemoria-functional-001 into main,
--      coordinated with the matching Vercel deploy.
-- Decision, unchanged: PRODUCTION RELEASE NOT YET AUTHORIZED.
-- ============================================================================
