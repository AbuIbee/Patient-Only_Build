-- ============================================================================
-- 14b_PRODUCTION_POSTFLIGHT_VERIFICATION.sql — READ-ONLY. Run AFTER
-- 14_PRODUCTION_MIGRATION_PACKAGE.sql commits successfully. Target:
-- ktehhvmmwnsbcvpjcmzt only.
-- ============================================================================

-- V1 — row-count snapshot, diff against 14a's Q7. Expected: IDENTICAL counts
-- for patients/caregiver_patients (this migration creates no new rows in
-- either); profiles count identical (no row added/removed, only columns/
-- grants changed); subscriptions count identical UNLESS a legitimate
-- app-level signup happened between preflight and this check (not caused by
-- the migration itself, which inserts no subscriptions row).
SELECT 'profiles' t, count(*) c FROM profiles
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'caregiver_patients', count(*) FROM caregiver_patients
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions;

-- V2 — REVIEW P02: patients.INSERT privilege is restored for authenticated.
-- Expected: TRUE (was FALSE or never-applicable in 14a's Q6 baseline).
SELECT has_table_privilege('authenticated', 'public.patients', 'INSERT') AS authenticated_can_insert_patients;

-- V3 — REVIEW P03: is_admin() exists and the three profiles policies use it,
-- not an inline subquery. Expected: 3 rows, each qual/with_check containing
-- "is_admin()".
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE tablename = 'profiles' AND policyname LIKE 'Admin%';

-- V3b — REVIEW ROUND 2 / B2: is_admin()'s body is UNCHANGED from whatever
-- 14a Q4c captured pre-migration, if it already existed then (this file's
-- §3 is state-aware and never overwrites a pre-existing is_admin()). Diff
-- this against 14a's Q4c result.
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'is_admin';

-- V4 — REVIEW P03: the actual regression test — an admin session's own
-- `SELECT * FROM profiles` must succeed without "infinite recursion detected
-- in policy for relation profiles". (Run this as an authenticated admin
-- session, not as the migration role, which bypasses RLS entirely and would
-- not surface the bug either way.)
-- SELECT count(*) FROM profiles; -- run under an admin JWT

-- V5 — REVIEW P01: every previously-missing object now exists.
SELECT 'subscriptions.plan' AS object, EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='plan'
) AS exists_now
UNION ALL SELECT 'subscriptions.program', EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='program'
)
UNION ALL SELECT 'promo_codes', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='promo_codes')
UNION ALL SELECT 'promo_redemptions', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='promo_redemptions')
UNION ALL SELECT 'reminders', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='reminders')
UNION ALL SELECT 'therapist_relationships', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='therapist_relationships')
UNION ALL SELECT 'patient-documents bucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='patient-documents')
UNION ALL SELECT 'patient-media bucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='patient-media')
UNION ALL SELECT 'audio-files bucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='audio-files')
UNION ALL SELECT 'music-files bucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='music-files');
-- Expected: every row TRUE.

-- V6 — REVIEW P04: create_patient_with_caregiver's new signature is live and
-- the NOT NULL fields are enforced.
SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_patient_with_caregiver';
-- Expected: pronargs = 15 (was 13 before this fix).

