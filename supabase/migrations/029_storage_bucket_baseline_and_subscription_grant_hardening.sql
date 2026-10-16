-- 029_storage_bucket_baseline_and_subscription_grant_hardening.sql
-- MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — staging-verified 2026-10-16.
--
-- PROPOSAL ONLY — NOT EXECUTED. Two independent corrections, bundled here
-- because both were confirmed necessary by the same staging test pass and
-- neither has an existing home in this migration chain.

-- ============================================================
-- 1. Storage bucket baseline: patient-media, audio-files, music-files
-- ============================================================
-- No tracked migration (001-028) ever creates these three buckets —
-- `patient-documents` (007) is the only bucket this chain creates. They
-- are assumed to already exist live on production (confirmed by the
-- production audit's own storage table) but staging had none of them
-- before this round. Settings below match the production audit's
-- confirmed real values exactly (size limits, MIME restrictions).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('patient-media', 'patient-media', false, NULL, NULL),
  ('audio-files',   'audio-files',   false, 104857600, ARRAY['audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm']::text[]),
  ('music-files',   'music-files',   false, 262144000, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── music-files: base PERMISSIVE policies ──────────────────────────────
-- Recreates production's EXISTING, already-live music-files behavior
-- (confirmed via the production audit: "authenticated SELECT/INSERT/
-- UPDATE/DELETE policies constrain only bucket_id; any signed-in actor
-- can act on another user's known object path") — bucket-wide, not
-- per-patient. This is not a new, wider grant being introduced; it is the
-- ALREADY-LIVE production behavior, needed here only because staging had
-- no policy on this bucket at all before this round (nothing to test
-- 023's own narrower Calm-Me-video RESTRICTIVE layer against). 023's
-- RESTRICTIVE policy (ANDed on top of this) remains the actual protection
-- for video content specifically; this file does not narrow or widen that.
DO $$ BEGIN
  CREATE POLICY "Allow authenticated select from music-files"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'music-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Allow authenticated uploads to music-files"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'music-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Allow authenticated update from music-files"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'music-files') WITH CHECK (bucket_id = 'music-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Allow authenticated delete from music-files"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'music-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── patient-media: patient + linked caregiver + admin ──────────────────
-- Production's confirmed real shape (audit: "patient-media SELECT/INSERT/
-- DELETE allows first folder auth.uid() or is_admin_check(); no UPDATE
-- policy") used `is_admin_check()` — a function name never confirmed to
-- exist outside production. Staging verification used `is_admin()`
-- instead (the function this chain's own 024_release_blocker_closure_
-- phase_a.sql creates) and confirmed it tested correctly; adopted here for
-- the same reason. A linked-caregiver clause is ADDED beyond the audit's
-- literal description — tested and confirmed necessary for the owner's
-- preserved caregiver media-access requirement (same pattern as 023's
-- Calm-Me video caregiver fix). No UPDATE policy is added, matching
-- production's own confirmed absence of one — not an oversight.
DO $$ BEGIN
  CREATE POLICY "patient_media_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'patient-media' AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id::text = split_part(storage.objects.name, '/', 1)
          AND cp.caregiver_id = auth.uid()
      )
      OR public.is_admin()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "patient_media_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'patient-media' AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id::text = split_part(storage.objects.name, '/', 1)
          AND cp.caregiver_id = auth.uid()
      )
      OR public.is_admin()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "patient_media_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'patient-media' AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM caregiver_patients cp
        WHERE cp.patient_id::text = split_part(storage.objects.name, '/', 1)
          AND cp.caregiver_id = auth.uid()
      )
      OR public.is_admin()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. subscriptions: close the table-GRANT path, independent of RLS
-- ============================================================
-- RLS already has zero PERMISSIVE write policy on this table (011/023),
-- so a write attempt is already denied today regardless of this GRANT.
-- This is still a real, confirmed gap: the `authenticated` role (and
-- PUBLIC/anon) retained table-wide INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER privilege at the GRANT layer — a second, independent
-- authorization layer in Postgres. Closing it means a future accidental
-- PERMISSIVE policy (e.g. a careless `FOR ALL USING (true)` added without
-- realizing its consequence) would still be blocked by the GRANT alone,
-- rather than becoming the ONLY thing standing between any authenticated
-- user and arbitrary subscription writes. SELECT is deliberately left
-- untouched (needed for SubscriptionContext.can()/tier/isActive), as is
-- every privilege held by `service_role` (the Stripe webhook's own
-- connection, which bypasses RLS and is unaffected by this REVOKE
-- regardless).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;

-- ============================================================
-- STAGING VERIFICATION
-- ============================================================
-- Postcondition confirmed in staging: `authenticated` role on
-- `subscriptions` — INSERT=false, UPDATE=false, SELECT=true; zero
-- PERMISSIVE write policies. PASS.
-- music-files/patient-media: tested with patient A, patient B (unrelated),
-- and caregiver C against temporary, rollback-only metadata records (no
-- real storage objects). Unrelated-patient access denied; caregiver and
-- owning-patient access permitted; shared (non-video) music-files content
-- remained readable. PASS at the PostgreSQL Storage RLS layer. NOT yet
-- verified: live file upload, signed URL issuance, or Android storage
-- integration — SQL/RLS policy testing is not full application
-- acceptance.
