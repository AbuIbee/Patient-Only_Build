CREATE OR REPLACE FUNCTION public.get_patient_care_circle(p_patient_id UUID)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  participant_role TEXT
) AS $$
BEGIN
  IF NOT (public.is_authorized_for_patient(auth.uid(), p_patient_id) OR public.is_org_director_for_patient(auth.uid(), p_patient_id)) THEN
    RAISE EXCEPTION 'You are not authorized for this patient';
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, 'patient'::text
  FROM patients p WHERE p.id = p_patient_id
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'caregiver'::text
  FROM caregiver_patients cp
  JOIN profiles pr ON pr.id = cp.caregiver_id
  WHERE cp.patient_id = p_patient_id
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, spa.org_role
  FROM staff_patient_assignments spa
  JOIN profiles pr ON pr.id = spa.user_id
  WHERE spa.patient_id = p_patient_id AND spa.is_active = true
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'therapist'::text
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id AND tr.is_active = true
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'director'::text
  FROM organization_memberships om
  JOIN covered_patient_memberships cpm ON cpm.organization_id = om.organization_id
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.org_role = 'director' AND om.status = 'active'
    AND cpm.patient_id = p_patient_id AND cpm.status = 'active'
  UNION
  SELECT pr.representative_user_id, pr.legal_first_name, pr.legal_last_name, 'patient'::text
  FROM public.patient_representatives pr
  WHERE pr.patient_id=p_patient_id AND pr.status='active' AND pr.verification_status='verified'
    AND public.is_authorized_for_patient(pr.representative_user_id,p_patient_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
