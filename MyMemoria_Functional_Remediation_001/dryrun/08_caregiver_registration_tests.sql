INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'caregiver-one@dryrun.test', '{"role":"caregiver","first_name":"CaregiverOne","last_name":"Test"}'::jsonb),
  ('c2222222-2222-2222-2222-222222222222', 'caregiver-two@dryrun.test', '{"role":"caregiver","first_name":"CaregiverTwo","last_name":"Test"}'::jsonb),
  ('a1111111-1111-1111-1111-111111111111', 'admin@dryrun.test', '{"role":"patient"}'::jsonb),
  ('e1111111-1111-1111-1111-111111111111', 'existing-patient@dryrun.test', '{"role":"patient"}'::jsonb);
UPDATE profiles SET role = 'admin' WHERE id = 'a1111111-1111-1111-1111-111111111111';

\echo '=== Caregiver signup regression: trigger assigned role=caregiver from metadata alone ==='
SELECT id, role FROM profiles WHERE id IN ('c1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222');

INSERT INTO patients (id, first_name, last_name) VALUES ('e1111111-1111-1111-1111-111111111111', 'Existing', 'Patient');
UPDATE profiles SET provisioning_status = 'complete' WHERE id = 'e1111111-1111-1111-1111-111111111111';

\echo '=== TEST 1 (positive): caregiver initiates registration, token captured ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT id AS reg_id, claim_token AS token, patient_email AS reg_email
FROM caregiver_initiate_patient_registration(
  'NewPatient', 'One', 'newpatient1@dryrun.test', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'daughter'
) \gset
\echo 'registration id::' :reg_id
RESET ROLE;
RESET request.jwt.claim.sub;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d1111111-1111-1111-1111-111111111111', :'reg_email', '{"role":"patient","first_name":"NewPatient","last_name":"One"}'::jsonb);
UPDATE profiles SET provisioning_status = 'profile_created' WHERE id = 'd1111111-1111-1111-1111-111111111111';

\set ON_ERROR_STOP 0

\echo '=== TEST 2 (negative, requirement 7 — THE central test): forged/wrong token must be rejected ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT * FROM caregiver_claim_new_patient(
  :'reg_id'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'd1111111-1111-1111-1111-111111111111'::uuid
);
RESET ROLE; RESET request.jwt.claim.sub;

\echo '=== TEST 3 (negative): a DIFFERENT caregiver cannot claim this registration, even with the correct patient_id ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c2222222-2222-2222-2222-222222222222';
SELECT * FROM caregiver_claim_new_patient(
  :'reg_id'::uuid, :'token'::uuid, 'd1111111-1111-1111-1111-111111111111'::uuid
);
RESET ROLE; RESET request.jwt.claim.sub;

\echo '=== TEST 4 (negative): a non-caregiver (admin) cannot call either RPC ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';
SELECT * FROM caregiver_initiate_patient_registration('X','Y','z@dryrun.test',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'primary');
RESET ROLE; RESET request.jwt.claim.sub;

\echo '=== TEST 5 (negative, requirement 5/7): cannot claim an EXISTING, already-complete, unrelated patient ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT * FROM caregiver_claim_new_patient(
  :'reg_id'::uuid, :'token'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid
);
RESET ROLE; RESET request.jwt.claim.sub;

\set ON_ERROR_STOP 1

\echo '=== TEST 6 (positive): the ACTUAL originating caregiver, correct token, correct patient_id — succeeds ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT id, first_name, last_name FROM caregiver_claim_new_patient(
  :'reg_id'::uuid, :'token'::uuid, 'd1111111-1111-1111-1111-111111111111'::uuid
);
RESET ROLE; RESET request.jwt.claim.sub;

\echo '=== TEST 7 (positive): correct caregiver_patients relationship — the ORIGINATING caregiver, not anyone else ==='
SELECT caregiver_id, patient_id, relationship_type FROM caregiver_patients WHERE patient_id = 'd1111111-1111-1111-1111-111111111111';

\echo '=== TEST 8 (duplicate/idempotent replay): the SAME caregiver re-claims the SAME, now-consumed registration ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT id FROM caregiver_claim_new_patient(:'reg_id'::uuid, :'token'::uuid, 'd1111111-1111-1111-1111-111111111111'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;

\echo '=== TEST 8b: confirm exactly ONE patients row and ONE caregiver_patients row exist (no duplicate from the replay) ==='
SELECT count(*) AS patients_count FROM patients WHERE id = 'd1111111-1111-1111-1111-111111111111';
SELECT count(*) AS links_count FROM caregiver_patients WHERE patient_id = 'd1111111-1111-1111-1111-111111111111';

\echo '=== TEST 9 (negative): another caregiver cannot access (SELECT) this patient at all ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c2222222-2222-2222-2222-222222222222';
SELECT count(*) AS unrelated_caregiver_sees_patient FROM patients WHERE id = 'd1111111-1111-1111-1111-111111111111';
SELECT count(*) AS unrelated_caregiver_sees_link FROM caregiver_patients WHERE patient_id = 'd1111111-1111-1111-1111-111111111111';
RESET ROLE; RESET request.jwt.claim.sub;

\echo '=== TEST 10 (interrupted-registration recovery) ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT id AS reg_id2, claim_token AS token2, patient_email AS reg_email2
FROM caregiver_initiate_patient_registration(
  'NewPatient', 'Two', 'newpatient2@dryrun.test', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'primary'
) \gset
RESET ROLE; RESET request.jwt.claim.sub;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d2222222-2222-2222-2222-222222222222', :'reg_email2', '{"role":"patient","first_name":"NewPatient","last_name":"Two"}'::jsonb);
UPDATE profiles SET provisioning_status = 'profile_created' WHERE id = 'd2222222-2222-2222-2222-222222222222';
UPDATE profiles SET must_change_password = true WHERE id = 'd2222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'c1111111-1111-1111-1111-111111111111';
SELECT id FROM caregiver_claim_new_patient(:'reg_id2'::uuid, :'token2'::uuid, 'd2222222-2222-2222-2222-222222222222'::uuid);
RESET ROLE; RESET request.jwt.claim.sub;
\echo 'Resumed registration result:'
SELECT caregiver_id, patient_id FROM caregiver_patients WHERE patient_id = 'd2222222-2222-2222-2222-222222222222';

\echo '=== TEST 11 (regression): existing admin-direct creation (create_patient_with_caregiver) still works, unaffected ==='
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1111111-1111-1111-1111-111111111111', 'admin-created-patient@dryrun.test', '{"role":"patient"}'::jsonb);
UPDATE profiles SET provisioning_status = 'profile_created' WHERE id = 'f1111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';
SELECT id, first_name, last_name FROM create_patient_with_caregiver('f1111111-1111-1111-1111-111111111111', 'Admin', 'Created');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT caregiver_id, patient_id FROM caregiver_patients WHERE patient_id = 'f1111111-1111-1111-1111-111111111111';

\echo '=== DONE ==='
