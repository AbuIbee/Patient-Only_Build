-- HCN production-only policy reconciliation; code-only, not deployed.
-- Depends on 20261101090000_hcn_p0_current_staff_clinical_authorization.sql.
-- Preserve all five historically REQUIRED policies and both pending-Director policies.
-- Remove only two independently established equivalent policy duplicates.
DROP POLICY IF EXISTS "Patients can view their own memories" ON public.memories;
DROP POLICY IF EXISTS "Only organization directors can view their organization's licen" ON public.organization_licenses;

-- Independent Codex review 004 found this file's original guard-validation
-- loop unsafe (same root cause as 090000's S01-R1/S02-R3): position()-based
-- presence checks only prove a required fragment EXISTS somewhere, never
-- that the clause contains exactly what is expected and nothing else, and
-- the loop unconditionally overwrote BOTH named guard policies every run
-- with no validate-before-mutate boundary (S02-R4-class).
--
-- This revision:
--   1. Uses the same exact-occurrence-counting, schema-qualification- and
--      whitespace-normalized technique as 090000 (via a locally-scoped,
--      re-declared pg_temp helper -- each migration file is independently
--      reviewable and must not depend on another file's temp objects
--      surviving into its own session).
--   2. Removes the double-authorship redundancy with 090000: the
--      'linked caregiver, or' guard is already one of 090000's own 29
--      manifest rows, fully and rigorously validated and upgraded there --
--      this file no longer re-derives or re-writes it a second time with an
--      independently hand-maintained predicate that could drift from
--      090000's. This file now only extends the SEPARATE, historical-only
--      'FQA-019/SEC-008' guard (not part of 090000's manifest; absent from
--      the fresh/reviewed baseline catalog entirely) when it is present.
--   3. Makes the free-tier guard's correction validate-before-mutate and
--      safe to replay (M1 -> M2 -> M2), instead of an unconditional ALTER.
--
-- Scope honestly stated: exact-occurrence counting on named anchors proves
-- the hcn_current_staff_patient_access call this migration adds has the
-- correct argument list and is neither missing nor duplicated, and that
-- the known required disjuncts (patient_id = auth.uid(), the
-- caregiver_patients relationship) are each present exactly once. It does
-- NOT constitute a full canonical-string equality proof of the ENTIRE
-- 'FQA-019/SEC-008' expression against committed ground truth, because no
-- committed baseline in this repository contains that specific historical-
-- only policy's original full text (the fresh/reviewed baseline catalog
-- predates it; it was observed only in a production catalog snapshot this
-- repository does not hold). Independent Codex review against the actual
-- captured historical snapshot remains required before this is treated as
-- a complete closure of S01-R1/S02-R3 for that one specific policy -- see
-- audit-output/HCN_MASTER_REMEDIATION_20261101/01_S01_S02_CORRECTIONS.md.
CREATE OR REPLACE FUNCTION pg_temp.hcn_norm(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(coalesce(p,''), '\s+', '', 'g'),
           '(^|[^a-zA-Z0-9_])public\.(hcn_current_staff_patient_access|staff_patient_assignments)',
           '\1\2', 'g')
$$;

-- CONFIRMED LIVE (same class of defect as 090000's own TO-authenticated
-- correction, found the same way -- by actually running this against an
-- anon REST call, not assumed): FQA-019/SEC-008 carries no `TO` clause
-- (applies to every role, anon included). Its original content has no
-- function call at all (plain auth.uid()/EXISTS comparisons), so it was
-- harmless for anon; adding the hcn_current_staff_patient_access() call
-- without ALSO rescoping it `TO authenticated` would turn "anon gets an
-- empty/denied result" into a hard 42501 permission-denied error on
-- every anonymous check-in INSERT attempt. The ALTER below rescopes the
-- role in the SAME statement as the content extension, exactly mirroring
-- migration 106's own established fix for a disjoint set of 56 policies.
DO $guard$
DECLARE
  c text; cn text; live_roles text;
  patient_norm constant text := 'patient_id=auth.uid()';
  caregiver_tbl_norm constant text := 'caregiver_patients';
  caregiver_id_norm constant text := 'caregiver_id=auth.uid()';
  wrap_norm constant text := '((spa.is_active=true)ANDhcn_current_staff_patient_access(spa.organization_id,spa.patient_id))';
  call_norm constant text := 'hcn_current_staff_patient_access(';
  staff_branch constant text :=
    'EXISTS ( SELECT 1 FROM public.staff_patient_assignments spa WHERE spa.patient_id = care_partner_checkins.patient_id AND spa.user_id = auth.uid() AND ((spa.is_active = true) AND public.hcn_current_staff_patient_access(spa.organization_id, spa.patient_id)) )';
  n_patient integer; n_caretbl integer; n_careid integer; w_count integer; h_count integer;
