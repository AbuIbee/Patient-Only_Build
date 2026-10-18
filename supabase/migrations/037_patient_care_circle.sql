-- 037_patient_care_circle.sql
-- ENTERPRISE CONSOLIDATED DELIVERY — Care Communications support helper.
--
-- "Explicit recipient selection" (migration 036) requires the UI to be
-- able to show WHO is actually authorized for a patient, so the caller can
-- deliberately choose among them. This read-only helper returns exactly
-- that list — reusing the same authorization sources as
-- is_authorized_for_patient() (caregiver_patients, staff_patient_
-- assignments, the patient themselves) — and nothing else. It never
-- returns anyone NOT independently authorized for the patient, and the
-- caller themselves must be authorized for the patient to call it at all.
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE OR REPLACE FUNCTION public.get_patient_care_circle(p_patient_id UUID)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  participant_role TEXT
) AS $$
BEGIN
  IF NOT public.is_authorized_for_patient(auth.uid(), p_patient_id) THEN
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
  WHERE spa.patient_id = p_patient_id AND spa.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_patient_care_circle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_care_circle(UUID) TO authenticated;
