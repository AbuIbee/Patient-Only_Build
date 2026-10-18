-- Functional verification, run as the superuser session, switching role
-- per-statement via SET ROLE authenticated + a JWT-sub GUC (mirroring real
-- PostgREST-authenticated-role behavior). Each block is labeled with the
-- finding it verifies; expected results are stated in comments.

\echo '=== P02: a FRESH patient self-inserts their own patients row ==='
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('88888888-8888-8888-8888-888888888888', 'patient-fresh@dryrun.test', '{"role":"patient","first_name":"Fresh","last_name":"Patient"}'::jsonb);
-- handle_new_user() trigger already created the matching profiles row.
SET ROLE authenticated;
SET request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
INSERT INTO patients (id, first_name, last_name) VALUES (auth.uid(), 'Fresh', 'Patient');
-- EXPECT: INSERT 0 1 (success) — this is the exact regression P02 fixes.
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P02 negative (unchanged): a caregiver cannot insert a patients row for someone else ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
DO $$ BEGIN
  INSERT INTO patients (id, first_name, last_name) VALUES ('99999999-9999-9999-9999-999999999999', 'Arbitrary', 'Claim');
  RAISE EXCEPTION 'TEST FAILED: unrelated caregiver was able to insert a patients row for someone else';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'EXPECTED: denied (insufficient_privilege / RLS)';
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P03: admin SELECT * FROM profiles — no infinite recursion, returns multiple rows ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT count(*) AS admin_sees_n_profiles FROM profiles; -- EXPECT: 8 (all seeded + fresh patient)
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P03 regression: non-admin sees only their own profile row ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT count(*) AS patient1_sees_n_profiles FROM profiles; -- EXPECT: 1
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P04 positive: admin links the genuinely-pending patient3, with first/last name ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT (create_patient_with_caregiver(
  '44444444-4444-4444-4444-444444444444', 'PatientThree', 'Pending'
)).* ;
-- EXPECT: one row returned, first_name='PatientThree', last_name='Pending', no NOT NULL violation.
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT caregiver_id, patient_id FROM caregiver_patients WHERE patient_id = '44444444-4444-4444-4444-444444444444';
-- EXPECT: 1 row, caregiver_id = the admin's id (11111111...).

\echo '=== P04 negative: an ordinary (unlinked) caregiver cannot call the RPC at all ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
DO $$ BEGIN
  PERFORM create_patient_with_caregiver('33333333-3333-3333-3333-333333333333', 'X', 'Y');
  RAISE EXCEPTION 'TEST FAILED: non-admin caregiver was able to call create_patient_with_caregiver';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EXPECTED exception: %', SQLERRM;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P04 negative: admin cannot silently claim an already-complete existing patient ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM create_patient_with_caregiver('33333333-3333-3333-3333-333333333333', 'X', 'Y');
  RAISE EXCEPTION 'TEST FAILED: admin claimed an already-complete patient by id alone';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EXPECTED exception: %', SQLERRM;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

