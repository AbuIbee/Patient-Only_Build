-- MMA-P1-CODEX-002 P1-08 — "Staging anonymous privilege/oracle
-- exposure." Independent Codex audit named is_authorized_for_patient,
-- is_patient_enterprise_covered(uuid), and patient_has_paid_entitlement
-- (uuid) as arbitrary-subject boolean oracles on hosted staging.
-- is_authorized_for_patient was already service_role-only locally.
-- Checking the other two against THIS repository's own local state
-- (not merely assuming the staging finding was staging-only) found a
-- real local defect: both take an arbitrary p_patient_id and are
-- directly, currently granted to `authenticated` -- any signed-in user
-- can probe an arbitrary UUID to learn "is this UUID an Enterprise-
-- covered patient" / "does this UUID hold a paid subscription."
--
-- *** IMPORTANT, discovered before writing the fix below: migration 106
-- already investigated revoking this exact grant and explicitly REJECTED
-- it, for a real, still-current reason. patient_has_paid_entitlement(uuid)
-- is called DIRECTLY inside two live RLS policies (memories and
-- care_partner_checkins, both "Free-tier accounts cannot..." INSERT
-- restrictions) evaluated as the invoking role itself, not through a
-- SECURITY DEFINER wrapper -- revoking `authenticated`'s EXECUTE would
-- make every ordinary memory/check-in INSERT fail outright with
-- "permission denied for function," not merely re-expose the oracle.
-- Migration 106 is NOT wrong and is NOT reverted here.
--
-- THE FIX: a self-scoped wrapper, my_patient_has_paid_entitlement(),
-- ALWAYS evaluates against auth.uid() and ignores any caller-supplied
-- id entirely -- it cannot be used as an oracle against a different
-- UUID no matter what. The two RLS policies are repointed to the
-- wrapper (their predicate was always effectively self-scoped anyway,
-- since memories/care_partner_checkins' OTHER permissive policy already
-- requires patient_id = auth.uid() before a row is insertable at all --
-- this is not a behavior change for any real user). THEN, and only
-- then, `authenticated`'s direct grant on the raw, arbitrary-argument
-- patient_has_paid_entitlement(uuid) is revoked. is_patient_enterprise_
-- covered(uuid) has no direct RLS caller anywhere in this schema
-- (verified via a live pg_policies query before writing this) and its
-- only real client path, is_my_enterprise_coverage_active(), is itself
-- SECURITY DEFINER and is unaffected by revoking the inner function's
-- grant on the original caller's role.
CREATE OR REPLACE FUNCTION public.my_patient_has_paid_entitlement()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.patient_has_paid_entitlement(auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.my_patient_has_paid_entitlement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_patient_has_paid_entitlement() TO authenticated;

DROP POLICY IF EXISTS "Free-tier accounts cannot create new memories (REPAIR C)" ON memories;
CREATE POLICY "Free-tier accounts cannot create new memories (REPAIR C)"
  ON memories AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.my_patient_has_paid_entitlement());

-- The original identifier was itself silently truncated to 63 bytes by
-- Postgres when first created (confirmed live against pg_policies, not
-- assumed) -- reused verbatim here so DROP POLICY actually matches it.
DROP POLICY IF EXISTS "Free-tier accounts cannot submit new care partner check-ins (RE" ON care_partner_checkins;
CREATE POLICY "Free-tier accounts cannot submit new care partner check-ins (RE"
  ON care_partner_checkins AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.my_patient_has_paid_entitlement());

REVOKE ALL ON FUNCTION public.patient_has_paid_entitlement(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_has_paid_entitlement(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.is_patient_enterprise_covered(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_patient_enterprise_covered(UUID) TO service_role;
