-- HCN targeted compatibility patch:
-- New Haneen previsit gate only applies to patients enrolled through an
-- organization coverage record. Preserve pre-existing My Memoria caregiver
-- relationship rules for non-covered visits. Do not treat expired/closed
-- Haneen coverage as legacy authorization.
CREATE OR REPLACE FUNCTION public.start_caregiver_visit(
  p_visit_id uuid,p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL
) RETURNS public.caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_visit public.caregiver_visits;
  v_is_covered boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_visit FROM public.caregiver_visits
    WHERE id=p_visit_id AND caregiver_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit does not belong to this caregiver' USING ERRCODE='42501';
  END IF;
  IF v_visit.status NOT IN ('scheduled','missed') THEN
    RAISE EXCEPTION 'Visit cannot start from its current status' USING ERRCODE='22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.covered_patient_memberships c
    WHERE c.organization_id=v_visit.organization_id AND c.patient_id=v_visit.patient_id
  ) INTO v_is_covered;

  IF v_is_covered THEN
    -- Includes closed/expired enterprise coverage; they cannot fall back
    -- to a legacy caregiver_patients relationship.
    IF NOT public.hcn_is_previsit_current(p_visit_id) THEN
      RAISE EXCEPTION 'Current licensed assignment and pre-visit acknowledgment required'
        USING ERRCODE='22023';
    END IF;
  ELSE
    -- Preserve production legacy behavior ONLY for non-enterprise patients.
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_patient_assignments a
      WHERE a.patient_id=v_visit.patient_id AND a.user_id=auth.uid() AND a.is_active
    ) AND NOT EXISTS (
      SELECT 1 FROM public.caregiver_patients cp
      WHERE cp.patient_id=v_visit.patient_id AND cp.caregiver_id=auth.uid()
    ) THEN
      RAISE EXCEPTION 'Your authorization for this patient has ended'
        USING ERRCODE='42501';
    END IF;
  END IF;
  UPDATE public.caregiver_visits
    SET status='in_progress',actual_start=now(),
      evv_latitude=p_latitude,evv_longitude=p_longitude,updated_at=now()
    WHERE id=p_visit_id RETURNING * INTO v_visit;
  RETURN v_visit;
END;
$fn$;
