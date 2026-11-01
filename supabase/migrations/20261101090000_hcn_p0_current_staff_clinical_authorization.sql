-- HCN-PROD-P0-01. NOT APPROVED FOR HOSTED EXECUTION.
-- Apply only to an isolated production-equivalent test stack after independent review.
-- Fix every current stale-assignment-only RLS branch, including storage.objects.
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

-- Fail-closed identity manifest from reviewed production and fresh-baseline catalog.
-- All 29 policies must exist; M2 may additionally add the free-tier check-in guard.
DO $migration$
DECLARE p record; q text; c text; raw_token constant text := '(spa.is_active = true)';
        guarded constant text := '((spa.is_active = true) AND public.hcn_current_staff_patient_access(spa.organization_id, spa.patient_id))';
        expected_count integer; actual_count integer; changed boolean;
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
 SELECT count(*) INTO actual_count FROM pg_policies p
 WHERE p.schemaname IN ('public','storage')
 AND (coalesce(p.qual,'')||coalesce(p.with_check,'')) ILIKE '%staff_patient_assignments%';
 IF actual_count NOT IN (29,30) THEN
   RAISE EXCEPTION 'Assignment policy inventory drift: %',actual_count;
 END IF;
 IF EXISTS (
  SELECT 1 FROM hcn_expected_assignment_policies e
  LEFT JOIN pg_policies p ON p.schemaname=e.schemaname
   AND p.tablename=e.tablename AND p.policyname=e.policyname
   AND p.cmd=e.cmd AND p.permissive=e.permissive AND p.roles::text=e.roles
  WHERE p.policyname IS NULL
 ) THEN RAISE EXCEPTION 'Missing or modified expected assignment policy'; END IF;
 IF EXISTS (
  SELECT 1 FROM pg_policies p LEFT JOIN hcn_expected_assignment_policies e
    ON p.schemaname=e.schemaname AND p.tablename=e.tablename
      AND p.policyname=e.policyname
  WHERE p.schemaname IN ('public','storage')
    AND (coalesce(p.qual,'')||coalesce(p.with_check,'')) ILIKE '%staff_patient_assignments%'
    AND e.policyname IS NULL
    AND NOT (p.schemaname='public' AND p.tablename='care_partner_checkins'
      AND p.policyname='Free-tier accounts cannot submit new care partner check-ins (RE'
      AND p.cmd='INSERT' AND p.permissive='RESTRICTIVE')
 ) THEN RAISE EXCEPTION 'Unknown assignment policy'; END IF;
 FOR p IN SELECT e.*,v.qual,v.with_check FROM hcn_expected_assignment_policies e
 JOIN pg_policies v ON v.schemaname=e.schemaname AND v.tablename=e.tablename
 AND v.policyname=e.policyname ORDER BY e.schemaname,e.tablename,e.policyname LOOP
   q:=p.qual; c:=p.with_check; changed:=false;
   -- Inspect USING and WITH CHECK separately: a partially repaired UPDATE
   -- cannot cause the other clause to be skipped.
   IF q IS NOT NULL THEN
     IF position('hcn_current_staff_patient_access' in q)>0 THEN
       IF position(guarded in q)=0 OR
          position('hcn_current_staff_patient_access' in replace(q,guarded,''))>0 OR
          position(raw_token in replace(q,guarded,''))>0
       THEN RAISE EXCEPTION 'Unexpected USING shape: %.% %',p.schemaname,p.tablename,p.policyname; END IF;
     ELSIF position(raw_token in q)>0 THEN
       q:=replace(q,raw_token,guarded); changed:=true;
     ELSE RAISE EXCEPTION 'Unrecognized USING shape: %.% %',p.schemaname,p.tablename,p.policyname;
     END IF;
   END IF;
   IF c IS NOT NULL THEN
     IF position('hcn_current_staff_patient_access' in c)>0 THEN
       IF position(guarded in c)=0 OR
          position('hcn_current_staff_patient_access' in replace(c,guarded,''))>0 OR
          position(raw_token in replace(c,guarded,''))>0
       THEN RAISE EXCEPTION 'Unexpected WITH CHECK shape: %.% %',p.schemaname,p.tablename,p.policyname; END IF;
     ELSIF position(raw_token in c)>0 THEN
       c:=replace(c,raw_token,guarded); changed:=true;
     ELSE RAISE EXCEPTION 'Unrecognized WITH CHECK shape: %.% %',p.schemaname,p.tablename,p.policyname;
     END IF;
   END IF;
   IF NOT changed THEN CONTINUE; END IF;
   EXECUTE format('ALTER POLICY %I ON %I.%I %s%s',p.policyname,p.schemaname,p.tablename,
      CASE WHEN q IS NOT NULL THEN format('USING (%s)',q) ELSE '' END,
      CASE WHEN c IS NOT NULL THEN format(' WITH CHECK (%s)',c) ELSE '' END);
 END LOOP;
END
$migration$;
-- Required before approval: authenticated JWT replay of C-REVOKED-CLINICAL-READ,
-- all direct API/Storage negatives, professional credential/consent review.
