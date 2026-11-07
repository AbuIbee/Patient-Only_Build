-- HCN DIRECTOR SCHEDULING: explicit caregiver, overlap-safe, org-scoped.
-- Existing visits, pre-visit acknowledgements, and visit start/end RPCs remain unchanged.
CREATE OR REPLACE FUNCTION public.hcn_director_schedule_assigned_visit(
  p_org_id uuid, p_patient_id uuid, p_caregiver_id uuid,
  p_scheduled_start timestamptz, p_scheduled_end timestamptz
) RETURNS public.caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $hcn$
DECLARE v_row public.caregiver_visits;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active organization director may schedule visits' USING ERRCODE='42501';
  END IF;
  IF p_patient_id IS NULL OR p_caregiver_id IS NULL OR p_scheduled_start IS NULL
     OR p_scheduled_end IS NULL OR p_scheduled_end <= p_scheduled_start
     OR p_scheduled_end > p_scheduled_start + interval '24 hours' THEN
    RAISE EXCEPTION 'A valid patient, caregiver and visit window (max 24 hours) are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_licenses l
      WHERE l.organization_id=p_org_id AND l.status='active') THEN
    RAISE EXCEPTION 'Organization license is not active' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.covered_patient_memberships cp
      WHERE cp.organization_id=p_org_id AND cp.patient_id=p_patient_id AND cp.status='active') THEN
    RAISE EXCEPTION 'Patient is not actively covered in this organization' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_patient_assignments spa
      JOIN public.organization_memberships m ON m.organization_id=spa.organization_id
         AND m.user_id=spa.user_id AND m.status='active' AND m.org_role='caregiver'
      WHERE spa.organization_id=p_org_id AND spa.patient_id=p_patient_id
        AND spa.user_id=p_caregiver_id AND spa.org_role='caregiver' AND spa.is_active) THEN
    RAISE EXCEPTION 'Selected caregiver is not actively assigned to this patient' USING ERRCODE='42501';
  END IF;
  -- Serialize overlapping bookings of the same caregiver even across director sessions.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_caregiver_id::text,0));
  IF EXISTS (SELECT 1 FROM public.caregiver_visits v
      WHERE v.organization_id=p_org_id AND v.caregiver_id=p_caregiver_id
        AND v.status IN ('scheduled','in_progress')
        AND v.scheduled_start < p_scheduled_end
        AND v.scheduled_end > p_scheduled_start) THEN
    RAISE EXCEPTION 'Caregiver has a conflicting scheduled or active visit';
  END IF;
  INSERT INTO public.caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end)
  VALUES(p_org_id,p_patient_id,p_caregiver_id,p_scheduled_start,p_scheduled_end)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$hcn$;
REVOKE ALL ON FUNCTION public.hcn_director_schedule_assigned_visit(uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_schedule_assigned_visit(uuid,uuid,uuid,timestamptz,timestamptz) TO authenticated;
