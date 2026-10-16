-- 027_staging_production_table_parity.sql
-- MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 / staging-execution-results handoff,
-- required item 1: "Exact staging baseline reconstruction for the 17
-- missing production tables, schema only."
--
-- PROPOSAL ONLY — NOT EXECUTED. Originally written against live production
-- evidence (MyMemoria_Production_Audit/04_SUPABASE_SECURITY_AND_SCHEMA.md's
-- full 29-table catalog) and this repo's own generated client types
-- (src/types/supabase.ts). CORRECTED on 2026-10-16 after staging ran a
-- read-only comparison of this file's column/FK shapes against real
-- production `information_schema`/`pg_constraint` metadata — several FK
-- targets, defaults, and CHECK details below differ from the first draft
-- as a result; see the per-table notes.
--
-- Of the 17 production-only tables ChatGPT's staging inspection confirmed
-- still absent from staging, 4 already have a creation statement elsewhere
-- in this migration chain and are NOT repeated here:
--   subscriptions            -> 010 (now corrected) / 013
--   patient_intake            -> 009
--   patient_document_uploads  -> 007
--   promo_redemptions         -> 013 (now corrected)
-- This file creates the remaining 13.
--
-- *** NEVER RUN THIS FILE AS A PRODUCTION REPLACEMENT *** for its 13
-- tables — production already has them, in its own real shape. This file
-- exists to bring an environment that does NOT yet have them (staging,
-- before this round) to schema parity for testing. The production release
-- sequence must treat these 13 as already-present and skip table/column
-- creation for them entirely, applying only confirmed POLICY corrections
-- (see §3's caregiver-scope fixes, which DO need a separate, reviewed
-- production patch of their own — same caution as `023`).
--
-- SCOPE NOTE: this is schema parity plus the caregiver-authorization
-- corrections staging testing actually found necessary (see §3) — it does
-- NOT attempt to replicate production's `block_temp_*`/
-- `block_expired_temp_*` RESTRICTIVE policies on these same tables; their
-- exact internal logic is still unverified against a live connection
-- (see 018's own reconciliation note), and guessing it risks exactly the
-- kind of defect already found and fixed once in this package.
--
-- Column type inference: 10 of these 13 tables already have a generated
-- TypeScript type in src/types/supabase.ts, derived from confirmed
-- application read/write call sites. The remaining 3 (audio_stories,
-- calm_tracks, trial_registrations) have no generated type; their column
-- TYPES are a reasonable inference from the audit's column NAMES and
-- NOT-NULL-ness, not independently confirmed to the same evidence tier.

-- ============================================================
-- 1. care_partner_checkins — src/pages/patient/CarePartnerCheckin.tsx
-- *** CORRECTED (staging metadata comparison, 2026-10-16) ***: removed the
-- `REFERENCES patients(id)` / `REFERENCES profiles(id)` foreign keys this
-- file's first draft guessed onto `patient_id`/`submitted_by` — real
-- production has no such FK on this table. Added `check_in_date`'s
-- DEFAULT and the array columns' `DEFAULT ARRAY[]::text[]` (matching real
-- production defaults, confirmed via the same comparison).
-- ============================================================
CREATE TABLE IF NOT EXISTS care_partner_checkins (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id        UUID NOT NULL,
  submitted_by      UUID NOT NULL,
  submitted_by_name TEXT,
  check_in_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  fn_dressing TEXT, fn_bathing TEXT, fn_toileting TEXT, fn_transfers TEXT,
  fn_mobility TEXT, fn_medication TEXT, fn_comments TEXT,
  nu_appetite TEXT, nu_meal_pct TEXT, nu_fluids TEXT, nu_swallowing TEXT, nu_comments TEXT,
  co_urinary TEXT, co_bowel TEXT, co_skin TEXT, co_comments TEXT,
  sa_falls TEXT, sa_injury_details TEXT, sa_wandering TEXT,
  sa_safety_concerns BOOLEAN DEFAULT false, sa_safety_checklist TEXT[] DEFAULT ARRAY[]::text[], sa_comments TEXT,
  be_behaviors TEXT[] DEFAULT ARRAY[]::text[], be_trigger TEXT, be_comments TEXT,
  be_agitation TEXT, be_wandering_risk TEXT, be_responsiveness TEXT, be_hallucinations TEXT,
  mo_mood TEXT, mo_social TEXT, mo_sleep TEXT, mo_comments TEXT,
  sy_symptoms TEXT[] DEFAULT ARRAY[]::text[], sy_severity TEXT, sy_other TEXT, sy_comments TEXT,
  sy_pain TEXT, sy_respiratory TEXT, sy_gi TEXT, sy_neurological TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE care_partner_checkins ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients can view their own check-ins" ON care_partner_checkins
    FOR SELECT USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- *** CORRECTED (staging-verified, 2026-10-16): originally patient-only;
-- widened to also permit the submitting caregiver, and to require
-- submitted_by = auth.uid() (prevents attributing a submission to someone
-- else) — matches 023's own RESTRICTIVE layer exactly, so both the base
-- PERMISSIVE grant and the RESTRICTIVE ownership check agree. ***
DO $$ BEGIN
  CREATE POLICY "Patients and linked caregivers can submit check-ins" ON care_partner_checkins
    FOR INSERT WITH CHECK (
      submitted_by = auth.uid()
      AND (
        patient_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = care_partner_checkins.patient_id
            AND cp.caregiver_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- *** ADDED (staging-verified, 2026-10-16): initial execution exposed
-- missing caregiver SELECT — a caregiver who successfully submitted a
-- check-in could not then read it (or any other check-in for their own
-- patient) back. ***
DO $$ BEGIN
  CREATE POLICY "Linked caregivers can view patient check-ins" ON care_partner_checkins
    FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.caregiver_patients cp
        WHERE cp.patient_id = care_partner_checkins.patient_id
          AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 023_closure_master_009_phase1_security_hardening.sql (corrected the same
-- day) adds the RESTRICTIVE "...own patient or linked caregiver
-- (FQA-019/SEC-008)" policy for this exact table once it exists — no
-- duplicate added here.

-- ============================================================
-- 2. care_partner_logs — src/pages/patient/PatientDocuments.tsx (LogRow)
-- *** CORRECTED (staging metadata comparison, 2026-10-16) ***: `patient_id`
-- FK target changed from `patients(id)` to `auth.users(id)` — real
-- production FK confirmed to point at auth.users directly, not `patients`.
-- `submitted_by` FK removed (no FK on that column in real production).
-- ============================================================
CREATE TABLE IF NOT EXISTS care_partner_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date     DATE NOT NULL,
  submitted_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  mood TEXT, meals TEXT, hydration TEXT, medications TEXT, mobility TEXT,
  exercise TEXT, sleep_quality TEXT, pain_level INTEGER, notes TEXT,
  answers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by    UUID,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE care_partner_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients can view their own care partner logs" ON care_partner_logs
    FOR SELECT USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Patients can insert their own care partner logs" ON care_partner_logs
    FOR INSERT WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Patients can update their own care partner logs" ON care_partner_logs
    FOR UPDATE USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Patients can delete their own old care partner logs" ON care_partner_logs
    FOR DELETE USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. media_uploads — src/services/mediaService.ts
-- *** CORRECTED (staging metadata comparison, 2026-10-16) ***: `patient_id`
-- FK target changed from `patients(id)` to `profiles(id)` (real production
-- FK confirmed). `shared_with` changed from nullable `TEXT[]` to
-- `UUID[] NOT NULL DEFAULT ARRAY[]::uuid[]` (real production shape — holds
-- user ids, not arbitrary text). Added NOT NULL defaults on
-- uploader_name/uploader_role/file_name/file_size/caption matching
-- production.
-- ============================================================
CREATE TABLE IF NOT EXISTS media_uploads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  uploader_name   TEXT NOT NULL DEFAULT '',
  uploader_role   TEXT NOT NULL DEFAULT 'patient',
  patient_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url        TEXT NOT NULL,
  file_type       TEXT NOT NULL CHECK (file_type IN ('video', 'image', 'audio', 'document')),
  file_name       TEXT NOT NULL DEFAULT '',
  file_size       BIGINT NOT NULL DEFAULT 0,
  caption         TEXT NOT NULL DEFAULT '',
  shared_with     UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;
-- *** CORRECTED (staging-verified, 2026-10-16): widened from patient-only
-- to also let the uploader read their own upload (a caregiver who uploaded
-- on a patient's behalf can see what they uploaded even before any
-- separate caregiver-read-scope policy is considered). ***
DO $$ BEGIN
  CREATE POLICY "Patients and uploaders can view their media" ON media_uploads
    FOR SELECT USING (patient_id = auth.uid() OR uploader_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- *** CORRECTED (staging-verified, 2026-10-16): originally patient-only;
-- widened to also permit the linked caregiver, requiring
-- uploader_id = auth.uid() (prevents attributing an upload to someone
-- else) — matches 023's own RESTRICTIVE layer. ***
DO $$ BEGIN
  CREATE POLICY "Patients and linked caregivers can upload patient media" ON media_uploads
    FOR INSERT WITH CHECK (
      uploader_id = auth.uid()
      AND (
        patient_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.caregiver_patients cp
          WHERE cp.patient_id = media_uploads.patient_id
            AND cp.caregiver_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Patients can delete their own media" ON media_uploads
    FOR DELETE USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- *** ADDED (staging-verified, 2026-10-16): same missing-caregiver-SELECT
-- gap as care_partner_checkins above. ***
DO $$ BEGIN
  CREATE POLICY "Linked caregivers can view patient media" ON media_uploads
    FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.caregiver_patients cp
        WHERE cp.patient_id = media_uploads.patient_id
          AND cp.caregiver_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 023 (corrected the same day) adds the RESTRICTIVE "...own patient or
-- linked caregiver (FQA-019/SEC-008)" policy for this exact table once it
-- exists.

-- ============================================================
-- 4. patient_calendar_notes — src/pages/patient/PatientReminders.tsx
-- *** CORRECTED ***: `patient_id` FK target -> `profiles(id)` (was
-- `patients(id)`); `type` gets `DEFAULT 'reminder'` matching production.
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_calendar_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  text        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'reminder',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE patient_calendar_notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their calendar notes" ON patient_calendar_notes
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 5. patient_care_partners — src/pages/patient/PatientEmergencyContacts.tsx
--    (loadCarePartner/saveCarePartner — ONE row per patient; patient_id is
--    the table's own primary key, not a separate `id` column)
-- *** CORRECTED ***: `patient_id` FK target -> `profiles(id)`; `full_name`
-- changed from NOT NULL to nullable (real production allows a care-partner
-- row with no name yet recorded).
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_care_partners (
  patient_id            UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  full_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  relationship          TEXT,
  education_level       TEXT,
  medical_experience    TEXT,
  employment_relevant   TEXT,
  notes                 TEXT,
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE patient_care_partners ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their care partner info" ON patient_care_partners
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6. patient_emergency_contacts — src/pages/patient/PatientEmergencyContacts.tsx
--    (a patient may have several, so `id` is its own PK here, unlike #5)
-- *** CORRECTED ***: `patient_id` FK target -> `profiles(id)`; `full_name`
-- changed from NOT NULL to nullable, matching production.
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_emergency_contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name     TEXT,
  email         TEXT,
  phone         TEXT,
  relationship  TEXT,
  address       TEXT,
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE patient_emergency_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their emergency contacts" ON patient_emergency_contacts
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. patient_home_photos — src/components/ShowMeHomeDialog.tsx
-- *** CORRECTED ***: `patient_id` FK target -> `auth.users(id)` (real
-- production FK confirmed, not `patients`); `label` gets
-- `DEFAULT 'Home'` matching production.
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_home_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Home',
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_home_photos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their home photos" ON patient_home_photos
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 8. patient_loved_one_photos — src/pages/patient/PatientHome.tsx
-- *** CORRECTED ***: `patient_id` FK target -> `auth.users(id)` (real
-- production FK confirmed, not `patients`).
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_loved_one_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_loved_one_photos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their loved-one photos" ON patient_loved_one_photos
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 9. patient_routine_items — src/pages/patient/PatientRoutine.tsx ("My Day")
-- *** CORRECTED ***: `patient_id` FK target -> `auth.users(id)` (real
-- production FK confirmed); `completed_date` changed from `DATE` to `TEXT`
-- (production stores this as a free-form string, not a date type);
-- `emoji`/`scheduled_time` get real production defaults.
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_routine_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '☀️',
  time_of_day     TEXT NOT NULL,
  scheduled_time  TEXT NOT NULL DEFAULT '08:00',
  completed       BOOLEAN NOT NULL DEFAULT false,
  completed_date  TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE patient_routine_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their routine items" ON patient_routine_items
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 10. patient_task_items — src/pages/patient/PatientReminders.tsx ("My Tasks")
-- *** CORRECTED ***: `patient_id` FK target -> `profiles(id)` (was
-- `patients(id)`); `period` gets a CHECK + `DEFAULT 'daily'`; `week_key`
-- changed from `TEXT` to `DATE` — matching real production.
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_task_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  period          TEXT NOT NULL DEFAULT 'daily' CHECK (period IN ('daily', 'weekly')),
  completed       BOOLEAN NOT NULL DEFAULT false,
  completed_date  DATE,
  week_key        DATE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE patient_task_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Patients own their task items" ON patient_task_items
    FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 11. audio_stories — no generated client type. Column NAMES/NOT-NULL-ness
--     are from the production audit directly; `category`'s CHECK values
--     and the DEFAULTs below were added during staging reconciliation as a
--     reasonable catalog-content inference, not independently confirmed to
--     the same evidence tier as tables 1-10. Shared read-only catalog
--     content, not patient-owned data — no patient_id column.
-- ============================================================
CREATE TABLE IF NOT EXISTS audio_stories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL CHECK (category IN ('short', 'long', 'nature')),
  title       TEXT NOT NULL,
  author      TEXT,
  duration    TEXT NOT NULL DEFAULT '~30 min',
  description TEXT,
  audio_url   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE audio_stories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "anyone_can_read_stories" ON audio_stories
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admins_manage_stories" ON audio_stories
    FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 12. calm_tracks — same evidence caveat as audio_stories above.
-- ============================================================
CREATE TABLE IF NOT EXISTS calm_tracks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL CHECK (category IN ('melodies', 'nature', 'classical')),
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL DEFAULT 'Unknown',
  emoji       TEXT NOT NULL DEFAULT '🎵',
  color       TEXT NOT NULL DEFAULT 'bg-purple-100 text-purple-700',
  audio_url   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE calm_tracks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "anyone_can_read_calm_tracks" ON calm_tracks
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admins_manage_calm_tracks" ON calm_tracks
    FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 13. trial_registrations — no generated client type AND no confirmed
--     src/ call site at all (grep -rn "trial_registrations" src/ — zero
--     hits). Production audit confirms it exists with service-role +
--     own-row policies; no tracked application code reads or writes it
--     today — a release limitation (dormant table), not a feature this
--     migration adds a frontend path for. `user_id` FK target corrected to
--     `auth.users(id)` (was `profiles(id)`) per staging metadata
--     comparison.
-- ============================================================
CREATE TABLE IF NOT EXISTS trial_registrations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE trial_registrations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users insert own trial reg" ON trial_registrations
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users view own trial reg" ON trial_registrations
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- STAGING ACCEPTANCE — ACTUALLY EXECUTED 2026-10-16 (not merely described)
-- ============================================================
-- Using `SET LOCAL ROLE authenticated` + a temporary JWT subject inside
-- rollback-only transactions (no persisted rows, no auth users created):
-- - Linked caregiver SELECT on a patient's row/reminder: PASS. Unrelated
--   patient denied: PASS. Patient's own SELECT: PASS.
-- - Caregiver-submitted check-in/media INSERT for an authorized patient:
--   initially FAILED (missing caregiver SELECT exposed the gap fixed
--   above), PASS on retest. Unrelated account denied: PASS.
-- - A Free-tier account's new care-partner check-in correctly denied by
--   016's own free-tier entitlement policy (expected — out of scope for
--   this file).
-- Not yet tested: live file upload, signed URL issuance, or Android
-- storage integration (SQL/RLS-layer only); full paid-plan
-- checkout/upgrade/downgrade lifecycle.
