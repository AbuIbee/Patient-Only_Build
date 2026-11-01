-- HCN production-only policy reconciliation; code-only, not deployed.
-- Depends on 20261101090000_hcn_p0_current_staff_clinical_authorization.sql.
-- Preserve all five historically REQUIRED policies and both pending-Director policies.
-- Remove only the three independently established equivalent policy duplicates.
DROP POLICY IF EXISTS "Patients can view their own memories" ON public.memories;
DROP POLICY IF EXISTS "Only organization directors can view their organization's licen" ON public.organization_licenses;

-- Check-in: old restrictive guard prevented legitimate enterprise staff INSERT.
-- Replace the old restrictive condition with the same current-authority decision
-- used by the staff INSERT policy; retain existing patient/residential caregiver paths.
ALTER POLICY "Caller must be the check-in's own patient (FQA-019/SEC-008)"
ON public.care_partner_checkins
WITH CHECK (
  patient_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.caregiver_patients cp
    WHERE cp.patient_id=care_partner_checkins.patient_id
      AND cp.caregiver_id=auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.staff_patient_assignments spa
    WHERE spa.patient_id=care_partner_checkins.patient_id
      AND spa.user_id=auth.uid() AND spa.is_active=true
      AND public.hcn_current_staff_patient_access(spa.organization_id,spa.patient_id)
  )
);

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
