-- Seeded as the superuser (bypasses RLS) — synthetic, local-only identities,
-- fixed UUIDs for readability. Zero real customer data.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@dryrun.test'),
  ('22222222-2222-2222-2222-222222222222', 'patient1@dryrun.test'),
  ('33333333-3333-3333-3333-333333333333', 'patient2@dryrun.test'),
  ('44444444-4444-4444-4444-444444444444', 'patient3-pending@dryrun.test'),
  ('55555555-5555-5555-5555-555555555555', 'caregiver-linked@dryrun.test'),
  ('66666666-6666-6666-6666-666666666666', 'caregiver-unlinked@dryrun.test'),
  ('77777777-7777-7777-7777-777777777777', 'temp-user-active@dryrun.test');

INSERT INTO profiles (id, email, first_name, last_name, role, provisioning_status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@dryrun.test', 'Admin', 'DryRun', 'admin', 'complete'),
  ('22222222-2222-2222-2222-222222222222', 'patient1@dryrun.test', 'PatientOne', 'DryRun', 'patient', 'complete'),
  ('33333333-3333-3333-3333-333333333333', 'patient2@dryrun.test', 'PatientTwo', 'DryRun', 'patient', 'complete'),
  ('44444444-4444-4444-4444-444444444444', 'patient3-pending@dryrun.test', 'PatientThree', 'Pending', 'patient', 'profile_created'),
  ('55555555-5555-5555-5555-555555555555', 'caregiver-linked@dryrun.test', 'Caregiver', 'Linked', 'caregiver', 'complete'),
  ('66666666-6666-6666-6666-666666666666', 'caregiver-unlinked@dryrun.test', 'Caregiver', 'Unlinked', 'caregiver', 'complete'),
  ('77777777-7777-7777-7777-777777777777', 'temp-user-active@dryrun.test', 'Temp', 'User', 'patient', 'complete')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  role = EXCLUDED.role, provisioning_status = EXCLUDED.provisioning_status;
-- (the handle_new_user() trigger already created a basic row per auth.users
-- insert above; this UPSERT overwrites it with the intended test role/
-- provisioning_status, matching what admin_set_role()/direct administration
-- would really do post-signup)

UPDATE profiles SET temp_user_expires_at = now() + interval '1 hour' WHERE id = '77777777-7777-7777-7777-777777777777';

INSERT INTO patients (id, first_name, last_name) VALUES
  ('22222222-2222-2222-2222-222222222222', 'PatientOne', 'DryRun'),
  ('33333333-3333-3333-3333-333333333333', 'PatientTwo', 'DryRun'),
  ('77777777-7777-7777-7777-777777777777', 'Temp', 'User');
-- patient3 (pending) deliberately has NO patients row yet.

-- caregiver-linked (5555...) is linked ONLY to patient1 (2222...), not patient2.
INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary) VALUES
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'primary', true);

INSERT INTO subscriptions (user_id, tier, status) VALUES
  ('22222222-2222-2222-2222-222222222222', 'free_tier', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'free_tier', 'active');

-- A checkin and a media row submitted by patient1 themself, for the
-- caregiver-read tests below.
INSERT INTO care_partner_checkins (patient_id, submitted_by, note) VALUES
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'patient1 self checkin');
INSERT INTO media_uploads (patient_id, uploader_id, file_url) VALUES
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'https://example/patient1.jpg');

SELECT 'seed complete' AS status;