BEGIN
  SELECT with_check, roles::text INTO c, live_roles FROM pg_policies
    WHERE schemaname='public' AND tablename='care_partner_checkins'
      AND policyname='Caller must be the check-in''s own patient (FQA-019/SEC-008)'
      AND cmd='INSERT' AND permissive='RESTRICTIVE';

  IF c IS NOT NULL THEN
    IF live_roles NOT IN ('{public}','{authenticated}') THEN
      RAISE EXCEPTION 'Unexpected role scope on FQA-019/SEC-008: %',live_roles;
    END IF;
    cn := pg_temp.hcn_norm(c);
    n_patient := (length(cn)-length(replace(cn,patient_norm,'')))/length(patient_norm);
    n_caretbl := (length(cn)-length(replace(cn,caregiver_tbl_norm,'')))/length(caregiver_tbl_norm);
    n_careid  := (length(cn)-length(replace(cn,caregiver_id_norm,'')))/length(caregiver_id_norm);
    w_count   := (length(cn)-length(replace(cn,wrap_norm,'')))/length(wrap_norm);
    h_count   := (length(cn)-length(replace(cn,call_norm,'')))/length(call_norm);

    IF n_patient<>1 OR n_caretbl<>1 OR n_careid<>1 THEN
      RAISE EXCEPTION 'Unsupported FQA-019/SEC-008 ownership shape (expected ownership anchors not found exactly once)';
    END IF;
    IF h_count <> w_count THEN
      RAISE EXCEPTION 'Unexpected helper call or wrong arguments in FQA-019/SEC-008';
    END IF;

    IF w_count = 1 AND live_roles = '{authenticated}' THEN
      NULL; -- already correctly extended (content + role scope); idempotent no-op
    ELSIF w_count = 0 AND live_roles = '{public}' THEN
      EXECUTE format('ALTER POLICY %I ON public.care_partner_checkins TO authenticated WITH CHECK ((%s) OR (%s))',
        'Caller must be the check-in''s own patient (FQA-019/SEC-008)', c, staff_branch);
    ELSE
      RAISE EXCEPTION 'Unexpected duplicate staff guard in FQA-019/SEC-008';
    END IF;
  END IF;

  -- No unexpected restrictive ownership guard may coexist -- the two named
  -- guards (one may be absent in a fresh environment), the free-tier
  -- guard, and the temporary-program guard are the only permitted
  -- restrictive INSERT policies on this table.
  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='care_partner_checkins'
      AND cmd='INSERT' AND permissive='RESTRICTIVE'
      AND policyname NOT IN (
        'Caller must be the check-in''s own patient (FQA-019/SEC-008)',
        'Caller must be the check-in''s own patient, linked caregiver, or',
        'Free-tier accounts cannot submit new care partner check-ins (RE',
        'Temporary program cannot insert into care_partner_checkins (REP'
      )
  ) THEN RAISE EXCEPTION 'Unexpected restrictive check-in ownership guard'; END IF;

  -- At least one recognized ownership guard must exist -- fail closed if
  -- both were somehow removed rather than silently permitting every INSERT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='care_partner_checkins'
      AND cmd='INSERT' AND permissive='RESTRICTIVE'
      AND policyname IN (
        'Caller must be the check-in''s own patient (FQA-019/SEC-008)',
        'Caller must be the check-in''s own patient, linked caregiver, or'
      )
  ) THEN RAISE EXCEPTION 'Missing check-in ownership guard'; END IF;
END
$guard$;

