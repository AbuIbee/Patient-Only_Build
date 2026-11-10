-- Prevent a Caregiver from seeing a pending instruction's free-text
-- contents or metadata before the Director releases it.  Only a
-- clinically-approved source document of this SAME patient/org can
-- support released caregiver instructions.
CREATE OR REPLACE FUNCTION public.hcn_can_view_coordination_task(p_task uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v_task public.hcn_coordination_tasks;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_task FROM public.hcn_coordination_tasks WHERE id=p_task;
  IF v_task.id IS NULL OR NOT public.hcn_is_active_covered_patient(v_task.organization_id,v_task.patient_id)
    THEN RETURN false; END IF;
  IF public.is_active_org_director(v_task.organization_id) OR public.is_organization_owner(v_task.organization_id)
    THEN RETURN true; END IF;
  IF v_task.kind='care_instruction' THEN
    IF v_task.status<>'approved' OR v_task.reviewed_by IS NULL OR
       NOT EXISTS (
         SELECT 1 FROM public.hcn_clinical_documents d
         WHERE d.id=v_task.source_document_id AND d.organization_id=v_task.organization_id
           AND d.patient_id=v_task.patient_id AND d.classification='caregiver_approved_instructions'
           AND d.review_status='clinical_approved' AND NOT d.is_archived
       ) THEN RETURN false; END IF;
  END IF;
  RETURN v_task.assigned_user_id=auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.hcn_coordination_plan_participants pp
      JOIN public.organization_memberships m ON m.organization_id=pp.organization_id AND m.user_id=pp.participant_user_id
      JOIN public.staff_patient_assignments a ON a.organization_id=pp.organization_id AND a.user_id=pp.participant_user_id
        AND a.org_role=m.org_role
      WHERE pp.plan_id=v_task.plan_id AND pp.participant_user_id=auth.uid()
        AND pp.removed_at IS NULL AND m.status='active'
        AND a.patient_id=v_task.patient_id AND a.is_active=true
    );
END; $$;
REVOKE ALL ON FUNCTION public.hcn_can_view_coordination_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_can_view_coordination_task(uuid) TO authenticated;
