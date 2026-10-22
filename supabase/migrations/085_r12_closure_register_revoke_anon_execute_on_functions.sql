-- MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave B — full migration/RLS/RPC
-- authorization audit. CONFIRMED FINDING (DEFECT-ANON-EXECUTE-GRANT):
--
-- Every migration in this repository that creates a SECURITY DEFINER
-- function follows the pattern `REVOKE ALL ... FROM PUBLIC; GRANT
-- EXECUTE ... TO authenticated;`, written and reviewed throughout this
-- engagement as the thing that keeps an unauthenticated caller from
-- invoking these functions at all. It does not do that: Supabase's own
-- local/default `ALTER DEFAULT PRIVILEGES` setup grants EXECUTE on every
-- newly created function directly to the `anon` role as a SEPARATE,
-- EXPLICIT grant, not merely through the `PUBLIC` pseudo-role. Revoking
-- from `PUBLIC` revokes the implicit default; it does nothing to an
-- already-separately-granted `anon` entry. Confirmed via direct ACL
-- inspection (every SECURITY DEFINER function's `proacl` lists `anon`
-- explicitly) and live-tested: an anon-key-only HTTP call (no user JWT)
-- to e.g. `get_my_organizations`/`admin_set_role`/`remove_org_member`/
-- `record_patient_vitals` reaches Postgres and executes the function
-- body at the database privilege layer.
--
-- Impact assessment: sampled live against get_my_organizations (returns
-- [] — auth.uid() IS NULL, no row matches), admin_set_role,
-- remove_org_member, and record_patient_vitals (all three reject with
-- their own authorization RAISE EXCEPTION, since each depends on
-- auth.uid() either for an equality match that NULL can never satisfy,
-- or for a profiles lookup that NULL can never match). No RPC in this
-- schema has a public, unauthenticated calling convention — every
-- meaningful action in this app requires a signed-in session. No
-- currently-exploitable data exposure or privilege escalation was
-- found. This is still a confirmed defense-in-depth defect: the
-- intended "unauthenticated callers cannot even reach the function"
-- boundary has never actually existed, and any future function that
-- fails to fail-closed on a NULL auth.uid() would be silently
-- exploitable by a genuinely anonymous request. Closed here at the
-- grant layer, project-wide, in one pass, rather than function-by-
-- function (which would both be 100+ near-identical edits and would
-- recur on every future migration that repeats the same, now-shown-
-- insufficient REVOKE-FROM-PUBLIC pattern).
--
-- Fix: (1) revoke EXECUTE on every existing public-schema function from
-- `anon` directly; (2) set ALTER DEFAULT PRIVILEGES so every FUTURE
-- function created by this migration role no longer grants anon
-- EXECUTE at creation time, closing the recurrence path. `authenticated`
-- and `service_role` are untouched — every real caller in this app
-- authenticates first, so this has no functional effect on any existing
-- caller.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;', f.proname, f.args);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
