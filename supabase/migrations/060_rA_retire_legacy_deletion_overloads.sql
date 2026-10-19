-- REMEDIATION A — retire the legacy, unfenced deletion-lifecycle RPC
-- overloads (Senior Architect Execution Contract, P0).
--
-- CONFIRMED LIVE ON STAGING before this fix: migration 055 introduced
-- caregiver_finish_registration_deletion(uuid, uuid) and
-- caregiver_cancel_registration_deletion_lock(uuid, uuid) via
-- CREATE OR REPLACE FUNCTION — but Postgres only replaces a function
-- with the EXACT SAME argument signature. Because the new versions took
-- an additional uuid argument, Postgres created two ADDITIONAL
-- overloaded functions rather than replacing the originals. The legacy
-- one-argument versions survived, fully intact with their ORIGINAL,
-- pre-fencing logic (no deletion_operation_id check at all), and both
-- were confirmed still executable by anon AND authenticated
-- (`has_function_privilege('anon', ..., 'EXECUTE') = true` on all four
-- overloads, including the two legacy ones — despite migration 049's
-- original explicit REVOKE ALL FROM PUBLIC on the one-argument
-- versions; Supabase's schema-level default privileges appear to have
-- re-granted anon EXECUTE at some point after that, and migration 055
-- never issued any REVOKE/GRANT at all for its new two-argument
-- overloads). This completely bypassed the entire S2 fencing
-- mechanism: any caller could call the OLD one-argument
-- caregiver_finish_registration_deletion(p_registration_id) directly,
-- which only checked `deletion_locked_at IS NOT NULL` with no operation
-- id requirement whatsoever, defeating the "stale operation cannot act
-- on a newer attempt" protection S2 was built to establish.
--
-- Verified before dropping: no view, trigger, or other function body in
-- this schema references either legacy one-argument signature (checked
-- pg_depend-via-pg_rewrite for views/triggers, and a source-text scan of
-- every other function body); the only real application caller
-- (supabase/functions/delete-pending-registration/index.ts) has called
-- the two-argument signatures exclusively since migration 055/commit
-- f3e0c06d. Safe to drop outright rather than merely revoke.

DROP FUNCTION IF EXISTS public.caregiver_finish_registration_deletion(uuid);
DROP FUNCTION IF EXISTS public.caregiver_cancel_registration_deletion_lock(uuid);

-- Defense in depth: explicitly re-assert the intended grants on the
-- surviving two-argument versions regardless of whatever default-
-- privilege behavior produced the anon grant in the first place.
REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.caregiver_finish_registration_deletion(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.caregiver_cancel_registration_deletion_lock(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_cancel_registration_deletion_lock(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.caregiver_cancel_registration_deletion_lock(uuid, uuid) TO authenticated;

-- caregiver_begin_registration_deletion(uuid) was never duplicated
-- (migration 055 used CREATE OR REPLACE on the SAME single-argument
-- signature), so only one overload exists — but re-assert its grants
-- too, for the same reason the above two needed it.
REVOKE ALL ON FUNCTION public.caregiver_begin_registration_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caregiver_begin_registration_deletion(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.caregiver_begin_registration_deletion(uuid) TO authenticated;
