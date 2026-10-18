-- Seed identities: admin, a "discrepant" free-tier patient (simulating one
-- of the 16 real rows), an expired temp-user patient, a fresh patient (for
-- provision_free_subscription), and a paid-to-free downgrade patient.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@dryrun.test', '{"role":"patient"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'discrepant-free@dryrun.test', '{"role":"patient"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'expired-temp@dryrun.test', '{"role":"patient"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'fresh-signup@dryrun.test', '{"role":"patient"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'downgrade-patient@dryrun.test', '{"role":"patient"}'::jsonb);
UPDATE profiles SET role = 'admin' WHERE id = '11111111-1111-1111-1111-111111111111';
INSERT INTO patients (id, first_name, last_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Downgrade', 'Patient');

-- The exact shape of the real 16-row production discrepancy: free_tier,
-- active, trial_ends_at already in the past. Captured BEFORE migration for
-- a before/after data-untouched comparison.
INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'free_tier', 'active', now() - interval '400 days', now() - interval '370 days');

-- An EXPIRED Temporary User row — base columns only here (the `program`
-- column does not exist until the migration's §7b runs); set program='temp_user'
-- in the post-migration check script instead, once the column exists.
INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'free_tier', 'active', now() - interval '5 days', now() - interval '2 days');

\echo '=== ITEM 2 preflight: discrepant row trial_ends_at BEFORE migration ==='
SELECT user_id, trial_ends_at FROM subscriptions WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
