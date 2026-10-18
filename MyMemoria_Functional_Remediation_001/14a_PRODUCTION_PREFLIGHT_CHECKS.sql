-- ============================================================================
-- 14a_PRODUCTION_PREFLIGHT_CHECKS.sql — READ-ONLY. Run BEFORE
-- 14_PRODUCTION_MIGRATION_PACKAGE.sql. Every query below must return the
-- "Expected" result before proceeding. Target: ktehhvmmwnsbcvpjcmzt only.
-- ============================================================================

-- Q1 — no existing profiles.role value outside the six approved values
-- (prevents 14_...'s §1 role-CHECK statement from raising and aborting the
-- whole transaction partway through on a row this didn't anticipate).
-- Expected: 0 rows.
SELECT id, role FROM profiles
WHERE role NOT IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist', 'pending');

-- Q2 — the real, live policy catalog for care_partner_checkins and
-- media_uploads. §11 (REVIEW P08) is now written against the catalog
-- supplied in the "MYMEMORIA FINAL MIGRATION CLOSURE" follow-up. Re-run
-- this IMMEDIATELY before executing 14_... anyway, as a final confirmation
-- that nothing in this catalog changed since that snapshot was taken — if
-- any policy name/predicate below differs from what §11's comments quote,
-- STOP and re-verify §11 against the new reality before proceeding.
SELECT schemaname, tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('care_partner_checkins', 'media_uploads')
ORDER BY tablename, cmd;
-- Expected per the second independent review: care_partner_checkins = 5
-- PERMISSIVE + 4 RESTRICTIVE (9 total); media_uploads = 3 PERMISSIVE + 0
-- RESTRICTIVE (3 total). 14_...'s §11 comments quote the 5 PERMISSIVE
-- care_partner_checkins and 3 PERMISSIVE media_uploads policy names/
-- predicates exactly; the 4 existing RESTRICTIVE care_partner_checkins
-- policies' exact predicates are NOT known to that file (only their count
-- and permissive/restrictive split) — review them here for any SELECT-cmd
-- RESTRICTIVE policy specifically, since that would further constrain
-- (never widen) the new caregiver-SELECT policy §11 adds.

