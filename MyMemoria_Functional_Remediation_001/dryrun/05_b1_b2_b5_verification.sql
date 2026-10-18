-- Seed minimal identities for this focused re-verification.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@dryrun.test', '{"role":"patient"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'target@dryrun.test', '{"role":"patient"}'::jsonb);
UPDATE profiles SET role = 'admin' WHERE id = '11111111-1111-1111-1111-111111111111';

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '=== B1: Daily Care preset (tier=paid_tier, plan=daily_care, trialDays=null) ==='
SELECT tier, plan, status, trial_ends_at FROM admin_set_subscription(
  '22222222-2222-2222-2222-222222222222', 'paid_tier', 'daily_care', NULL, 'active', now(), NULL, NULL);

\echo '=== B1: Full Support preset ==='
SELECT tier, plan, status, trial_ends_at FROM admin_set_subscription(
  '22222222-2222-2222-2222-222222222222', 'paid_tier', 'full_support', NULL, 'active', now(), NULL, NULL);

\echo '=== B1: Master preset ==='
SELECT tier, plan, status, trial_ends_at FROM admin_set_subscription(
  '22222222-2222-2222-2222-222222222222', 'master', NULL, NULL, 'active', now(), NULL, NULL);

\echo '=== B1: Canceled preset ==='
SELECT tier, plan, status, trial_ends_at FROM admin_set_subscription(
  '22222222-2222-2222-2222-222222222222', 'free_tier', NULL, NULL, 'canceled', now(), NULL, NULL);

RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== B1: has_active_subscription() for the final (canceled) state ==='
SELECT public.has_active_subscription('22222222-2222-2222-2222-222222222222') AS should_be_false_canceled;

\echo '=== B1: re-set to Master (active, null trial_ends_at) and re-check ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT tier, status, trial_ends_at FROM admin_set_subscription(
  '22222222-2222-2222-2222-222222222222', 'master', NULL, NULL, 'active', now(), NULL, NULL);
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT public.has_active_subscription('22222222-2222-2222-2222-222222222222') AS should_be_true_master_null_expiry;

\echo '=== B5: security-critical policy install on a table that genuinely does not exist must ABORT, not continue to COMMIT ==='
-- Simulate by attempting the exact same uncaught-exception pattern against
-- a deliberately nonexistent table, inside an explicit transaction that we
-- roll back ourselves (so this test does not corrupt the rest of this
-- session) -- confirms the uncaught DROP POLICY IF EXISTS / CREATE POLICY
-- pattern 14_...'s §11 now uses really does propagate and abort, instead
-- of being swallowed.
BEGIN;
DO $$ BEGIN
  CREATE POLICY "test restrictive policy" ON this_table_does_not_exist_at_all AS RESTRICTIVE FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ROLLBACK;
\echo 'If an ERROR appeared above (relation does not exist) and this transaction rolled back, B5''s fail-closed behavior is confirmed.'

\echo '=== DONE ==='
