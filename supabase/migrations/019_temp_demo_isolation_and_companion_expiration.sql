-- 019_temp_demo_isolation_and_companion_expiration.sql
-- MYMEMORIA-FUNCTIONAL-REPAIR-008 — REPAIR A (complete the Temporary
-- demonstration experience's backend isolation) and REPAIR B (close the
-- direct-API-bypass gap in Companion's 30-day expiration enforcement).
--
-- PROPOSAL ONLY — NOT EXECUTED. See header note in 002_identity_and_role_contract.sql.
-- This file has not been run against any database.
--
-- Builds strictly on top of 018_temporary_companion_program_identity.sql's
-- `program` column, `is_my_program_active()`, and `caller_is_temp_user_program()`
-- — none of which are redefined incompatibly here. Does not touch any RLS
-- policy from 001/004/005/006/007/012/014/016/017 that this file does not
-- explicitly name.

-- ============================================================
-- 0. WHY A NEW FILE, NOT AN EDIT TO 018
-- ============================================================
-- 018 deliberately left SELECT untouched for temp_user ("read-only demo
-- viewing") and shipped no Companion-expiration backend check at all —
-- both were explicit, reported blockers at the time (temp_user's
-- synthetic-data layer did not exist yet; Companion's only enforcement was
-- the application-layer isSubscriptionActive()/can() check). REPAIR 008
-- builds the synthetic-data layer (application code — see the completion
-- report) and closes both gaps here at the database layer. Appending a new
-- file rather than editing 018 preserves 018 as an accurate record of what
-- was shipped at the time; nothing below contradicts or removes anything
-- 018 created.

-- ============================================================
-- 1. Temporary program: READ isolation (new) + write-blocking gaps closed
-- ============================================================
-- 018 only blocked INSERT/UPDATE/DELETE, and only on 8 tables. Two gaps
-- found while completing REPAIR A:
--   (a) SELECT was never restricted — a temp_user account was expected to
--       simply own no real `patients` row, so SELECT would return nothing
--       in practice, but that was a consequence of OTHER code never
--       linking one, not a guarantee enforced here. Requirement 4 of
--       REPAIR A ("prevent Temporary accounts from loading actual
--       patient... records") is a stronger claim than "nothing currently
--       links them" — this section makes it a real, structural guarantee.
--   (b) Six more tables were never in 018's FOREACH list at all, so a
--       temp_user account's writes to any of them were never blocked by
--       anything in 018: `medication_logs` (dose-taking history);
--       `patient_document_uploads` (007_patient_documents_storage.sql);
--       `media_uploads` (src/services/mediaService.ts's real backing
--       table for the Media feature); `patient_loved_one_photos`
--       (src/pages/patient/PatientHome.tsx's "Show Me Home" feature);
--       `patient_intake` (009_patient_intake.sql — reachable via the
--       "Patient Intake" nav item, which carries no FeatureKey and so is
--       never locked for ANY tier, temp_user included); and
--       `patient_care_partners`/`patient_emergency_contacts`
--       (src/pages/patient/PatientEmergencyContacts.tsx — same
--       "Emergency Contact" nav item situation). `media_uploads`,
--       `patient_loved_one_photos`, `patient_care_partners`, and
--       `patient_emergency_contacts` all have no tracked migration
--       creating them — same "tracked != live" situation already
--       documented repeatedly in this repo for other tables; `patient_intake`
--       is genuinely tracked (009).
-- RESTRICTIVE, ANDed with whatever PERMISSIVE policy already exists —
-- unaffected for every caller who is not currently a temp_user program.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'medications', 'tasks', 'mood_entries', 'memories', 'appointments',
    'care_team_members', 'patient_notes', 'care_partner_checkins',
    'medication_logs', 'patient_document_uploads',
    'media_uploads', 'patient_loved_one_photos', 'patient_intake',
    'patient_care_partners', 'patient_emergency_contacts'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot read %I (REPAIR 008)" ON %I AS RESTRICTIVE FOR SELECT USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — SELECT isolation skipped (not defined in any tracked migration; confirm its real name before relying on this policy).', tbl;
    END;

    -- INSERT/UPDATE/DELETE — already present for the original 8 tables
    -- (018); this re-creates them defensively (duplicate_object is caught
    -- and ignored) and adds them for real for the four newly-named tables.
    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot insert into %I (REPAIR 008)" ON %I AS RESTRICTIVE FOR INSERT WITH CHECK (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL; -- already notified above
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot update %I (REPAIR 008)" ON %I AS RESTRICTIVE FOR UPDATE USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Temporary program cannot delete from %I (REPAIR 008)" ON %I AS RESTRICTIVE FOR DELETE USING (NOT public.caller_is_temp_user_program());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- `patients`/`caregiver_patients` themselves: 018 already blocks INSERT/
-- UPDATE on `patients`. Adding SELECT-deny on both here closes the same
-- read-isolation gap as above for the two tables the FOREACH block does
-- not cover (their policy names/shapes differ from the generic per-table
-- loop above, so they are written out explicitly, matching 018's own
-- style for `patients`).
DO $$ BEGIN
  CREATE POLICY "Temporary program cannot read patients (REPAIR 008)"
    ON patients AS RESTRICTIVE FOR SELECT
    USING (NOT public.caller_is_temp_user_program());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Temporary program cannot read caregiver_patients (REPAIR 008)"
    ON caregiver_patients AS RESTRICTIVE FOR SELECT
    USING (NOT public.caller_is_temp_user_program());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- (INSERT on caregiver_patients needs no new policy — 014 already
-- REVOKEd INSERT from `authenticated` entirely; no authenticated caller,
-- temp_user or otherwise, can reach it.)

-- Storage: `patient-media` (Media) and `patient-documents` (Documents) are
-- the real backing buckets for two of the three features Temporary demo
-- views exist for (requirement 2). Neither bucket's PERMISSIVE policy
-- shape is confirmed in any tracked migration for `patient-media`
-- specifically (same "tracked != live" gap already noted elsewhere in
-- this repo) — this RESTRICTIVE policy does not need to know that shape;
-- it only ANDs one extra boolean condition onto whatever already exists.
DO $$ BEGIN
  CREATE POLICY "Temporary program cannot access patient-media/documents storage (REPAIR 008)"
    ON storage.objects AS RESTRICTIVE FOR ALL
    USING (
      bucket_id NOT IN ('patient-media', 'patient-documents')
      OR NOT public.caller_is_temp_user_program()
    )
    WITH CHECK (
      bucket_id NOT IN ('patient-media', 'patient-documents')
      OR NOT public.caller_is_temp_user_program()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Companion: close the direct-API-bypass gap in 30-day expiration
-- ============================================================
-- REPAIR 008 / REPAIR B requirement 5: "Direct data operations must not
-- bypass applicable expiration restrictions." Before this section, an
-- expired Companion's loss of access existed ONLY in the application layer
-- (isSubscriptionActive()/can() in src/types/subscription.ts +
-- SubscriptionContext.tsx) — a direct supabase-js call against
-- medications/medication_logs/patient_document_uploads/media_uploads or
-- the patient-media/patient-documents buckets, bypassing the app's own
-- can() check, was not blocked by anything at the database layer, because
-- RLS on those tables only ever checked PATIENT OWNERSHIP, never the
-- caller's own program/expiration state.
--
-- caller_is_expired_companion(): true only for a caller whose subscriptions
-- row has program='companion' AND is_my_program_active() is false. Reuses
-- is_my_program_active() (018) rather than re-deriving the now()/
-- trial_ends_at comparison a second time — a malformed/missing
-- trial_ends_at, a non-'active' status, or genuine elapsed time all make
-- is_my_program_active() false by its own existing logic, so all of
-- REPAIR B requirement 4's cases ("missing, expired, revoked, or malformed
-- eligibility") are covered here without restating that logic.
CREATE OR REPLACE FUNCTION public.caller_is_expired_companion()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
      AND program = 'companion'
  ) AND NOT public.is_my_program_active();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Scoped to exactly the three tables backing Companion's three approved
-- free-tier features (medications: Medication Management;
-- patient_document_uploads: Documents; media_uploads +
-- patient_loved_one_photos: Media) — never applied to a table outside that
-- set, so an expired Companion's loss of access here matches can()'s own
-- scope exactly (can() already denies every OTHER feature regardless of
-- program, via isActive — see src/store/SubscriptionContext.tsx).
-- An ACTIVE (non-expired) Companion, or any non-Companion caller
-- (ordinary free/paid/master/temp), is completely unaffected:
-- caller_is_expired_companion() is false for all of them, so this
-- RESTRICTIVE check always passes and existing PERMISSIVE ownership
-- policies decide access exactly as before.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'medications', 'medication_logs', 'patient_document_uploads',
    'media_uploads', 'patient_loved_one_photos'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "Expired companion cannot access %I (REPAIR 008)" ON %I AS RESTRICTIVE FOR ALL USING (NOT public.caller_is_expired_companion()) WITH CHECK (NOT public.caller_is_expired_companion());',
        tbl, tbl
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN
        RAISE NOTICE 'Table % does not exist in this database — expired-Companion restriction skipped.', tbl;
    END;
  END LOOP;
END $$;

DO $$ BEGIN
  CREATE POLICY "Expired companion cannot access patient-media/documents storage (REPAIR 008)"
    ON storage.objects AS RESTRICTIVE FOR ALL
    USING (
      bucket_id NOT IN ('patient-media', 'patient-documents')
      OR NOT public.caller_is_expired_companion()
    )
    WITH CHECK (
      bucket_id NOT IN ('patient-media', 'patient-documents')
      OR NOT public.caller_is_expired_companion()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Requirement 8 ("preserve existing patient records") / requirement 9
-- ("do not invent a policy for permanent loss of record access, deletion,
-- or export after expiration"): every policy in this section is
-- RESTRICTIVE and read/write-only — none of them is a DELETE of any row,
-- and SELECT is denied to the EXPIRED CALLER's own future requests only,
-- never executed as a row mutation. A patient's medications/documents/
-- media rows written while a Companion grant was active remain in the
-- table, byte-for-byte, after that grant expires; this migration adds no
-- trigger, no scheduled job, and no cascade that would remove them. An
-- authorized caregiver or the patient's own account (if distinct from the
-- expired Companion's) retains whatever access their OWN ownership/
-- caregiver policy already grants, completely unaffected — this migration
-- narrows only the EXPIRED COMPANION CALLER's own access, never anyone
-- else's. requirement 9's "unresolved policy" (should an expired
-- Companion ever regain read-only EXPORT access to data they themselves
-- created while active, for legally-required access purposes) is NOT
-- decided here — that is an owner policy question this file deliberately
-- leaves open, consistent with "isolate any unresolved post-expiration
-- access policy" (REPAIR 007's own requirement, unchanged by this file).

-- ============================================================
-- 3. undo_medication_dose(): close the SECURITY DEFINER bypass
-- ============================================================
-- Every RESTRICTIVE policy above is enforced by Postgres RLS — which a
-- SECURITY DEFINER function's internal DML does NOT automatically respect
-- (it runs with the function owner's privileges, not the caller's, exactly
-- as 003_medication_integrity.sql's own comment already documents for why
-- this function does its own ownership check instead of relying on a
-- table grant). Searched every SECURITY DEFINER function in this repo's
-- tracked migrations for one that writes to any table named in section 1
-- or 2 above; undo_medication_dose() (003) is the only one found —
-- admin_set_subscription/provision_free_subscription/redeem_promo_code/
-- admin_set_role/create_patient_with_caregiver/sync functions touch
-- unrelated tables (subscriptions/profiles/patients/caregiver_patients;
-- `patients`/`caregiver_patients` INSERT is already covered by 018's own
-- RESTRICTIVE policies on those two tables directly, which DO apply since
-- create_patient_with_caregiver's own INSERT runs as that function's
-- owner too — RESTRICTIVE policies apply the same regardless of who
-- triggers the INSERT, unlike authorization checks written in SQL inside
-- a function body, which must be added explicitly as done here).
--
-- Signature unchanged (same 3 parameters, same RETURNS void) — plain
-- CREATE OR REPLACE is valid here, unlike admin_set_subscription's
-- parameter-list changes in 017/018 which required DROP FUNCTION first.
CREATE OR REPLACE FUNCTION public.undo_medication_dose(
  p_medication_id UUID,
  p_date DATE,
  p_scheduled_time TEXT
) RETURNS void AS $$
DECLARE
  v_log medication_logs;
BEGIN
  -- REPAIR 008: added. A temp_user program account should own no dose log
  -- at all (see section 1's SELECT/INSERT isolation), but this function
  -- bypasses RLS by running SECURITY DEFINER — without this explicit
  -- check, a temp_user or expired-Companion caller could still call this
  -- RPC directly and have it silently succeed against a real row, even
  -- though every ordinary table-level path to the same effect is now
  -- blocked.
  IF public.caller_is_temp_user_program() THEN
    RAISE EXCEPTION 'Temporary demo accounts cannot modify medication records';
  END IF;
  IF public.caller_is_expired_companion() THEN
    RAISE EXCEPTION 'This Companion account''s access has expired';
  END IF;

  SELECT * INTO v_log
  FROM medication_logs
  WHERE medication_id = p_medication_id
    AND date = p_date
    AND scheduled_time = p_scheduled_time
  FOR UPDATE;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'No matching dose log found';
  END IF;

  IF NOT (
    v_log.patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id = v_log.patient_id AND cp.caregiver_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to undo this dose';
  END IF;

  UPDATE medication_logs
  SET status = 'pending',
      taken_time = NULL,
      undone_at = now(),
      undone_by = auth.uid()
  WHERE id = v_log.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.undo_medication_dose IS 'F05 (unchanged) + REPAIR 008: also refuses a temp_user program account or an expired Companion, since this SECURITY DEFINER function does not otherwise go through the RLS policies added in this file.';

-- ============================================================
-- BLOCKERS (explicitly reported, not resolved by this file)
-- ============================================================
-- 1. `patient-media` bucket's real, live PERMISSIVE policy shape (folder
--    convention, existing grants) is not confirmed against any tracked
--    migration — this file's new storage.objects RESTRICTIVE policies do
--    not need that shape to be correct (they only AND one extra boolean
--    condition), but anyone auditing "what can a normal patient do in
--    patient-media" still cannot fully answer that from tracked migrations
--    alone. Pre-existing gap, not introduced or widened here.
-- 2. `media_uploads`, `patient_loved_one_photos`, `patient_care_partners`,
--    and `patient_emergency_contacts` are all untracked — this file's
--    restriction on them is best-effort (caught, logged, and skipped via
--    `undefined_table` if the real table name differs from what
--    src/services/mediaService.ts, src/pages/patient/PatientHome.tsx, and
--    src/pages/patient/PatientEmergencyContacts.tsx assume). Confirm the
--    real names against the live schema before relying on this as the
--    sole backstop for those four specifically.
-- 3. requirement 9's "unresolved post-expiration access policy" (see
--    section 2's closing comment) remains an open owner decision.
-- 4. A full audit of every OTHER SECURITY DEFINER function in this
--    engagement for RLS-bypass exposure to temp_user/expired-Companion
--    was not performed — only the one function found to intersect the
--    tables this repair actually touches (undo_medication_dose) was
--    checked and fixed. See the completion report's grouped-diagnostics
--    section for this named as a candidate for a future audit batch.

-- ============================================================
-- STAGING-ONLY AUTHORIZATION TESTS (described for the owner to run in an
-- isolated environment; NOT executed by this migration file or by this
-- engagement — no isolated test database exists)
-- ============================================================
-- T14 (negative, temp_user read isolation): as a temp_user program
--   account, `select * from medications where patient_id = <any real
--   patient id, even one the caller has no caregiver link to>`. Expected:
--   zero rows — denied by the new RESTRICTIVE SELECT policy, not merely
--   by the absence of a caregiver_patients row.
-- T15 (negative, temp_user storage isolation): as a temp_user program
--   account, attempt `supabase.storage.from('patient-media').list()` or
--   `.upload(...)` or `.createSignedUrl(...)` for any path. Expected: all
--   denied by the new storage.objects RESTRICTIVE policy.
-- T16 (negative, temp_user dose-log write): as a temp_user program
--   account, attempt a direct `medication_logs` upsert (the same call
--   PatientMedications.tsx's logDose() makes) and a direct call to
--   undo_medication_dose(). Expected: both denied.
-- T17 (negative, Companion expiration — direct bypass): issue a Companion
--   program with a seeded trial_started_at far enough in the past that
--   trial_ends_at has already elapsed; as that account, attempt a direct
--   `medications`/`patient_document_uploads` select/insert and a direct
--   storage.objects operation on patient-media/patient-documents,
--   bypassing the application's own can() check entirely. Expected: all
--   denied by the new RESTRICTIVE policies, not merely hidden in the UI.
-- T18 (positive, Companion still active): identical to T17 but with
--   trial_ends_at in the future. Expected: all succeed, exactly as before
--   this migration, for a patient the Companion independently owns or is
--   an authorized caregiver for.
-- T19 (regression, non-Companion/non-temp_user callers unaffected): an
--   ordinary free_tier, Daily Care, Full Support, promo, and Master
--   account each performs the same operations as T17/T18 against their
--   own authorized patient. Expected: identical behavior before and after
--   this migration — caller_is_temp_user_program() and
--   caller_is_expired_companion() are both false for all of them.
-- T20 (regression — existing rows preserved): row-count and id-set
--   snapshot for every table this file adds a policy to, before/after.
--   Expected: identical — this file adds functions/policies only; it
--   touches no existing row (the REPLACE of undo_medication_dose changes
--   behavior for future calls only, not any already-stored row).