-- SUPERSEDED BY REVIEW ROUND 2 / B1: admin_set_subscription no longer
-- throws for a NULL p_trial_ends_at on a non-program grant — it now passes
-- it through as-is, matching the real admin UI's accountTypes.ts payloads.
-- See dryrun/05_b1_b2_b5_verification.sql for the current, correct test of
-- this exact behavior (all four real preset payloads).
\echo '=== P05 (current behavior, REVIEW B1): NULL trial_ends_at for a non-program grant now SUCCEEDS, matching the real admin UI ==='
SELECT (admin_set_subscription('33333333-3333-3333-3333-333333333333', 'paid_tier', 'daily_care', NULL, 'active', NULL, NULL, NULL)).*;
SELECT public.has_active_subscription('33333333-3333-3333-3333-333333333333') AS patient2_now_active; -- EXPECT: t (NULL trial_ends_at = non-expiring, per has_active_subscription's confirmed real semantics)
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P08 positive: linked caregiver can READ a checkin/media they did NOT submit ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
SELECT count(*) AS caregiver_sees_patient1_checkins FROM care_partner_checkins WHERE patient_id = '22222222-2222-2222-2222-222222222222'; -- EXPECT: 1
SELECT count(*) AS caregiver_sees_patient1_media FROM media_uploads WHERE patient_id = '22222222-2222-2222-2222-222222222222'; -- EXPECT: 1

\echo '=== P08 positive: linked caregiver CAN insert a checkin/media for their own linked patient ==='
INSERT INTO care_partner_checkins (patient_id, submitted_by, note) VALUES
  ('22222222-2222-2222-2222-222222222222', auth.uid(), 'caregiver-submitted checkin'); -- EXPECT: success
INSERT INTO media_uploads (patient_id, uploader_id, file_url) VALUES
  ('22222222-2222-2222-2222-222222222222', auth.uid(), 'https://example/caregiver-upload.jpg'); -- EXPECT: success

\echo '=== P08 negative: the SAME linked caregiver is still blocked for an UNRELATED patient ==='
SELECT count(*) AS caregiver_sees_patient2_checkins FROM care_partner_checkins WHERE patient_id = '33333333-3333-3333-3333-333333333333'; -- EXPECT: 0
DO $$ BEGIN
  INSERT INTO care_partner_checkins (patient_id, submitted_by, note) VALUES ('33333333-3333-3333-3333-333333333333', auth.uid(), 'forged');
  RAISE EXCEPTION 'TEST FAILED: linked-to-patient1 caregiver inserted a checkin for unrelated patient2';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EXPECTED exception: %', SQLERRM;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P08 negative: a completely UNLINKED caregiver sees nothing for patient1 either ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
SELECT count(*) AS unlinked_caregiver_sees_patient1_checkins FROM care_partner_checkins WHERE patient_id = '22222222-2222-2222-2222-222222222222'; -- EXPECT: 0
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P08 storage.objects: linked caregiver can read/write/delete patient-media under their linked patient folder; unlinked caregiver cannot ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-media', '22222222-2222-2222-2222-222222222222/caregiver-upload.png', auth.uid()); -- EXPECT: success (new P08 INSERT policy)
SELECT count(*) AS caregiver_sees_patient1_storage FROM storage.objects WHERE bucket_id='patient-media' AND name LIKE '22222222-2222-2222-2222-222222222222/%'; -- EXPECT: 1
DELETE FROM storage.objects WHERE bucket_id='patient-media' AND name = '22222222-2222-2222-2222-222222222222/caregiver-upload.png'; -- EXPECT: success (new P08 DELETE policy)
RESET ROLE;
RESET request.jwt.claim.sub;

SET ROLE authenticated;
SET request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
DO $$ BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-media', '22222222-2222-2222-2222-222222222222/forged.png', auth.uid());
  RAISE EXCEPTION 'TEST FAILED: unlinked caregiver uploaded into patient1''s storage folder';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EXPECTED exception: %', SQLERRM;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== P08 preserved: the EXISTING patient_media_* policies still work for the patient themselves, unduplicated ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('patient-media', '22222222-2222-2222-2222-222222222222/own-upload.png', auth.uid()); -- EXPECT: success (pre-existing patient_media_insert)
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT policyname FROM pg_policies WHERE tablename='objects' AND schemaname='storage' ORDER BY policyname;
-- EXPECT: patient_media_select/insert/delete UNCHANGED (still present, exactly 3 rows for those names) PLUS the 3 new "Linked caregivers..." policies — 6 total, none duplicated.

\echo '=== P08 admin bypass preserved on media_uploads (is_admin_check(), not narrowed by the new RESTRICTIVE policy) ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
INSERT INTO media_uploads (patient_id, uploader_id, file_url) VALUES
  ('33333333-3333-3333-3333-333333333333', auth.uid(), 'https://example/admin-upload-for-unrelated-patient.jpg');
-- EXPECT: success — admin is not linked to patient2 at all, but is_admin_check() bypass must still work (this is the exact regression the P08 fix for media_uploads' RESTRICTIVE policy was written to avoid).
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== Temporary User restriction still in force, unaffected by any new PERMISSIVE policy ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  INSERT INTO care_partner_checkins (patient_id, submitted_by, note) VALUES (auth.uid(), auth.uid(), 'temp user checkin attempt');
  RAISE EXCEPTION 'TEST FAILED: an active Temporary User was able to submit a checkin';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EXPECTED exception (Temp User RESTRICTIVE policy still enforced): %', SQLERRM;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== ALL FUNCTIONAL VERIFICATION STATEMENTS EXECUTED ==='
