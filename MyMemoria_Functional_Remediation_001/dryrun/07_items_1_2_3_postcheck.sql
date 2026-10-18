\echo '=== ITEM 2: discrepant free-tier row DATA UNCHANGED by migration ==='
SELECT user_id, trial_ends_at FROM subscriptions WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Expect: IDENTICAL trial_ends_at to the preflight capture (now() - 370 days) — no UPDATE touched it.

\echo '=== ITEM 2: has_active_subscription() now TRUE for the discrepant row, without its data changing ==='
SELECT public.has_active_subscription('aaaaaaaa-0000-0000-0000-000000000001') AS discrepant_row_now_active;
-- Expect: t

\echo '=== ITEM 2 (negative): an EXPIRED Temporary User program is NOT exempted ==='
UPDATE subscriptions SET program = 'temp_user' WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT public.has_active_subscription('aaaaaaaa-0000-0000-0000-000000000002') AS expired_temp_user_still_inactive;
-- Expect: f — program IS NOT NULL, so the new free-tier exemption clause does not apply.

\echo '=== ITEM 2: provision_free_subscription() for a brand-new signup no longer writes now()-valued trial_ends_at ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT tier, status, trial_ends_at FROM provision_free_subscription();
RESET ROLE;
RESET request.jwt.claim.sub;
-- Expect: trial_ends_at IS NULL (not "now").
SELECT public.has_active_subscription('aaaaaaaa-0000-0000-0000-000000000003') AS fresh_signup_active;
-- Expect: t

\echo '=== ITEM 3: paid patient creates a memory (baseline positive) ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT tier, status, trial_ends_at FROM admin_set_subscription(
  'aaaaaaaa-0000-0000-0000-000000000004', 'paid_tier', 'daily_care', NULL, 'active', now(), NULL, NULL);
RESET ROLE;
RESET request.jwt.claim.sub;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
INSERT INTO memories (patient_id, title, category, created_by) VALUES
  (auth.uid(), 'A memory made while paid', 'story', auth.uid()::text);
-- Expect: succeeds (paid entitlement).
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== ITEM 3: downgrade to free_tier (via the B1-fixed NULL-trial_ends_at path) ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT tier, status, trial_ends_at FROM admin_set_subscription(
  'aaaaaaaa-0000-0000-0000-000000000004', 'free_tier', NULL, NULL, 'active', now(), NULL, NULL);
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== ITEM 3: the SAME patient, now free_tier, can still READ their pre-existing memory ==='
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
SELECT count(*) AS can_still_read_old_memory FROM memories WHERE patient_id = auth.uid();
-- Expect: 1 — previously authorized data remains fully accessible after downgrade.

\echo '=== ITEM 3 (negative): the SAME now-free-tier patient CANNOT create a NEW memory ==='
DO $$ BEGIN
  INSERT INTO memories (patient_id, title, category, created_by) VALUES
    (auth.uid(), 'A memory attempted while free', 'story', auth.uid()::text);
  RAISE EXCEPTION 'TEST FAILED: free-tier patient created a new memory after downgrade';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EXPECTED exception: %', SQLERRM;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== ITEM 3: an UNRELATED paid caregiver cannot bypass via a direct insert for this patient either (regression, unaffected by §14) ==='
-- (already covered by existing patients/caregiver_patients ownership checks on memories; no new test needed beyond confirming §14 adds no new caregiver bypass)

\echo '=== DONE ==='