-- The free-tier restrictive predicate checks only the submitting actor's
-- OWN subscription (public.my_patient_has_paid_entitlement(), a self-
-- scoped SECURITY DEFINER wrapper around auth.uid() -- migration 152,
-- 2026-10-?? -- "P1-08 local entitlement oracle lockdown"), incorrectly
-- blocking enterprise staff who hold no personal subscription at all.
--
-- CONFIRMED LIVE, not assumed: the original PR #4 draft (and this file's
-- own first revision) assumed the PRE-152 predicate --
-- public.patient_has_paid_entitlement(patient_id) combined with a
-- caregiver_patients EXISTS check -- was still current. Running this
-- migration against the actual full local migration history (which
-- includes 152, applied well after the baseline/fresh catalog this
-- repository's committed snapshot was taken from) raised immediately:
-- the live with_check is exactly `my_patient_has_paid_entitlement()`, a
-- bare call with none of the assumed substrings, and migration 152 has
-- separately REVOKED `authenticated`'s EXECUTE on the raw, arbitrary-
-- argument patient_has_paid_entitlement(uuid) entirely (service_role
-- only now) -- the original draft's replacement predicate would have
-- called a function this role can no longer execute, failing every
-- check-in INSERT with "permission denied for function," not merely
-- the unauthorized ones. This is corrected here to simply OR the
-- existing self-scoped call with the new staff branch, exactly
-- preserving migration 152's own patient/residential-caregiver
-- self-scoping decision and adding only the enterprise-staff case.
--
-- Validate-before-mutate (fixes S02-R4 for this policy specifically) and
-- safe to replay: recognizes the already-migrated form as a no-op instead
-- of unconditionally re-issuing the same ALTER POLICY every run.
DO $freetier$
DECLARE
  c text; cn text; live_roles text;
  paid_norm constant text := 'my_patient_has_paid_entitlement()';
  wrap_norm constant text := '((spa.is_active=true)ANDhcn_current_staff_patient_access(spa.organization_id,spa.patient_id))';
  call_norm constant text := 'hcn_current_staff_patient_access(';
  n_paid integer; w_count integer; h_count integer;
BEGIN
  SELECT with_check, roles::text INTO c, live_roles FROM pg_policies
    WHERE schemaname='public' AND tablename='care_partner_checkins'
      AND policyname='Free-tier accounts cannot submit new care partner check-ins (RE'
      AND cmd='INSERT' AND permissive='RESTRICTIVE';
  IF c IS NULL THEN RAISE EXCEPTION 'Missing free-tier check-in guard'; END IF;
  -- Already role-scoped TO authenticated by migrations 106 and 152 (both
  -- predate this file) -- never '{public}'. Verified live, not assumed;
  -- fail closed if that ever stops holding rather than silently applying
  -- a WITH-CHECK-only ALTER that would leave anon able to attempt (and
  -- 42501 on) this policy's new function call.
  IF live_roles <> '{authenticated}' THEN
    RAISE EXCEPTION 'Unexpected role scope on free-tier check-in guard: %',live_roles;
  END IF;

  cn := pg_temp.hcn_norm(c);
  n_paid  := (length(cn)-length(replace(cn,paid_norm,'')))/length(paid_norm);
  w_count := (length(cn)-length(replace(cn,wrap_norm,'')))/length(wrap_norm);
  h_count := (length(cn)-length(replace(cn,call_norm,'')))/length(call_norm);

  IF h_count <> w_count THEN
    RAISE EXCEPTION 'Unexpected helper call or wrong arguments in free-tier check-in guard';
  END IF;

  IF n_paid = 1 AND w_count = 1 THEN
    NULL; -- already correctly migrated; idempotent no-op
  ELSIF n_paid = 1 AND w_count = 0 THEN
    ALTER POLICY "Free-tier accounts cannot submit new care partner check-ins (RE"
    ON public.care_partner_checkins
    WITH CHECK (
      public.my_patient_has_paid_entitlement()
      OR EXISTS (
        SELECT 1 FROM public.staff_patient_assignments spa
        WHERE spa.patient_id=care_partner_checkins.patient_id
          AND spa.user_id=auth.uid()
          AND ((spa.is_active = true) AND public.hcn_current_staff_patient_access(spa.organization_id,spa.patient_id))
      )
    );
  ELSE
    RAISE EXCEPTION 'Unsupported free-tier check-in guard shape: n_paid=% w_count=% h_count=%',n_paid,w_count,h_count;
  END IF;
END
$freetier$;

DROP FUNCTION pg_temp.hcn_norm(text);

-- The fourth historical REDUNDANT policy (the new check-in restrictive
-- extension) is retained as defense in depth until the consolidated
-- authenticated check-in acceptance proves its removal equivalent.
-- No clinical-access policy is removed here; five unsafe added policies
-- are tightened by the preceding migration, not dropped.
