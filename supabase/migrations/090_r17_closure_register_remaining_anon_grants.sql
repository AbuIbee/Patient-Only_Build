-- MASTER ENTERPRISE COMPLETION DIRECTIVE §2 — re-validation of the
-- Supabase authorization audit through migration 089. Re-running the
-- same anon-execute scan migration 085 was built to close found 6
-- residual functions still callable by anon: caller_is_expired_companion,
-- caller_is_temp_user_program, enforce_patient_safety_plan_provenance,
-- enforce_task_status_actor, handle_new_user, sync_profile_email_from_auth.
--
-- Root cause, confirmed by inspecting each one's actual ACL: these six
-- never had a separate, explicit anon grant at all (unlike the ~99
-- other functions migration 085 fixed) — they were inheriting EXECUTE
-- through the un-revoked PUBLIC pseudo-role grant every Postgres
-- function receives at creation, because their own original migrations
-- never included a `REVOKE ALL ... FROM PUBLIC` line. Migration 085's
-- loop only revoked anon's OWN grant; it never touched PUBLIC itself,
-- so these six were untouched by it.
--
-- Impact, confirmed live: four of the six are RETURNS TRIGGER functions
-- (handle_new_user, sync_profile_email_from_auth,
-- enforce_patient_safety_plan_provenance, enforce_task_status_actor) —
-- PostgREST structurally refuses to expose a trigger-return function
-- as a callable RPC at all (confirmed: a direct POST to
-- /rest/v1/rpc/handle_new_user returns 404 PGRST202, "could not find
-- the function"). These were never reachable regardless of the ACL.
-- The remaining two (caller_is_expired_companion,
-- caller_is_temp_user_program) ARE reachable and return a boolean —
-- confirmed live to return `false` harmlessly for an anon caller
-- (auth.uid() is NULL, so the underlying check never matches), no data
-- exposure. Still closed here for the same defense-in-depth reason as
-- migration 085: "happens to return false today" is not a substitute
-- for the grant not existing at all.
REVOKE EXECUTE ON FUNCTION public.caller_is_expired_companion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.caller_is_temp_user_program() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_is_expired_companion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_temp_user_program() TO authenticated;

-- Trigger functions are revoked from PUBLIC too, purely for ACL
-- hygiene/consistency with the rest of the schema — they remain
-- unreachable via RPC either way (PostgREST's own trigger-function
-- exclusion, confirmed above), so this has no functional effect, but
-- an ACL audit should not find an unexplained PUBLIC grant anywhere.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_patient_safety_plan_provenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_task_status_actor() FROM PUBLIC;
-- Caught by a second, exhaustive re-sweep after the fixes above (not
-- present in the original 105-function list because that first audit
-- filtered to prosecdef=true only; this one is a plain trigger
-- function, not SECURITY DEFINER, but carried the same un-revoked
-- PUBLIC grant). A third full re-sweep after this line found zero
-- remaining anon-executable functions in the public schema.
REVOKE EXECUTE ON FUNCTION public.sync_phone_normalized() FROM PUBLIC;