-- Q2b — sanity-check the counts directly (cross-check against Q2's raw rows).
SELECT tablename, permissive, count(*) FROM pg_policies
WHERE tablename IN ('care_partner_checkins', 'media_uploads')
GROUP BY tablename, permissive ORDER BY tablename, permissive;

-- Q3 — confirm is_temp_user()/is_temp_user_expired()'s real bodies, so any
-- future change near Temporary User logic can be verified against them.
-- 14_...'s migration does not redefine either function; this is a read for
-- the record, not a precondition for the migration to proceed.
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname IN ('is_temp_user', 'is_temp_user_expired', 'caller_is_temp_user_program');

-- Q4 — confirm has_active_subscription(uuid)'s real body, to verify 14_...'s
-- §9 (REVIEW B1: passes p_trial_ends_at through as-is, including NULL, for
-- a non-program grant) actually aligns with it. The second independent
-- review's own live read already confirmed this function "checks for a
-- future or NULL trial_ends_at" — re-run this as the final confirmation
-- immediately before executing 14_..., not as a first discovery.
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'has_active_subscription';

-- Q4b — REVIEW B1: confirm subscriptions.trial_ends_at's current
-- nullability, so 14_...'s §9a (`ALTER COLUMN trial_ends_at DROP NOT
-- NULL`) is understood as either a real, needed fix or a confirmed no-op
-- before running it either way.
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'subscriptions' AND column_name = 'trial_ends_at';

-- Q5 — confirm which of the "missing dependency" objects (REVIEW P01) are
-- still actually absent at execution time (the review's findings are from
-- 2026-10-17; re-run immediately before applying 14_... in case anything
-- changed since).
SELECT 'subscriptions.plan' AS object, EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='plan'
) AS exists_now
UNION ALL SELECT 'subscriptions.program', EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='program'
)
UNION ALL SELECT 'promo_codes', EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name='promo_codes'
)
UNION ALL SELECT 'promo_redemptions', EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name='promo_redemptions'
) -- REVIEW ROUND 2 / B2: this is EXPECTED TRUE, not false — CLAUDE.md
  -- itself already lists promo_redemptions as a known existing production
  -- table, and the second independent review's own read confirms it exists
  -- (zero rows at review time). 14_...'s §7c CREATE TABLE IF NOT EXISTS for
  -- it is therefore expected to be a no-op; its defensive ALTER TABLE
  -- statements (DROP NOT NULL on user_id, ADD COLUMN IF NOT EXISTS
  -- redeemed_at) are what actually matter against the real existing table.
UNION ALL SELECT 'reminders', EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name='reminders'
)
UNION ALL SELECT 'therapist_relationships', EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name='therapist_relationships'
)
UNION ALL SELECT 'patient-documents bucket', EXISTS (
  SELECT 1 FROM storage.buckets WHERE id='patient-documents'
)
UNION ALL SELECT 'patient-media bucket', EXISTS (
  SELECT 1 FROM storage.buckets WHERE id='patient-media'
)
UNION ALL SELECT 'is_admin()', EXISTS (
  SELECT 1 FROM pg_proc WHERE proname='is_admin'
) -- REVIEW ROUND 2 / B2: EXPECTED TRUE, not false — the second independent
  -- review's own read confirms public.is_admin() already exists on
  -- production (SECURITY DEFINER). 14_...'s §3 is now state-aware: if this
  -- reads TRUE, it leaves the existing function completely untouched
  -- (REVIEW B2 fix) rather than overwriting it. Run Q4c below to see its
  -- real body and confirm it actually performs an admin-role check before
  -- trusting the policies in §4 that depend on it.
UNION ALL SELECT 'admin_set_subscription() (any signature)', EXISTS (
  SELECT 1 FROM pg_proc WHERE proname='admin_set_subscription'
)
UNION ALL SELECT 'create_patient_with_caregiver() (any signature)', EXISTS (
  SELECT 1 FROM pg_proc WHERE proname='create_patient_with_caregiver'
)
UNION ALL SELECT 'is_admin_check() (REVIEW P08 — expected TRUE, referenced not defined by 14_...)', EXISTS (
  SELECT 1 FROM pg_proc WHERE proname='is_admin_check'
);
-- Expected: subscriptions.plan/program, promo_codes, reminders,
-- therapist_relationships, patient-documents bucket = FALSE (confirmed
-- genuinely absent). promo_redemptions, is_admin(), is_admin_check() =
-- TRUE (confirmed already existing — REVIEW ROUND 2 correction; the prior
-- round of this file wrongly expected these three as FALSE). patient-media
-- bucket, admin_set_subscription(), create_patient_with_caregiver() =
-- FALSE (genuinely new, no prior version exists on production for either
-- function). If any result differs from this, STOP — something changed
-- since the review and 14_... needs re-review against the new state before
-- running, not run as-is.

-- Q4c — REVIEW ROUND 2 / B2: the real body of the already-existing
-- is_admin(), to manually confirm it performs the same admin-role check
-- 14_...'s §4 policies (and §8/§9's is_admin() calls) assume, before
-- trusting a function this migration will NOT overwrite.
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'is_admin';

-- Q6 — current table-level privilege on patients.INSERT for `authenticated`.
-- REVIEW ROUND 2 / B2 CORRECTION: EXPECTED TRUE, not false. Migration 014's
-- REVOKE INSERT (the thing P02 was about) has never actually been applied
-- to production — none of this engagement's draft migrations have — so
-- production's own, never-touched grant for `authenticated` on `patients`
-- was never revoked in the first place. 14_...'s §8 REVOKE-then-GRANT pair
-- nets out to the exact same privilege state either way (safe, verified by
-- this round's dry-run); P02's actual point was that THIS FILE's own
-- internal logic must not revoke without restoring — not that production
-- currently lacks the grant. This query exists to catch an UNEXPECTED
-- FALSE (meaning something upstream already changed this independently of
-- this engagement, worth investigating before proceeding), not to validate
-- a "should be false" assumption.
SELECT has_table_privilege('authenticated', 'public.patients', 'INSERT') AS authenticated_can_insert_patients;

-- Q7 — row-count/id-set snapshot, to diff against 14b's postflight snapshot.
SELECT 'profiles' t, count(*) c FROM profiles
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'caregiver_patients', count(*) FROM caregiver_patients
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions;

-- Q8 — current policy catalog on profiles, patients, caregiver_patients,
-- subscriptions (to diff against 14b's postflight catalog and confirm only
-- the intended policies changed).
SELECT tablename, policyname, permissive, cmd FROM pg_policies
WHERE tablename IN ('profiles', 'patients', 'caregiver_patients', 'subscriptions')
ORDER BY tablename, cmd;

-- Q9 — REVIEW ROUND 3 / item 2: the exact set of rows 14_...'s §13 fixes
-- (at the entitlement-logic layer, never by touching this data). Capture
-- this BEFORE running 14_..., and re-run it AFTER (14b's V18) — the row
-- set and every trial_ends_at value must be BYTE-FOR-BYTE IDENTICAL; §13
-- touches no existing row.
SELECT user_id, tier, status, trial_ends_at
FROM subscriptions WHERE tier = 'free_tier' AND status = 'active' AND trial_ends_at < now()
ORDER BY user_id;
SELECT count(*) AS free_tier_active_with_past_trial_end
FROM subscriptions WHERE tier = 'free_tier' AND status = 'active' AND trial_ends_at < now();
-- Expected per the second independent review: 16.

-- Q10 — REVIEW ROUND 3 / item 2: provision_free_subscription()'s current
-- state and signature. 14_...'s §13a uses a plain CREATE OR REPLACE
-- (no-arg signature, so always safe regardless of whether it already
-- exists) — this is informational, to see what it currently does if it's
-- already live.
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname = 'provision_free_subscription' AND pronargs = 0;

-- Q11 — REVIEW ROUND 3 / item 3: confirm `memories` exists (001's original
-- schema; not independently re-confirmed by either review, unlike
-- care_partner_checkins/media_uploads) and its real policy catalog, before
-- 14_...'s §14 adds a RESTRICTIVE INSERT policy to it.
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memories') AS memories_exists;
SELECT policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE tablename = 'memories' ORDER BY cmd;
-- If memories_exists is FALSE, §14's memories policy will skip with a
-- NOTICE (not abort) — confirm that is the expected outcome, not a
-- surprise, before running 14_....
