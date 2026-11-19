-- Enforce Haneen attendance timing on the locked visit row.
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
    IF v_visit.scheduled_start IS NULL OR NOT pg_catalog.isfinite(v_visit.scheduled_start) THEN
      RAISE EXCEPTION 'A scheduled start is required to check in' USING ERRCODE='22023';
    END IF;
    IF now() < v_visit.scheduled_start - interval '30 minutes' THEN
      RAISE EXCEPTION 'Check-in opens 30 minutes before the scheduled start' USING ERRCODE='22023';
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

CREATE OR REPLACE FUNCTION public.end_caregiver_visit(
  p_visit_id uuid,
  p_visit_notes text,
  p_actual_end timestamptz
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

  SELECT EXISTS (
    SELECT 1 FROM public.covered_patient_memberships c
    WHERE c.organization_id=v_visit.organization_id AND c.patient_id=v_visit.patient_id
  ) INTO v_is_covered;
  IF v_is_covered THEN
    IF NOT hcn_private.current_staff_patient_v1(v_visit.organization_id,v_visit.patient_id,'caregiver') THEN
      RAISE EXCEPTION 'Your active caregiver authorization for this patient has ended' USING ERRCODE='42501';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.staff_patient_assignments a
    WHERE a.patient_id=v_visit.patient_id AND a.user_id=auth.uid() AND a.is_active
  ) AND NOT EXISTS (
    SELECT 1 FROM public.caregiver_patients cp
    WHERE cp.patient_id=v_visit.patient_id AND cp.caregiver_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Your authorization for this patient has ended' USING ERRCODE='42501';
  END IF;

  IF v_visit.status <> 'in_progress' THEN
    RAISE EXCEPTION 'This visit is not currently in progress' USING ERRCODE='22023';
  END IF;
  IF btrim(COALESCE(p_visit_notes,'')) = '' THEN
    RAISE EXCEPTION 'Visit notes are required to complete this visit' USING ERRCODE='22023';
  END IF;
  IF v_is_covered AND p_actual_end IS NULL THEN
    RAISE EXCEPTION 'Enter the actual departure date and time to check out' USING ERRCODE='22023';
  END IF;
  IF p_actual_end IS NOT NULL AND (
    NOT pg_catalog.isfinite(p_actual_end) OR v_visit.actual_start IS NULL
    OR p_actual_end < v_visit.actual_start OR p_actual_end > now()
  ) THEN
    RAISE EXCEPTION 'Departure time must be between check-in and the current time' USING ERRCODE='22023';
  END IF;

  UPDATE public.caregiver_visits
    SET status='completed', actual_end=COALESCE(p_actual_end,now()),
      visit_notes=p_visit_notes, updated_at=now()
    WHERE id=v_visit.id RETURNING * INTO v_visit;
  RETURN v_visit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.end_caregiver_visit(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.end_caregiver_visit(uuid,text,timestamptz) TO authenticated;

-- Keep the existing call contract for legacy visits. Haneen visits still
-- pass through the same authorization and required departure time checks.
CREATE OR REPLACE FUNCTION public.end_caregiver_visit(
  p_visit_id uuid, p_visit_notes text DEFAULT NULL
) RETURNS public.caregiver_visits
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $fn$
  SELECT public.end_caregiver_visit(p_visit_id,p_visit_notes,NULL::timestamptz);
$fn$;

REVOKE ALL ON FUNCTION public.end_caregiver_visit(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.end_caregiver_visit(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
