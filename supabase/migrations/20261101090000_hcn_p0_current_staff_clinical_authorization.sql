-- HCN-PROD-P0-01. NOT APPROVED FOR HOSTED EXECUTION.
-- Apply only to an isolated production-equivalent test stack after independent review.
-- Fix every current stale-assignment-only RLS branch, including storage.objects.
--
-- Independent Codex review 004 (audit-output/HCN_P0_CORRECTIVE_RETEST_004,
-- referenced from audit-output/HCN_PR4_SAFE_CHECKPOINT_20261101 on
-- audit/hcn-pr4-reviewed-controls-20261101) found the first version of this
-- migration unsafe to apply:
--   S01-R1: substring-based guard recognition (position(...)>0) accepts
--     unexpected OR/AND branches and incorrect helper arguments -- it only
--     proves a token is PRESENT somewhere, never that the clause consists of
--     exactly what is expected and nothing else.
--   S02-R1: the fixed total-count gate (`actual_count NOT IN (29,30)`)
--     rejects the historical state, which has 31 staff_patient_assignments-
--     referencing policies once BOTH coexisting check-in restrictive
--     ownership guards are present (the fresh/reviewed baseline has only
--     one such guard; production history has two -- PR4-S01's own finding).
--   S02-R2: PostgreSQL's deparser may or may not retain the "public."
--     schema qualification on a function/table reference depending on
--     search_path at deparse time -- an exact literal string compare
--     against a hardcoded "public.hcn_current_staff_patient_access(...)"
--     is brittle to that difference.
--   S02-R3: presence-only checks on fragments ("patient_id = auth.uid()",
--     "caregiver_patients", etc.) cannot detect an unsafe extra branch
--     added alongside them, only their absence.
--   S02-R4: the single-pass loop interleaves per-row validation with
--     per-row mutation (EXECUTE inside the same iteration being validated)
--     rather than completing a full preflight across every row before any
--     ALTER POLICY is planned or issued.
--
-- This revision replaces substring/position() containment with EXACT
-- occurrence counting on a schema-qualification- and whitespace-normalized
-- copy of each clause (fixing S01-R1/S02-R2/S02-R3), replaces the fixed
-- total-count drift gate with a precise set-difference against an explicit
-- allow-list of named optional extras (fixing S02-R1 -- no magic number, so
-- 29/30/31 and any future explicitly-reviewed addition are all handled
-- uniformly), and splits validation from mutation into two real passes: Pass
-- 1 validates every manifest row and raises on the first unexpected shape
-- with ZERO prior mutation; Pass 2 applies ALTER POLICY only for rows Pass 1
-- planned, and only after Pass 1 fully completed (fixing S02-R4).
CREATE OR REPLACE FUNCTION public.hcn_current_staff_patient_access(p_org uuid,p_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.organization_memberships om
  JOIN public.organization_licenses ol ON ol.organization_id=om.organization_id
  JOIN public.covered_patient_memberships cpm
    ON cpm.organization_id=om.organization_id AND cpm.patient_id=p_patient
  WHERE om.organization_id=p_org
    AND om.user_id=auth.uid()
    AND om.status='active'
    AND om.org_role IN ('caregiver','therapist','medical_professional')
    AND EXISTS (
      SELECT 1 FROM public.staff_patient_assignments spa
      WHERE spa.organization_id=p_org AND spa.patient_id=p_patient
        AND spa.user_id=auth.uid() AND spa.is_active=true
        AND spa.org_role=om.org_role
    )
    AND ol.status='active'
    AND cpm.status='active'
    AND cpm.archived_at IS NULL
 );
$fn$;
REVOKE ALL ON FUNCTION public.hcn_current_staff_patient_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_current_staff_patient_access(uuid,uuid) TO authenticated;

-- Migration-local normalization utility: strips all whitespace and any
-- "public." qualification immediately preceding the two identifiers this
-- migration cares about, so every comparison below is invariant to
-- PostgreSQL's own deparsing choice (S02-R2). Dropped at the end of this
-- file -- it has no runtime purpose outside this migration.
CREATE OR REPLACE FUNCTION pg_temp.hcn_norm(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(coalesce(p,''), '\s+', '', 'g'),
           '(^|[^a-zA-Z0-9_])public\.(hcn_current_staff_patient_access|staff_patient_assignments)',
           '\1\2', 'g')
$$;

-- Fail-closed identity manifest from reviewed production and fresh-baseline catalog.
-- All 29 policies must exist; coexisting named check-in guards and the
-- free-tier guard are explicitly allowed extras, not a magic total count.
DO $migration$
DECLARE
  p record;
  q text; c text;
  qn text; cn text;
  raw_norm constant text := '(spa.is_active=true)';
  -- NOTE: PostgreSQL's deparser (ruleutils.c) always emits boolean
  -- operators in UPPERCASE ("AND"/"OR") regardless of how the original
  -- CREATE/ALTER POLICY statement was cased, while identifiers are emitted
  -- exactly as stored (lowercase, since all identifiers here are unquoted
  -- and therefore folded to lowercase at creation time). wrap_norm/call_norm
  -- are written to match that actual, stable deparse convention -- not an
  -- arbitrary casing choice.
  wrap_norm constant text := '((spa.is_active=true)ANDhcn_current_staff_patient_access(spa.organization_id,spa.patient_id))';
  call_norm constant text := 'hcn_current_staff_patient_access(';
  raw_token constant text := '(spa.is_active = true)';
  guarded constant text := '((spa.is_active = true) AND public.hcn_current_staff_patient_access(spa.organization_id, spa.patient_id))';
  t_count integer; w_count integer; h_count integer; bare_count integer;
  new_q text; new_c text; needs_plan boolean;
  is_public_role boolean; is_authenticated_role boolean;
  expected_count integer;
BEGIN
  CREATE TEMP TABLE hcn_expected_assignment_policies
  (schemaname text, tablename text, policyname text, cmd text, permissive text, roles text)
  ON COMMIT DROP;
  INSERT INTO hcn_expected_assignment_policies VALUES
    ('public','appointments','Assigned org staff can view appointments for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','care_partner_checkins','Assigned org staff can view A-G check-ins for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','care_partner_checkins','Assigned staff can submit check-ins for their patients','INSERT','PERMISSIVE','{public}'),
    ('public','care_partner_checkins','Caller must be the check-in''s own patient, linked caregiver, or','INSERT','RESTRICTIVE','{public}'),
    ('public','care_partner_notes','Assigned org staff can view A-G care partner notes for their pa','SELECT','PERMISSIVE','{public}'),
    ('public','care_partner_notes','Assigned staff can create Care Partner notes for their patients','INSERT','PERMISSIVE','{public}'),
    ('public','care_partner_notes','Assigned staff can update Care Partner notes for their patients','UPDATE','PERMISSIVE','{public}'),
    ('public','covered_patient_memberships','Assigned staff can see their patient''s coverage record','SELECT','PERMISSIVE','{public}'),
    ('public','help_activations','Assigned org staff can view HELP activation history for their p','SELECT','PERMISSIVE','{public}'),
    ('public','incident_attachments','Assigned staff can view attachments on incidents for their pati','SELECT','PERMISSIVE','{public}'),
    ('public','incident_reports','Assigned staff can view incident reports for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','medication_logs','Assigned org staff can view medication logs for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','medication_schedules','Assigned org staff can view medication schedules for their pati','SELECT','PERMISSIVE','{public}'),
    ('public','medications','Assigned org staff can view medications for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','mood_entries','Assigned org staff can record mood entries for their patients','INSERT','PERMISSIVE','{public}'),
    ('public','mood_entries','Assigned org staff can view mood entries for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','patient_document_uploads','Assigned org staff can upload documents for their patients','INSERT','PERMISSIVE','{public}'),
    ('public','patient_document_uploads','Assigned org staff can view document uploads for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','patient_intake','Authorized caregivers/staff can view their patient''s intake rec','SELECT','PERMISSIVE','{public}'),
    ('public','patient_notes','Assigned org staff can author ordinary notes for their patients','INSERT','PERMISSIVE','{public}'),
    ('public','patient_notes','Assigned org staff can view ordinary notes for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','patients','Assigned org staff can view their assigned patients','SELECT','PERMISSIVE','{public}'),
    ('public','shift_handoff_acknowledgments','A caregiver can view acknowledgments on handoffs they can see','SELECT','PERMISSIVE','{public}'),
    ('public','shift_handoffs','Assigned staff can view shift handoffs for their patients','SELECT','PERMISSIVE','{public}'),
    ('public','tasks','Assigned org staff can update tasks for their patients','UPDATE','PERMISSIVE','{public}'),
    ('public','tasks','Assigned org staff can view tasks for their patients','SELECT','PERMISSIVE','{public}'),
    ('storage','objects','Anyone who can see the incident can read its attachment objects','SELECT','PERMISSIVE','{public}'),
    ('storage','objects','Assigned org staff can read their patients'' document storage ob','SELECT','PERMISSIVE','{public}'),
    ('storage','objects','Assigned org staff can upload their patients'' document storage ','INSERT','PERMISSIVE','{public}');
  SELECT count(*) INTO expected_count FROM hcn_expected_assignment_policies;
  IF expected_count <> 29 THEN RAISE EXCEPTION 'Invalid reviewed policy manifest'; END IF;

  -- Identity check: every manifest row must exist with exact identity/command/mode/role.
  -- NOTE: the live-catalog alias is "lp", never "p" -- "p" is this DO
  -- block's own loop variable (declared below as `record`, unassigned
  -- until the FOR loop runs). PL/pgSQL resolves a dot-qualified
  -- reference like "p.schemaname" against ITS OWN variable named "p"
  -- before falling back to a same-named SQL alias in the embedded
  -- query, so reusing "p" as an alias here would raise "record \"p\" is
  -- not assigned yet" -- confirmed live: the original migration (as
  -- committed to PR #4) does exactly that and has never actually run
  -- successfully against a real PostgreSQL instance; Codex's review 004
  -- was static-only and did not catch it.
  -- roles is the PRE-migration baseline ('{public}', i.e. no TO clause --
  -- every one of these 29 policies predates this migration and has never
  -- been role-scoped). '{authenticated}' is also accepted here: once Pass
  -- 2 below rescopes an upgraded row (see the TO-authenticated note ahead
  -- of Pass 1), a replay must recognize that as the correct post-migration
  -- state, not reject it as "modified".
  IF EXISTS (
    SELECT 1 FROM hcn_expected_assignment_policies e
    LEFT JOIN pg_policies lp ON lp.schemaname=e.schemaname
     AND lp.tablename=e.tablename AND lp.policyname=e.policyname
     AND lp.cmd=e.cmd AND lp.permissive=e.permissive AND lp.roles::text IN (e.roles,'{authenticated}')
    WHERE lp.policyname IS NULL
  ) THEN RAISE EXCEPTION 'Missing or modified expected assignment policy'; END IF;

  -- Drift check (replaces S02-R1's fixed total-count gate): every OTHER
  -- staff_patient_assignments-referencing policy anywhere in public/storage
  -- must be one of the explicitly named, reviewed optional extras -- never
  -- a bare count. This is correct for the fresh baseline (29), the fresh
  -- baseline after this migration's own M2 companion runs (30), AND the
  -- historical production catalog with both coexisting check-in guards (31)
  -- -- with no magic number anywhere.
  IF EXISTS (
    SELECT 1 FROM pg_policies lp LEFT JOIN hcn_expected_assignment_policies e
      ON lp.schemaname=e.schemaname AND lp.tablename=e.tablename AND lp.policyname=e.policyname
    WHERE lp.schemaname IN ('public','storage')
      AND (coalesce(lp.qual,'')||coalesce(lp.with_check,'')) ILIKE '%staff_patient_assignments%'
      AND e.policyname IS NULL
      AND NOT (lp.schemaname='public' AND lp.tablename='care_partner_checkins'
        AND lp.cmd='INSERT' AND lp.permissive='RESTRICTIVE'
        AND lp.policyname IN (
          'Free-tier accounts cannot submit new care partner check-ins (RE',
          'Caller must be the check-in''s own patient (FQA-019/SEC-008)'
        ))
  ) THEN RAISE EXCEPTION 'Unknown assignment-referencing policy present'; END IF;

  -- CONFIRMED LIVE, a second defect this run found beyond Codex review
  -- 004's own list: every one of these 29 policies carries no `TO` clause
  -- (applies to EVERY role, anon included). Their ORIGINAL raw_token,
  -- `(spa.is_active = true)`, is a plain column comparison -- harmless for
  -- anon, no privilege check involved. The GUARDED form calls
  -- hcn_current_staff_patient_access(), which is correctly REVOKEd from
  -- anon (never re-granted -- that would reopen exactly the oracle risk
  -- migration 106's own rejected-then-fixed draft warned about). Applying
  -- the guarded form to a still-public-scoped policy turns "RLS correctly
  -- returns an empty result for anon" into a hard `42501 permission denied
  -- for function hcn_current_staff_patient_access` on every anonymous read
  -- of any of these 29 tables -- confirmed live against a real anon REST
  -- call, not assumed. Migration 106 already established and proved the
  -- fix for this exact class of defect for a disjoint set of 56 policies:
  -- `ALTER POLICY ... TO authenticated` retargets a policy's role scope
  -- (never its USING/WITH CHECK logic) so anon never attempts to evaluate
  -- the predicate at all -- reproducing the identical, correct empty
  -- result without ever invoking the gated function as anon and without
  -- granting anon anything. Every row upgraded below is rescoped `TO
  -- authenticated` in the SAME ALTER POLICY statement as its content
  -- upgrade.
  --
  -- PASS 1 -- validate every manifest row's USING/WITH CHECK shape and
  -- current role scope, and plan the required action. Zero mutation
  -- happens in this pass; any unexpected shape raises immediately, before
  -- a single ALTER POLICY has been planned (fixes S02-R4).
  CREATE TEMP TABLE hcn_assignment_plan
    (schemaname text, tablename text, policyname text, new_qual text, new_check text, needs_role_fix boolean)
  ON COMMIT DROP;

  FOR p IN SELECT e.*,v.qual,v.with_check,v.roles AS live_roles FROM hcn_expected_assignment_policies e
  JOIN pg_policies v ON v.schemaname=e.schemaname AND v.tablename=e.tablename
  AND v.policyname=e.policyname ORDER BY e.schemaname,e.tablename,e.policyname LOOP
    q:=p.qual; c:=p.with_check; new_q:=NULL; new_c:=NULL; needs_plan:=false;
    is_public_role := (p.live_roles::text = '{public}');
    is_authenticated_role := (p.live_roles::text = '{authenticated}');
    IF NOT is_public_role AND NOT is_authenticated_role THEN
      RAISE EXCEPTION 'Unexpected role scope on %.% %: %',p.schemaname,p.tablename,p.policyname,p.live_roles;
    END IF;

    IF q IS NOT NULL THEN
      qn := pg_temp.hcn_norm(q);
      t_count := (length(qn) - length(replace(qn, raw_norm, ''))) / length(raw_norm);
      w_count := (length(qn) - length(replace(qn, wrap_norm, ''))) / length(wrap_norm);
      h_count := (length(qn) - length(replace(qn, call_norm, ''))) / length(call_norm);
      bare_count := t_count - w_count;
      IF h_count <> w_count THEN
        RAISE EXCEPTION 'Unexpected helper call or wrong arguments in USING: %.% %',p.schemaname,p.tablename,p.policyname;
      ELSIF w_count=1 AND bare_count=0 AND is_authenticated_role THEN
        NULL; -- already correctly migrated (content + role scope); idempotent no-op
      ELSIF w_count=0 AND bare_count=1 AND is_public_role THEN
        new_q := replace(q, raw_token, guarded); needs_plan := true;
      ELSE
        RAISE EXCEPTION 'Unexpected USING shape or role-scope/content mismatch: %.% %',p.schemaname,p.tablename,p.policyname;
      END IF;
    END IF;

    IF c IS NOT NULL THEN
      cn := pg_temp.hcn_norm(c);
      t_count := (length(cn) - length(replace(cn, raw_norm, ''))) / length(raw_norm);
      w_count := (length(cn) - length(replace(cn, wrap_norm, ''))) / length(wrap_norm);
      h_count := (length(cn) - length(replace(cn, call_norm, ''))) / length(call_norm);
      bare_count := t_count - w_count;
      IF h_count <> w_count THEN
        RAISE EXCEPTION 'Unexpected helper call or wrong arguments in WITH CHECK: %.% %',p.schemaname,p.tablename,p.policyname;
      ELSIF w_count=1 AND bare_count=0 AND is_authenticated_role THEN
        NULL;
      ELSIF w_count=0 AND bare_count=1 AND is_public_role THEN
        new_c := replace(c, raw_token, guarded); needs_plan := true;
      ELSE
        RAISE EXCEPTION 'Unexpected WITH CHECK shape or role-scope/content mismatch: %.% %',p.schemaname,p.tablename,p.policyname;
      END IF;
    END IF;

    IF needs_plan THEN
      INSERT INTO hcn_assignment_plan VALUES (p.schemaname,p.tablename,p.policyname,new_q,new_c,is_public_role);
    END IF;
  END LOOP;

  -- PASS 2 -- apply. Only reached once every one of the 29 manifest rows
  -- has independently passed Pass 1 with no exception. Every planned row
  -- is rescoped TO authenticated in the same statement as its content
  -- change (needs_role_fix is always true for a planned row here, since
  -- Pass 1 only plans a row when it found the pre-migration public-role,
  -- raw-content state).
  FOR p IN SELECT * FROM hcn_assignment_plan LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I%s%s%s',p.policyname,p.schemaname,p.tablename,
       CASE WHEN p.needs_role_fix THEN ' TO authenticated' ELSE '' END,
       CASE WHEN p.new_qual IS NOT NULL THEN format(' USING (%s)',p.new_qual) ELSE '' END,
       CASE WHEN p.new_check IS NOT NULL THEN format(' WITH CHECK (%s)',p.new_check) ELSE '' END);
  END LOOP;
END
$migration$;

DROP FUNCTION pg_temp.hcn_norm(text);
-- Required before approval: authenticated JWT replay of C-REVOKED-CLINICAL-READ,
-- all direct API/Storage negatives, professional credential/consent review.
