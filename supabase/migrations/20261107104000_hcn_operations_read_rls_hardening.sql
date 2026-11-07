-- HCN P0: enforce CURRENT licensed patient coverage and assignment for
-- operational record reads. Never rely on an earlier successful session.
DROP POLICY IF EXISTS "HCN scoped previsit reads" ON public.hcn_previsit_acknowledgments;
CREATE POLICY "HCN scoped previsit reads" ON public.hcn_previsit_acknowledgments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_licenses l
    JOIN public.covered_patient_memberships c
      ON c.organization_id=l.organization_id AND c.patient_id=hcn_previsit_acknowledgments.patient_id
       AND c.status='active'
    WHERE l.organization_id=hcn_previsit_acknowledgments.organization_id AND l.status='active'
  )
  AND (
    public.is_active_org_director(organization_id)
    OR (
      caregiver_id=(SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.staff_patient_assignments a
        JOIN public.organization_memberships m
          ON m.organization_id=a.organization_id AND m.user_id=a.user_id
        WHERE a.organization_id=hcn_previsit_acknowledgments.organization_id
          AND a.patient_id=hcn_previsit_acknowledgments.patient_id
          AND a.user_id=hcn_previsit_acknowledgments.caregiver_id
          AND a.org_role='caregiver' AND a.is_active
          AND m.status='active' AND m.org_role='caregiver'
      )
    )
  )
);

DROP POLICY IF EXISTS "HCN scoped care escalation read" ON public.hcn_care_escalations;
CREATE POLICY "HCN scoped care escalation read" ON public.hcn_care_escalations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_licenses l
    JOIN public.covered_patient_memberships c
      ON c.organization_id=l.organization_id AND c.patient_id=hcn_care_escalations.patient_id
      AND c.status='active'
    WHERE l.organization_id=hcn_care_escalations.organization_id AND l.status='active'
  )
  AND (
    public.is_active_org_director(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_patient_assignments a
      JOIN public.organization_memberships m
        ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active'
      WHERE a.organization_id=hcn_care_escalations.organization_id
        AND a.patient_id=hcn_care_escalations.patient_id
        AND a.user_id=(SELECT auth.uid()) AND a.is_active
        AND m.org_role IN ('caregiver','medical_professional','therapist','clinical_supervisor')
    )
  )
);
