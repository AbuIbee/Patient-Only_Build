-- HCN-E2E-REMEDIATION-001. No data import, role promotion or RLS disabling.
-- Invoker joins cannot see license rows (deliberately Director-only), and
-- assignment self-read would recurse. These private, self-scoped booleans
-- inspect current database facts without returning any clinical/financial row.
CREATE SCHEMA IF NOT EXISTS hcn_private;
REVOKE ALL ON SCHEMA hcn_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA hcn_private TO authenticated;

CREATE TABLE IF NOT EXISTS hcn_private.policy_before_clinical_v1 (
  table_name text NOT NULL, policy_name text NOT NULL,
  using_expression text, check_expression text, original_roles name[],
  PRIMARY KEY(table_name,policy_name)
);
ALTER TABLE hcn_private.policy_before_clinical_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcn_private.policy_before_clinical_v1 ADD COLUMN IF NOT EXISTS original_roles name[];
REVOKE ALL ON hcn_private.policy_before_clinical_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION hcn_private.current_identity_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())
  );
$$;
CREATE OR REPLACE FUNCTION hcn_private.current_staff_patient_v1(
  p_org uuid,p_patient uuid,p_role text DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT hcn_private.current_identity_v1() AND EXISTS (
    SELECT 1 FROM public.staff_patient_assignments a
    JOIN public.organization_memberships m ON m.organization_id=a.organization_id
      AND m.user_id=a.user_id AND m.org_role=a.org_role AND m.status='active'
    JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id
      AND c.patient_id=a.patient_id AND c.status='active'
    JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active'
      AND l.license_number IS NOT NULL
    WHERE a.organization_id=p_org AND a.patient_id=p_patient AND a.user_id=auth.uid()
      AND a.is_active AND (p_role IS NULL OR a.org_role=p_role)
      AND a.org_role IN ('caregiver','medical_professional','therapist','clinical_supervisor')
      AND CASE a.org_role
        WHEN 'medical_professional' THEN public.is_medical_professional_for_patient(p_patient)
        WHEN 'therapist' THEN public.is_therapist_for_patient(p_patient)
        ELSE true END
  );
$$;
CREATE OR REPLACE FUNCTION hcn_private.current_director_patient_v1(p_org uuid,p_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT hcn_private.current_identity_v1() AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    JOIN public.organization_licenses l ON l.organization_id=m.organization_id AND l.status='active'
      AND l.license_number IS NOT NULL
    JOIN public.covered_patient_memberships c ON c.organization_id=m.organization_id
      AND c.patient_id=p_patient AND c.status='active'
    WHERE m.organization_id=p_org AND m.user_id=auth.uid() AND m.org_role='director' AND m.status='active'
  );
$$;
REVOKE ALL ON FUNCTION hcn_private.current_identity_v1(),
  hcn_private.current_staff_patient_v1(uuid,uuid,text),
  hcn_private.current_director_patient_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION hcn_private.current_identity_v1(),
  hcn_private.current_staff_patient_v1(uuid,uuid,text),
  hcn_private.current_director_patient_v1(uuid,uuid) TO authenticated;

-- Preserve all parallel patient/residential predicates. Guard EACH assignment
-- subquery inside its existing branch, not the entire OR expression. Fail
-- closed if a dependent predicate is unfamiliar instead of silently missing it.
DO $migration$
DECLARE r record; expr text; checked text; alias_name text; aliases text[];
BEGIN
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public'
      AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%staff_patient_assignments%'
      AND tablename NOT IN ('hcn_previsit_acknowledgments','hcn_care_escalations')
  LOOP
    INSERT INTO hcn_private.policy_before_clinical_v1(table_name,policy_name,using_expression,check_expression,original_roles) VALUES
      (r.tablename,r.policyname,r.qual,r.with_check,r.roles) ON CONFLICT DO NOTHING;
    expr:=r.qual; checked:=r.with_check;
    SELECT array_agg(DISTINCT m[1]) INTO aliases FROM regexp_matches(
      coalesce(expr,'')||coalesce(checked,''),'staff_patient_assignments ([a-z_][a-z_0-9]*)','g') m;
    IF aliases IS NULL THEN RAISE EXCEPTION 'Unknown assignment predicate: %.%',r.tablename,r.policyname; END IF;
    FOREACH alias_name IN ARRAY aliases LOOP
      IF (coalesce(expr,'')||coalesce(checked,'')) !~ ('\m'||alias_name||'\.is_active\M') THEN
        RAISE EXCEPTION 'Missing active assignment predicate: %.%',r.tablename,r.policyname;
      END IF;
      expr:=regexp_replace(expr,'\m'||alias_name||'\.is_active\M(?! AND hcn_private\.current_staff_patient_v1)',
        '('||alias_name||'.is_active AND hcn_private.current_staff_patient_v1('||alias_name||'.organization_id,'||alias_name||'.patient_id,'||alias_name||'.org_role))','g');
      checked:=regexp_replace(checked,'\m'||alias_name||'\.is_active\M(?! AND hcn_private\.current_staff_patient_v1)',
        '('||alias_name||'.is_active AND hcn_private.current_staff_patient_v1('||alias_name||'.organization_id,'||alias_name||'.patient_id,'||alias_name||'.org_role))','g');
    END LOOP;
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s%s',r.policyname,r.tablename,
      CASE WHEN 'public'=ANY(r.roles) THEN ' TO authenticated' ELSE '' END,
      CASE WHEN expr IS NOT NULL THEN format(' USING (%s)',expr) ELSE '' END,
      CASE WHEN checked IS NOT NULL THEN format(' WITH CHECK (%s)',checked) ELSE '' END);
  END LOOP;
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public' AND
    (tablename='staff_patient_assignments' AND policyname IN
      ('Staff can view their own active patient assignments','Staff can set their own display label for an assignment')
     OR tablename IN ('hcn_previsit_acknowledgments','hcn_care_escalations'))
  LOOP
    INSERT INTO hcn_private.policy_before_clinical_v1(table_name,policy_name,using_expression,check_expression,original_roles) VALUES
      (r.tablename,r.policyname,r.qual,r.with_check,r.roles) ON CONFLICT DO NOTHING;
  END LOOP;
