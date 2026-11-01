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

DO $migration$
DECLARE p record; new_qual text; new_check text; n integer:=0; replacement text;
BEGIN
 replacement := '((spa.is_active = true) AND public.hcn_current_staff_patient_access(spa.organization_id, spa.patient_id))';
 FOR p IN
  SELECT schemaname,tablename,policyname,cmd,qual,with_check
  FROM pg_policies
  WHERE schemaname IN ('public','storage')
    AND (coalesce(qual,'')||coalesce(with_check,'')) ILIKE '%staff_patient_assignments%'
 LOOP
  IF (coalesce(p.qual,'')||coalesce(p.with_check,'')) NOT ILIKE '%spa.is_active = true%' THEN
   RAISE EXCEPTION 'Unrecognized assignment policy: %.% %',p.schemaname,p.tablename,p.policyname;
  END IF;
  new_qual := replace(p.qual,'(spa.is_active = true)',replacement);
  new_check := replace(p.with_check,'(spa.is_active = true)',replacement);
  IF new_qual IS NOT DISTINCT FROM p.qual AND new_check IS NOT DISTINCT FROM p.with_check THEN
   RAISE EXCEPTION 'No replacement performed: %.% %',p.schemaname,p.tablename,p.policyname;
  END IF;
  EXECUTE format('ALTER POLICY %I ON %I.%I %s%s',
    p.policyname,p.schemaname,p.tablename,
    CASE WHEN new_qual IS NOT NULL THEN format('USING (%s)',new_qual) ELSE '' END,
    CASE WHEN new_check IS NOT NULL THEN format(' WITH CHECK (%s)',new_check) ELSE '' END
  );
  n:=n+1;
 END LOOP;
 IF n<>29 THEN RAISE EXCEPTION 'Policy inventory changed: expected 29, got %',n; END IF;
END
$migration$;
-- Required before approval: authenticated JWT replay of C-REVOKED-CLINICAL-READ,
-- all direct API/Storage negatives, professional credential/consent review.