-- V7 — REVIEW ROUND 2 / B1 FIX (supersedes the prior round's V7, which
-- tested the now-removed RAISE EXCEPTION behavior): admin_set_subscription
-- ACCEPTS a NULL p_trial_ends_at for a non-program assignment, matching the
-- real admin UI's actual preset payloads. Run as an admin session, with the
-- EXACT payloads src/pages/admin/accountTypes.ts's saveAccountType() sends
-- for each of its four NULL-trialDays presets:
-- SELECT (admin_set_subscription('<id>', 'paid_tier', 'daily_care', NULL, 'active', now(), NULL, NULL)).trial_ends_at;   -- Daily Care
-- SELECT (admin_set_subscription('<id>', 'paid_tier', 'full_support', NULL, 'active', now(), NULL, NULL)).trial_ends_at; -- Full Support
-- SELECT (admin_set_subscription('<id>', 'master', NULL, NULL, 'active', now(), NULL, NULL)).trial_ends_at;              -- Master
-- SELECT (admin_set_subscription('<id>', 'free_tier', NULL, NULL, 'canceled', now(), NULL, NULL)).trial_ends_at;         -- Canceled
-- Expected: all four succeed (no exception), each returns trial_ends_at IS
-- NULL, and `has_active_subscription(<id>)` then correctly reflects each
-- status (true for the three 'active' ones, false for 'canceled' — via the
-- status check, not trial_ends_at, since NULL there means "no trial-clock
-- expiry," not "inactive"). This is the exact regression the prior round's
-- fix would have caused in the real admin UI — re-verify here specifically
-- because it was wrong once already.

-- V7b — REVIEW ROUND 2 / B1: subscriptions.trial_ends_at now accepts NULL.
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'subscriptions' AND column_name = 'trial_ends_at';
-- Expected: 'YES'.

-- V8 — REVIEW P06: profiles_role_check is actually present (not silently
-- skipped) after the migration.
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_role_check';
-- Expected: 1 row, the six-value CHECK.

-- V9 — REVIEW P07: caregiver_patient_list still exists with its expected
-- columns (not dropped/recreated) and is now security_invoker.
SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'caregiver_patient_list';
SELECT column_name FROM information_schema.columns WHERE table_name = 'caregiver_patient_list' ORDER BY ordinal_position;
-- Expected: 'security_invoker=true' present in reloptions; column list
-- unchanged from whatever it was pre-migration (diff manually against a
-- pre-migration capture of this same query, since this file has no "before"
-- value to compare against on its own).

-- V10 — REVIEW P09: actual effective grants on profiles.role/email for
-- authenticated/anon/PUBLIC — not just "the GRANT statement ran".
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_name = 'profiles' AND column_name IN ('role', 'email')
ORDER BY grantee, column_name, privilege_type;
-- Expected: no UPDATE row for column 'role' at all (no grantee). INSERT on
-- 'email' present for 'authenticated' only (needed for new-row creation).
-- UPDATE on 'email' absent entirely (Auth's own flow is the only path).
-- Nothing for 'anon' or 'PUBLIC' on either column.
SELECT has_table_privilege('anon', 'public.profiles', 'SELECT') AS anon_can_select_profiles,
       has_table_privilege('anon', 'public.profiles', 'INSERT') AS anon_can_insert_profiles,
       has_table_privilege('anon', 'public.profiles', 'UPDATE') AS anon_can_update_profiles;
-- Expected: all FALSE.

-- V11 — REVIEW P10: admin_set_subscription exists exactly once (no stray
-- overload left over from a dynamic drop that didn't run, or from this
-- file's own explicit two DROP FUNCTION IF EXISTS statements leaving nothing
-- behind unexpectedly).
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'admin_set_subscription';
-- Expected: exactly 1 row, 8-argument signature.

-- V12 — REVIEW P12: redeem_promo_code's expiry is redemption-based. (Run as
-- an authenticated test/synthetic account with a seeded promo_codes row and
-- an OLD trial_started_at on their own subscriptions row:)
-- SELECT redeem_promo_code('<test-code>');
-- Expected: resulting promo_expires_at is now() + the code's days — NOT the
-- account's old trial_started_at + days. Also fire two concurrent
-- redemptions of a max_uses=1 code from two different synthetic accounts;
-- expected exactly one succeeds, the other gets "Invalid or expired
-- promotional code."

-- V13 — subscriptions GRANT hardening (029) still in effect after this file.
SELECT has_table_privilege('authenticated', 'public.subscriptions', 'INSERT') AS can_insert,
       has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE') AS can_update,
       has_table_privilege('authenticated', 'public.subscriptions', 'DELETE') AS can_delete;
-- Expected: all FALSE.

-- V14 — final policy catalog diff target (compare against 14a's Q8).
SELECT tablename, policyname, permissive, cmd FROM pg_policies
WHERE tablename IN ('profiles', 'patients', 'caregiver_patients', 'subscriptions', 'reminders', 'therapist_relationships', 'promo_codes')
ORDER BY tablename, cmd;

-- V15 — REVIEW P08, COUNTS CORRECTED PER REVIEW ROUND 2 / B3: every
-- pre-existing care_partner_checkins/media_uploads/patient_media_* policy
-- is still present, UNCHANGED, and UN-DUPLICATED; exactly 2 new
-- "(P08)"-tagged policies on each table and 3 on the storage bucket.
-- care_partner_checkins' real pre-migration baseline is 5 PERMISSIVE + 4
-- RESTRICTIVE = 9 (NOT 5 — the prior version of this file undercounted it
-- by omitting the 4 pre-existing RESTRICTIVE policies the second
-- independent review's own live catalog read surfaced).
SELECT policyname, cmd, permissive FROM pg_policies
WHERE tablename = 'care_partner_checkins' ORDER BY policyname;
-- Expected 11 rows total: the 9 original (5 permissive named exactly as
-- supplied + 4 restrictive, names/predicates not independently known to
-- this file — confirm via 14a Q2) + 2 new: "Checkin patient or linked
-- caregiver (FQA-019/SEC-008)" (RESTRICTIVE INSERT) and "Linked caregivers
-- can read their patients' checkins (P08)" (PERMISSIVE SELECT).
SELECT policyname, cmd, permissive FROM pg_policies
WHERE tablename = 'media_uploads' ORDER BY policyname;
-- Expected 5 rows: media_insert, media_select, media_delete (3 original,
-- unchanged) + 2 new: "Media patient or linked caregiver (FQA-019/SEC-008)"
-- (RESTRICTIVE INSERT) and "Linked caregivers can read their patients'
-- media (P08)" (PERMISSIVE SELECT).
SELECT policyname, cmd, permissive FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname LIKE '%patient%' ORDER BY policyname;
-- Expected 6 rows: patient_media_select/insert/delete (unchanged) + 3 new
-- "Linked caregivers can .../upload/delete patient-media objects (P08)".

SELECT tablename, permissive, count(*) FROM pg_policies
WHERE tablename IN ('care_partner_checkins', 'media_uploads') GROUP BY tablename, permissive ORDER BY tablename, permissive;
-- Expected exactly: care_partner_checkins PERMISSIVE=6, RESTRICTIVE=5;
-- media_uploads PERMISSIVE=4, RESTRICTIVE=1. (9+2=11 and 3+2=5 total,
-- matching above; this breaks it down by permissive/restrictive to compare
-- directly against 14a's Q2b pre-migration baseline: care_partner_checkins
-- PERMISSIVE +1/RESTRICTIVE +1, media_uploads PERMISSIVE +1/RESTRICTIVE +1.)

-- V15b — REVIEW ROUND 2 / B3: negative test for unrelated patients, not
-- just a structural policy-count check. (Run as a caregiver linked to ONE
-- patient, querying an UNRELATED patient's data:)
-- SELECT count(*) FROM care_partner_checkins WHERE patient_id = '<unrelated-patient-id>';
-- SELECT count(*) FROM media_uploads WHERE patient_id = '<unrelated-patient-id>';
-- Expected: 0 rows both — the new caregiver-SELECT policies are scoped by
-- caregiver_patients and must not return rows for a patient the caller is
-- not linked to (dry-run confirmed this exact case).

-- V15c — REVIEW ROUND 2 / B3: Temporary User RESTRICTIVE policies
-- (wherever they live on these two tables — names/predicates not
-- independently known to this file, see 14a Q2/Q3) are still present,
-- unchanged, after this migration. Diff this against the SAME query run
-- pre-migration (14a Q2) — the restrictive-policy row set for each table
-- should be identical except for the ONE new restrictive policy §11 adds
-- to each.
SELECT policyname, qual FROM pg_policies
WHERE tablename IN ('care_partner_checkins', 'media_uploads') AND permissive = 'RESTRICTIVE'
ORDER BY tablename, policyname;
-- Expected 5 restrictive rows on care_partner_checkins (4 pre-existing,
-- unknown-to-this-file names, + "Checkin patient or linked caregiver
-- (FQA-019/SEC-008)") and 1 on media_uploads ("Media patient or linked
-- caregiver (FQA-019/SEC-008)" — there were zero restrictive policies on
-- media_uploads before this migration). Confirm both new names are exactly
-- as written, not silently truncated (a real defect this round's dry-run
-- caught and fixed in a different pair of policy names; both of these were
-- already verified under 63 bytes).

-- V16 — REVIEW P08: admin's pre-existing media_insert bypass (is_admin_check())
-- is not narrowed by the new RESTRICTIVE policy on media_uploads.
-- REVIEW ROUND 2 / B3 FIX: the example below is illustrative only — supply
-- every NOT NULL column media_uploads actually has in production (not
-- independently re-confirmed by this file beyond patient_id/uploader_id;
-- a failure here could otherwise be ambiguous between "RLS denied it" and
-- "a NOT NULL column was missing"). Run as an admin session, targeting a
-- patient the admin is NOT linked to:
-- INSERT INTO media_uploads (patient_id, uploader_id, file_url, <...any other
--   required columns>) VALUES ('<unrelated-patient-id>', auth.uid(),
--   'https://example/test.jpg', <...>);
-- Expected: succeeds (this round's local dry-run confirmed this exact case
-- against its own reconstructed, necessarily-simplified table shape — the
-- real production table may have additional required columns this file
-- does not know about).

-- V17 — REVIEW P04: the admin-authorized patient-activation workflow is
-- confirmed functional end-to-end, and an ordinary caregiver still cannot
-- use it. (Run as an admin session, against a real profile in
-- provisioning_status='profile_created':)
-- SELECT * FROM create_patient_with_caregiver('<pending-patient-id>', '<first>', '<last>');
-- Expected: succeeds; returned row has the supplied first/last name; a
-- matching caregiver_patients row now links that patient to the admin.
-- Then as a non-admin caregiver session, the same call against any target:
-- expected RAISE EXCEPTION 'Only an administrator may create a new patient
-- record...'.

-- V18 — REVIEW ROUND 3 / item 2: the 16 (or however many) pre-existing
-- discrepant free-tier rows are UNTOUCHED, byte-for-byte, by this
-- migration. Compare this result against 14a's Q9 captured immediately
-- before running 14_.... Every user_id/trial_ends_at pair must match
-- exactly; the row SET must be identical (same ids, same count).
SELECT user_id, tier, status, trial_ends_at
FROM subscriptions WHERE tier = 'free_tier' AND status = 'active' AND trial_ends_at < now()
ORDER BY user_id;
-- Expected: IDENTICAL to 14a's Q9 result — if even one row differs or the
-- count changed, something modified subscriptions data outside what this
-- migration is supposed to do; investigate before proceeding further.

-- V19 — REVIEW ROUND 3 / item 2: those same rows now correctly register as
-- active via the entitlement function (without their data having changed —
-- V18 already confirms that). Run for each user_id V18 returned:
-- SELECT public.has_active_subscription('<user_id>');
-- Expected: true for every one.

-- V20 — REVIEW ROUND 3 / item 2 (negative): confirm no Temporary User/
-- Companion program row is newly, incorrectly treated as active regardless
-- of its own trial_ends_at.
-- SELECT user_id, program, trial_ends_at, public.has_active_subscription(user_id)
-- FROM subscriptions WHERE program IS NOT NULL AND trial_ends_at < now();
-- Expected: has_active_subscription = false for every row returned (an
-- expired program is still correctly inactive — §13's free-tier exemption
-- clause explicitly requires `program IS NULL` and does not apply here).

-- V21 — REVIEW ROUND 3 / item 3: paid-to-free downgrade preserves existing
-- data access while blocking new paid-only record creation. (Run as a
-- patient session that has existing memories/check-ins from before a
-- downgrade to free_tier:)
-- SELECT count(*) FROM memories WHERE patient_id = auth.uid();          -- expect > 0, unchanged from before downgrade
-- INSERT INTO memories (patient_id, title, created_by) VALUES (auth.uid(), 'test', auth.uid()::text); -- expect DENIED
-- Expected: the SELECT still returns the patient's pre-existing rows; the
-- INSERT is denied by the new "Free-tier accounts cannot create new
-- memories (REPAIR C)" RESTRICTIVE policy. Repeat for care_partner_checkins
-- if a real downgraded-patient account with existing check-ins is
-- available to test against.
