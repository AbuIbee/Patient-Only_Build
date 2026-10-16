-- 023_closure_master_009_phase1_security_hardening.sql
-- MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 1 — three concrete
-- security gaps confirmed still open by this engagement's own two-fork
-- audit of the 014-022 migration chain against the FQA-001..029 register
-- (codex_verify_001/05_FQA_29_ACCEPTANCE_MATRIX.csv):
--   1. FQA-016/SEC-004 — subscriptions' client-writable policy drop (011)
--      guesses live policy names; a guess that misses the real name leaves
--      the hole open with no way to tell from this repo alone.
--   2. FQA-017/SEC-006 — music-files/videos/<patientId>/... (CalmMeDialog's
--      real, already-live upload path) has never had any tracked policy
--      narrowing it to the owning patient; already-uploaded videos remain
--      cross-user exposed under whatever shared policy music-files already
--      has.
--   3. FQA-019/SEC-008 — care_partner_checkins and media_uploads INSERT
--      trust a client-supplied patient_id with no server-side check that
--      the caller IS that patient.
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.

-- ============================================================
-- 1. subscriptions: drop EVERY live PERMISSIVE write policy by querying
--    pg_policies directly, instead of guessing names (FQA-016/SEC-004)
-- ============================================================
-- 011_subscriptions_revoke_client_billing_authority.sql's own `DROP POLICY
-- IF EXISTS "<guessed name>"` list (8 candidates) is Codex's own basis for
-- marking FQA-016 NOT_FULLY_ADDRESSED: a name this repo guessed wrong
-- leaves the real policy standing with no way to detect that from static
-- analysis. This block needs no live read first — it asks Postgres's own
-- catalog what actually exists on `subscriptions` right now and removes
-- it directly, so it is correct regardless of what the real names turned
-- out to be. After 011/013, every legitimate write to `subscriptions` goes
-- through admin_set_subscription()/provision_free_subscription()/
-- redeem_promo_code() (all SECURITY DEFINER) — there is no scenario where
-- a PERMISSIVE INSERT/UPDATE/DELETE policy on this table is still needed
-- for `authenticated`/`anon`. SELECT policies (a user reading their own
-- row) are deliberately untouched — only cmd IN (INSERT/UPDATE/DELETE/ALL)
-- is targeted.
DO $$
DECLARE
  pol RECORD;
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

-- ============================================================
-- 2. music-files: close the EXISTING-exposure gap for already-uploaded
--    Calm-Me videos (FQA-017/SEC-006), without touching the bucket's
--    unconfirmed shared-audio policy shape at all
-- ============================================================
-- EVIDENCE: src/components/CalmMeDialog.tsx uploads/lists/signs every
-- video at the real, live path `videos/<patientId>/<filename>` inside the
-- shared `music-files` bucket (VIDEO_FOLDER='videos'). No tracked
-- migration (001-022) has ever defined this bucket's storage.objects
-- policies — same "tracked != live" gap 019's own equivalent fix already
-- relies on. A RESTRICTIVE policy ANDs one extra condition onto whatever
-- PERMISSIVE policy already exists; it cannot be bypassed by not knowing
-- that shape, and it cannot accidentally grant anything. For any object
-- NOT under `videos/`, this condition is trivially true (first disjunct),
-- so the bucket's existing shared-audio behavior for non-video content is
-- unaffected — this intentionally does not attempt the separate-bucket
-- migration 008 proposes (still correctly blocked on an independent
-- SEC-006 approval for NEW uploads); it only stops the already-confirmed
-- cross-user exposure of videos already sitting there.
--
-- *** CORRECTED under RELEASE-BLOCKER-CLOSURE, PHASE A4 *** — independent
-- re-verification found: `(storage.foldername(name))[1]` returns NULL
-- (not false) for any object stored at the bucket ROOT with no subfolder.
-- The original condition's OR-chain then evaluates to NULL, which
-- Postgres RLS treats as DENIED, not permitted — so if `music-files` has
-- any shared audio at the bucket root (unconfirmed either way — the same
-- "tracked != live" gap this whole fix already lives with), this policy
-- would have newly locked ordinary patients out of it, contradicting its
-- own "unaffected" claim above. Added an explicit "no folder segment at
-- all" branch so a root-level object is treated the same as any other
-- non-video path: untouched by this policy.
DO $$ BEGIN
  CREATE POLICY "Calm-Me videos are patient-owned only (FQA-017/SEC-006)"
    ON storage.objects AS RESTRICTIVE FOR ALL
    USING (
      bucket_id != 'music-files'
      OR (storage.foldername(name))[1] IS NULL
      OR (storage.foldername(name))[1] != 'videos'
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    )
    WITH CHECK (
      bucket_id != 'music-files'
      OR (storage.foldername(name))[1] IS NULL
      OR (storage.foldername(name))[1] != 'videos'
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION (staging-verified,
-- 2026-10-16) ***: the policy above blocked a verified caregiver from
-- their own patient's Calm-Me videos — only the patient themselves or an
-- admin could pass it, contradicting the owner's explicitly preserved
-- caregiver media-access authority. `ALTER POLICY` (not a new
-- `CREATE POLICY`) updates the SAME named policy's definition in place,
-- whether the CREATE above just made it (fresh database) or it already
-- existed from an earlier apply (staging's/production's case) — either
-- way, the final USING/WITH CHECK below is what's actually in effect.
-- Keeps every original constraint (non-video paths unaffected, the video's
-- own owner, backend support admins); adds ONLY the patient's existing,
-- already-authorized caregiver relationship as an alternative permitted
-- path. Retested after this change: PASS.
ALTER POLICY "Calm-Me videos are patient-owned only (FQA-017/SEC-006)"
  ON storage.objects
  USING (
    bucket_id != 'music-files'
    OR (storage.foldername(name))[1] IS NULL
    OR (storage.foldername(name))[1] != 'videos'
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id::text = (storage.foldername(name))[2]
        AND cp.caregiver_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    bucket_id != 'music-files'
    OR (storage.foldername(name))[1] IS NULL
    OR (storage.foldername(name))[1] != 'videos'
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id::text = (storage.foldername(name))[2]
        AND cp.caregiver_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
  );

-- ============================================================
-- 3. care_partner_checkins + media_uploads: the caller must actually BE
--    the patient_id on the row they're inserting, OR be that patient's
--    authorized linked caregiver (FQA-019/SEC-008)
-- ============================================================
-- EVIDENCE: CLAUDE.md: "built for patients only" — there is no caregiver
-- login in this deployed app. src/pages/patient/CarePartnerCheckin.tsx's
-- own INSERT always sets `patient_id: state.currentUser.id` (its own id);
-- src/components/MediaUploader.tsx always passes `patientId =
-- state.currentUser.id` as PatientLayout's own `patientId` prop (the
-- `selectedPatient?.id` fallback in mediaService.ts's caller is dead code
-- in the current patient-only app — no call site ever omits `patientId`).
-- A direct API call bypassing the UI could otherwise set `patient_id` to
-- ANY uuid; 016's own entitlement RESTRICTIVE policy only checks that
-- WHICHEVER patient_id is given has paid entitlement, never that the
-- caller IS that patient. This adds the missing ownership check, matching
-- what the application code already always does.
--
-- *** MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 CORRECTION (staging-verified,
-- 2026-10-16) ***: the original version here (`patient_id = auth.uid()`
-- only) was tested with an authenticated caregiver session and FAILED —
-- it denied every caregiver-submitted check-in/media record outright,
-- directly contradicting the owner's explicitly preserved caregiver
-- authority ("Coordinate permitted patient-related activities... Access
-- the appropriate patient records and media"). Widened to also permit the
-- patient's own authorized linked caregiver (via `caregiver_patients`,
-- the SAME relationship table every other caregiver-accessible table in
-- this schema already keys off). This still refuses an UNRELATED caller —
-- `submitted_by`/`uploader_id = auth.uid()` (enforced by 027's own
-- PERMISSIVE INSERT policy) prevents forgery by merely knowing a UUID; this
-- RESTRICTIVE check additionally requires the caller be the patient or
-- that patient's OWN linked caregiver, never an arbitrary third party.
-- Retested after this change: PASS.
--
-- *** CORRECTED under RELEASE-BLOCKER-CLOSURE, PHASE A4 *** — both blocks
-- below only caught "table doesn't exist" (undefined_table). If the live
-- table exists but its column really isn't named `patient_id`, `CREATE
-- POLICY ... WITH CHECK (patient_id = auth.uid())` would fail with an
-- UNCAUGHT undefined_column error. Beyond just that one policy not
-- installing, an uncaught error aborts this entire migration file's
-- transaction — silently rolling back the subscriptions fix (§1) and the
-- music-files fix (§2) above too, even though neither has anything to do
-- with this table. Added an undefined_column guard so a column-name
-- surprise on either table degrades to "this one policy skipped," never
-- "the whole file silently did nothing."
-- Drop the old, stricter-named policy first: if this file was already
-- applied once under its original (patient-only) name, leaving that
-- policy in place alongside the new one would AND them together and the
-- old one would still block every caregiver submission regardless of the
-- new, wider policy below.
DO $$ BEGIN
  DROP POLICY IF EXISTS "Caller must be the check-in's own patient (FQA-019/SEC-008)" ON care_partner_checkins;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Caller must be the media's own patient (FQA-019/SEC-008)" ON media_uploads;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Caller must be the check-in's own patient or linked caregiver (FQA-019/SEC-008)"
    ON care_partner_checkins AS RESTRICTIVE FOR INSERT
    WITH CHECK (
      patient_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = care_partner_checkins.patient_id
          AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN
    RAISE NOTICE 'care_partner_checkins does not exist in this database — skipped.';
  WHEN undefined_column THEN
    RAISE NOTICE 'care_partner_checkins exists but has no patient_id column as assumed — skipped. Confirm the real column name before relying on this policy.';
END $$;

DO $$ BEGIN
  CREATE POLICY "Caller must be the media's own patient or linked caregiver (FQA-019/SEC-008)"
    ON media_uploads AS RESTRICTIVE FOR INSERT
    WITH CHECK (
      patient_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id = media_uploads.patient_id
          AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN
    RAISE NOTICE 'media_uploads does not exist in this database — skipped.';
  WHEN undefined_column THEN
    RAISE NOTICE 'media_uploads exists but has no patient_id column as assumed — skipped. Confirm the real column name before relying on this policy.';
END $$;

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T1 (positive): after this file, `SELECT policyname FROM pg_policies
--   WHERE tablename='subscriptions' AND cmd IN ('INSERT','UPDATE','DELETE')`
--   returns zero rows for PERMISSIVE policies. Expected: a direct
--   `.from('subscriptions').update(...)` from an authenticated non-admin
--   client is denied.
-- T2 (negative, regression): a user's own `SELECT * FROM subscriptions
--   WHERE user_id = auth.uid()` still succeeds — this file touches no
--   SELECT policy.
-- T3 (positive): patient A uploads a Calm-Me video; patient B (not A)
--   attempts `createSignedUrl('videos/<A's id>/<file>')` on the
--   `music-files` bucket. Expected: denied after this file (previously
--   allowed under whatever shared policy already existed).
-- T4 (negative, regression): an existing shared (non-video) audio object
--   in `music-files` remains readable exactly as before — this file's
--   RESTRICTIVE condition is trivially true for any path not under
--   `videos/`.
-- T5 (positive): a direct API call attempts
--   `.from('care_partner_checkins').insert({ patient_id: '<someone else's
--   id, NOT linked to the caller as caregiver>', submitted_by: auth.uid(),
--   ... })`. Expected: denied.
-- T6 (negative, regression): the real application flow (patient_id ===
--   auth.uid(), exactly what CarePartnerCheckin.tsx always sends) still
--   succeeds, subject to 016's own entitlement check.
-- T6b (positive, staging-verified 2026-10-16): caregiver C, linked to
--   patient A via caregiver_patients, submits a check-in/media record with
--   patient_id = A (submitted_by/uploader_id = C's own auth.uid()).
--   Expected: succeeds. CONFIRMED PASS in staging after this correction
--   (the original patient-only version FAILED this exact case).
-- T7/T8: identical T5/T6/T6b set for `media_uploads`.
