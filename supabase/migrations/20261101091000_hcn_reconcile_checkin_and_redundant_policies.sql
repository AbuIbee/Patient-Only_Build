-- HCN production-only policy reconciliation; code-only, not deployed.
-- Depends on 20261101090000_hcn_p0_current_staff_clinical_authorization.sql.
-- Preserve all five historically REQUIRED policies and both pending-Director policies.
-- Remove only two independently established equivalent policy duplicates.
DROP POLICY IF EXISTS "Patients can view their own memories" ON public.memories;
DROP POLICY IF EXISTS "Only organization directors can view their organization's licen" ON public.organization_licenses;

-- Check-in: old restrictive guard prevented legitimate enterprise staff INSERT.
-- Replace the old restrictive condition with the same current-authority decision
-- used by the staff INSERT policy; retain existing patient/residential caregiver paths.
DO $guard$
DECLARE p record; seen integer:=0;
        expected_names text[] := ARRAY[
          'Caller must be the check-in''s own patient (FQA-019/SEC-008)',
          'Caller must be the check-in''s own patient, linked caregiver, or'
        ];
        desired text := '(   patient_id = auth.uid()   OR EXISTS (     SELECT 1 FROM public.caregiver_patients cp     WHERE cp.patient_id=care_partner_checkins.patient_id       AND cp.caregiver_id=auth.uid()   )   OR EXISTS (     SELECT 1 FROM public.staff_patient_assignments spa     WHERE spa.patient_id=care_partner_checkins.patient_id       AND spa.user_id=auth.uid() AND spa.is_active=true       AND public.hcn_current_staff_patient_access(spa.organization_id,spa.patient_id)   ) )';
BEGIN
  -- Validate ALL existing ownership guards before changing any.
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public'
    AND tablename='care_partner_checkins' AND policyname=ANY(expected_names)
    ORDER BY policyname LOOP
    seen:=seen+1;
    IF p.cmd <> 'INSERT' OR p.permissive <> 'RESTRICTIVE'
       OR p.roles::text <> '{public}' OR p.with_check IS NULL
       OR position('patient_id = auth.uid()' in p.with_check)=0
       OR position('caregiver_patients' in p.with_check)=0
       OR position('caregiver_id = auth.uid()' in p.with_check)=0
       OR position('hcn_current_staff_patient_access' in p.with_check)>0
          AND position('staff_patient_assignments' in p.with_check)=0
    THEN RAISE EXCEPTION 'Unsupported ownership policy shape: %',p.policyname; END IF;
    IF position('staff_patient_assignments' in p.with_check)>0
       AND position('(spa.is_active = true)' in p.with_check)=0
       AND position('hcn_current_staff_patient_access' in p.with_check)=0
    THEN RAISE EXCEPTION 'Unexpected staff branch in %',p.policyname; END IF;
  END LOOP;
  IF seen=0 THEN RAISE EXCEPTION 'Missing check-in ownership guard'; END IF;
  -- No unexpected restrictive ownership guard may coexist.
  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='care_partner_checkins'
      AND cmd='INSERT' AND permissive='RESTRICTIVE'
      AND policyname<>ALL(expected_names)
      AND policyname NOT IN (
        'Free-tier accounts cannot submit new care partner check-ins (RE',
        'Temporary program cannot insert into care_partner_checkins (REP'
      )
  ) THEN RAISE EXCEPTION 'Unexpected restrictive check-in ownership guard'; END IF;
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public'
    AND tablename='care_partner_checkins' AND policyname=ANY(expected_names)
    ORDER BY policyname LOOP
    EXECUTE format('ALTER POLICY %I ON public.care_partner_checkins WITH CHECK %s',
       p.policyname,desired);
  END LOOP;
END
$guard$;
-- The original free-tier restrictive predicate checks the submitting actor's
-- personal subscription, incorrectly blocking organization-licensed staff.
-- Permit only a currently authorized covered patient/staff relationship.
-- Existing patient and residential caregiver paid-entitlement paths remain.
ALTER POLICY "Free-tier accounts cannot submit new care partner check-ins (RE"
ON public.care_partner_checkins
WITH CHECK (
  public.my_patient_has_paid_entitlement()
  OR (
    public.patient_has_paid_entitlement(care_partner_checkins.patient_id)
    AND EXISTS (
      SELECT 1 FROM public.caregiver_patients cp
      WHERE cp.patient_id=care_partner_checkins.patient_id
        AND cp.caregiver_id=auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.staff_patient_assignments spa
    WHERE spa.patient_id=care_partner_checkins.patient_id
      AND spa.user_id=auth.uid() AND spa.is_active=true
      AND public.hcn_current_staff_patient_access(spa.organization_id,spa.patient_id)
  )
);

-- The fourth historical REDUNDANT policy (the new check-in restrictive
-- extension) is retained as defense in depth until the consolidated
-- authenticated check-in acceptance proves its removal equivalent.
-- No clinical-access policy is removed here; five unsafe added policies
-- are tightened by the preceding migration, not dropped.
