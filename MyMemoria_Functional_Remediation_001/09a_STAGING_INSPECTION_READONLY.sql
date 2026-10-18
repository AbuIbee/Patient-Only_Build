-- 09a_STAGING_INSPECTION_READONLY.sql
-- MYMEMORIA-GITHUB-SUPABASE-COMPAT-001
--
-- Run this FIRST against staging (axurszlibxwwptkczztt) and paste the full
-- output back. Every statement here is read-only (SELECT against catalog
-- views) — nothing here writes, locks, or alters anything. Confirm you are
-- connected to axurszlibxwwptkczztt, NOT production (ktehhvmmwnsbcvpjcmzt)
-- and NOT Paid2You, before running.

-- 1. Exact migration history already recorded (if any) — confirms whether
--    the four named staging migrations show up here under those names, or
--    whether they were applied without being recorded.
SELECT version, name, statements IS NOT NULL AS has_statements
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 2. Every base table that currently exists in public, so I can diff
--    against the "12-table baseline + 4 corrections" description and
--    against production's confirmed 29-table catalog.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 3. Every view that currently exists in public, plus whether it's already
--    security_invoker-hardened (this directly answers the
--    caregiver_patient_list / therapist_relationship_list question migration
--    014 now checks for at runtime, but confirming it here lets us verify
--    the migration's own DO-block logic reasoned correctly after the fact).
SELECT c.relname AS view_name,
       c.reloptions,
       ('security_invoker=true' = ANY (COALESCE(c.reloptions, ARRAY[]::text[]))) AS is_security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY c.relname;

-- 4. Exact columns on every table this reconciliation package touches or
--    depends on, so any remaining real-vs-assumed shape mismatch is caught
--    before applying anything else.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'patients', 'caregiver_patients', 'subscriptions',
    'medications', 'reminders', 'therapist_relationships',
    'patient_document_uploads', 'patient_intake', 'promo_codes',
    'promo_redemptions'
  )
ORDER BY table_name, ordinal_position;

-- 5. Every RLS policy on the tables this package touches, with its exact
--    command and permissive/restrictive type (names only here — see query 6
--    for the actual USING/WITH CHECK expressions on the ones that matter
--    most).
SELECT schemaname, tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'patients', 'caregiver_patients', 'subscriptions',
    'medications', 'reminders', 'therapist_relationships',
    'patient_document_uploads', 'patient_intake'
  )
ORDER BY tablename, cmd, policyname;

-- 6. Full USING/WITH CHECK expressions for anything named like a temp-user
--    guard — this is the one open question blocking the Temporary/
--    Companion program design (profiles.temp_user_expires_at +
--    block_temp_*/block_expired_temp_* vs. this engagement's proposed
--    subscriptions.program + is_my_program_active()). If staging has NONE
--    of these (expected, per the "12-table baseline" description), this
--    returns zero rows and that's a complete, useful answer on its own.
SELECT schemaname, tablename, policyname, cmd, permissive,
       pg_get_expr(qual, polrelid)       AS using_expression,
       pg_get_expr(with_check, polrelid) AS with_check_expression
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_policies pp ON pp.schemaname = n.nspname AND pp.tablename = c.relname AND pp.policyname = pol.polname
WHERE n.nspname = 'public'
  AND (pol.polname ILIKE '%temp%' OR pol.polname ILIKE '%block%');

-- 7. Does profiles.temp_user_expires_at exist on staging at all right now?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'temp_user_expires_at';

-- 8. Every function this package depends on or that competing designs
--    might already define — confirms exact current signatures before any
--    CREATE OR REPLACE runs, and tells us whether is_admin() vs
--    is_admin_check() (production's real helper name per the audit) exists
--    here at all.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_set_subscription', 'provision_free_subscription', 'redeem_promo_code',
    'admin_set_role', 'handle_new_user', 'create_patient_with_caregiver',
    'is_my_program_active', 'is_admin', 'is_admin_check', 'claim_unclaimed_patient'
  )
ORDER BY p.proname;

-- 9. Storage buckets currently present (confirms patient-documents is
--    really absent here too, matching production, before 007 creates it).
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 10. Row counts on the tables this package will write synthetic test data
--     into during Phase D, confirmed empty before we start (matches the
--     "zero registered users and zero stored files" baseline) so cleanup
--     verification afterward has a known starting point.
SELECT 'profiles' AS t, count(*) FROM profiles
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'caregiver_patients', count(*) FROM caregiver_patients
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions;