END;
$migration$;

ALTER POLICY "Staff can view their own active patient assignments" ON public.staff_patient_assignments
TO authenticated
USING (user_id=auth.uid() AND is_active AND hcn_private.current_staff_patient_v1(organization_id,patient_id,org_role));
ALTER POLICY "Staff can set their own display label for an assignment" ON public.staff_patient_assignments
TO authenticated
USING (user_id=auth.uid() AND hcn_private.current_staff_patient_v1(organization_id,patient_id,org_role))
WITH CHECK (user_id=auth.uid() AND hcn_private.current_staff_patient_v1(organization_id,patient_id,org_role));
ALTER POLICY "HCN scoped previsit reads" ON public.hcn_previsit_acknowledgments
USING (hcn_private.current_director_patient_v1(organization_id,patient_id)
  OR (caregiver_id=auth.uid() AND hcn_private.current_staff_patient_v1(organization_id,patient_id,'caregiver')));
ALTER POLICY "HCN scoped care escalation read" ON public.hcn_care_escalations
USING (hcn_private.current_director_patient_v1(organization_id,patient_id)
  OR hcn_private.current_staff_patient_v1(organization_id,patient_id,NULL));
ALTER POLICY "Assigned staff can see their patient's coverage record" ON public.covered_patient_memberships
TO authenticated
USING (status='active' AND hcn_private.current_staff_patient_v1(organization_id,patient_id,NULL));

-- Existing privileged authoring RPCs also need matching assignment roles.
-- Preserve signatures, existing validation, audit behavior and execution grants.
CREATE TABLE IF NOT EXISTS hcn_private.function_before_clinical_v1 (
  signature text PRIMARY KEY, definition text NOT NULL
);
ALTER TABLE hcn_private.function_before_clinical_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hcn_private.function_before_clinical_v1 FROM PUBLIC,anon,authenticated;
DO $rpc_guards$
DECLARE r record; prior text; guard text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.hcn_acknowledge_previsit(uuid,text[],text)',
     'IF NOT EXISTS (SELECT 1 FROM public.caregiver_visits v WHERE v.id=p_visit_id AND v.caregiver_id=auth.uid() AND hcn_private.current_staff_patient_v1(v.organization_id,v.patient_id,''caregiver'')) THEN RAISE EXCEPTION ''Current scheduled caregiver authorization required'' USING ERRCODE=''42501''; END IF;'),
    ('public.hcn_submit_care_escalation(uuid,uuid,text,text)',
     'IF NOT hcn_private.current_staff_patient_v1(p_org_id,p_patient_id,''caregiver'') THEN RAISE EXCEPTION ''Current assigned caregiver authorization required'' USING ERRCODE=''42501''; END IF;')
  ) AS guards(signature,guard_sql)
  LOOP
    prior:=pg_get_functiondef(r.signature::regprocedure);
    INSERT INTO hcn_private.function_before_clinical_v1 VALUES(r.signature,prior) ON CONFLICT DO NOTHING;
    IF prior LIKE '%hcn_private.current_staff_patient_v1%' THEN CONTINUE; END IF;
    IF prior NOT LIKE '%LANGUAGE plpgsql%' OR prior !~ '\mBEGIN\M' THEN
      RAISE EXCEPTION 'Unexpected authoring RPC definition: %',r.signature;
    END IF;
    guard:='BEGIN'||chr(10)||'  '||r.guard_sql;
    EXECUTE regexp_replace(prior,'\mBEGIN\M',guard);
  END LOOP;
END;
$rpc_guards$;
