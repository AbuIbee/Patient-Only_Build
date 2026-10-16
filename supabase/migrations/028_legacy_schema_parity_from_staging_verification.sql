-- 028_legacy_schema_parity_from_staging_verification.sql
-- MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — columns confirmed missing from
-- this migration chain by staging's read-only comparison against real
-- production `information_schema` (types, nullability, defaults) on
-- 2026-10-16. No customer record data was copied to produce this file;
-- every statement below is additive/defensive (ADD COLUMN IF NOT EXISTS,
-- or a NOT NULL tightening confirmed safe by a column's own DEFAULT).
--
-- PROPOSAL ONLY — NOT EXECUTED. Never run against production: these
-- columns already exist there (this is why they were detected as the GAP
-- — staging was missing them, not production).

-- ============================================================
-- 1. patient_intake — missing updated_at; created_at needs NOT NULL
-- ============================================================
ALTER TABLE patient_intake
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- 009's own `created_at` has a DEFAULT, so every row inserted through this
-- schema's own paths already has one; safe to tighten.
ALTER TABLE patient_intake ALTER COLUMN created_at SET NOT NULL;

-- ============================================================
-- 2. patients — missing voice_storage_path/voice_label (PatientHome.tsx's
--    custom-voice-recording feature; confirmed real app columns — these
--    were already added to src/types/supabase.ts earlier in this
--    engagement based on that same app evidence, but never had a
--    corresponding migration) and preferences_first_session_done.
-- ============================================================
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS preferences_first_session_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS voice_label TEXT;

-- ============================================================
-- 3. profiles — legacy tier-tracking columns that predate (and are
--    independent of) this engagement's `subscriptions` table, plus
--    `temp_user_expires_at` — the column central to production's existing
--    Temporary-user enforcement (see 018's own reconciliation note for
--    why that mechanism is deliberately NOT replaced or guessed at here).
--    No tracked application code reads `profiles.subscription_tier` /
--    `profiles.subscription_status` (SubscriptionContext.tsx reads the
--    `subscriptions` table exclusively) — added for schema parity only,
--    not because any app code depends on them.
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sms_consent          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_status  TEXT DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS subscription_tier     TEXT DEFAULT 'companion',
  ADD COLUMN IF NOT EXISTS temp_user_expires_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS username              TEXT;

-- ============================================================
-- 4. patient_document_uploads — file_type NOT NULL tightening now lives in
--    007_patient_documents_storage.sql directly (corrected in place, same
--    day) rather than repeated here.
-- ============================================================

-- ============================================================
-- STAGING VERIFICATION
-- ============================================================
-- Applied in staging as two distinct named migrations
-- (staging_live_legacy_missing_columns_20261016,
-- staging_live_legacy_not_null_parity_20261016) with zero rows in any
-- affected table at the time — no backfill was needed or performed.
-- V1: `information_schema.columns` for public.profiles/patients/
--   patient_intake now lists every column above.
-- V2: row-count snapshot on profiles/patients/patient_intake before/after
--   — expected identical; this file adds columns only.
