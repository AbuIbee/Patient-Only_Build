-- 040_therapist_relationships_in_communications.sql
-- FINAL INTEGRATION CORRECTIONS item 2 — integrate the existing,
-- pre-Enterprise therapist_relationships table into Care Communications
-- recipient-selection/authorization, so a RESIDENTIAL (non-organization)
-- therapist relationship is also a valid basis for conversation
-- participation — previously only caregiver_patients and
-- staff_patient_assignments (Enterprise org staff) were recognized, so a
-- plain residential therapist had no path into Communications at all.
--
-- This does not change therapist_relationships itself or any of its own
-- RLS — it is only ADDED as a third authorization source, read-only, at
-- the exact two points that already centralize "who may be included in a
-- conversation about this patient": is_authorized_for_patient() and
-- get_patient_care_circle(). This is the same reuse principle already
-- applied to caregiver_patients/staff_patient_assignments: consulted only
-- to verify an existing relationship, never written to, never a basis for
-- automatically exposing a conversation.
--
-- STAGING-TARGETED. Not yet applied to production.
CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id UUID, p_patient_id UUID)
RETURNS boolean AS $$
  SELECT
    p_user_id = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = p_user_id AND patient_id = p_patient_id)
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = p_patient_id AND is_active = true)
    OR EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = p_user_id AND patient_id = p_patient_id AND is_active = true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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
  WHERE spa.patient_id = p_patient_id AND spa.is_active = true
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'therapist'::text
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id AND tr.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
