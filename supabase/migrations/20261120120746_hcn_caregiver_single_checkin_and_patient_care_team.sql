-- Keep legacy clock records intact while preventing any new simultaneous check-ins.
CREATE INDEX IF NOT EXISTS caregiver_visits_open_by_caregiver
  ON public.caregiver_visits (caregiver_id, actual_start, id)
  WHERE status='in_progress' AND actual_end IS NULL;
CREATE OR REPLACE FUNCTION public.start_caregiver_visit(
  p_visit_id uuid,p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL
) RETURNS public.caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_visit public.caregiver_visits;
  v_is_covered boolean;
  v_open public.caregiver_visits;
  v_patient_name text;
  v_checked_in_at timestamptz;
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
  -- Different visits use different row locks. Serialize starts by caregiver
  -- across organizations before checking for an unfinished visit.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hcn-caregiver-checkin:' || auth.uid()::text, 0));
  SELECT * INTO v_open FROM public.caregiver_visits
    WHERE caregiver_id=auth.uid() AND status='in_progress' AND actual_end IS NULL
    ORDER BY actual_start NULLS LAST, id LIMIT 1;
  IF FOUND THEN
    IF hcn_private.current_staff_patient_v1(v_open.organization_id,v_open.patient_id,'caregiver')
      OR (NOT EXISTS (
        SELECT 1 FROM public.covered_patient_memberships c
        WHERE c.organization_id=v_open.organization_id AND c.patient_id=v_open.patient_id
      ) AND EXISTS (
        SELECT 1 FROM public.caregiver_patients cp
        WHERE cp.patient_id=v_open.patient_id AND cp.caregiver_id=auth.uid()
      ))
    THEN
      SELECT COALESCE(NULLIF(btrim(p.preferred_name),''), NULLIF(btrim(p.first_name || ' ' || p.last_name),''))
        INTO v_patient_name FROM public.patients p WHERE p.id=v_open.patient_id;
    END IF;
    IF v_patient_name IS NOT NULL THEN
      RAISE EXCEPTION 'You are already checked in with %. Check out from % first.',
        v_patient_name, v_patient_name USING ERRCODE='22023';
    END IF;
    RAISE EXCEPTION 'You are already checked in for another visit. Check out from that visit first. If you cannot open it, contact your Director.'
      USING ERRCODE='22023';
  END IF;

  v_checked_in_at := pg_catalog.clock_timestamp();
  IF v_is_covered AND v_checked_in_at < v_visit.scheduled_start - interval '30 minutes' THEN
    RAISE EXCEPTION 'Check-in opens 30 minutes before the scheduled start' USING ERRCODE='22023';
  END IF;

  UPDATE public.caregiver_visits
    SET status='in_progress',actual_start=v_checked_in_at,
      evv_latitude=p_latitude,evv_longitude=p_longitude,updated_at=v_checked_in_at
    WHERE id=p_visit_id RETURNING * INTO v_visit;
  RETURN v_visit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.start_caregiver_visit(uuid,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_caregiver_visit(uuid,double precision,double precision) TO authenticated;

-- Only show providers linked to a patient the caller currently serves.
-- Return directory contacts through the same projection used by the chart.
CREATE FUNCTION public.hcn_get_caregiver_patient_care_team(p_organization_id uuid,p_patient_id uuid)
RETURNS TABLE (member_id uuid,display_name text,specialty text,practice_name text,office_phone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT hcn_private.current_staff_patient_v1(p_organization_id,p_patient_id,'caregiver') THEN
    RAISE EXCEPTION 'Patient care team access denied' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    WITH clinicians AS (
      SELECT a.user_id,a.org_role
      FROM public.staff_patient_assignments a
      JOIN public.organization_memberships m
        ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active'
      WHERE a.organization_id=p_organization_id AND a.patient_id=p_patient_id AND a.is_active
        AND a.org_role IN ('medical_professional','therapist','clinical_supervisor')
        AND (m.org_role=a.org_role OR (m.org_role IN ('director','co_director') AND EXISTS (
          SELECT 1 FROM public.hcn_director_office_grants g
          JOIN public.hcn_director_office_requests r ON r.id=g.source_request_id
            AND r.status='approved' AND r.decided_by IS DISTINCT FROM r.requester_id
            AND r.organization_id=g.organization_id AND r.requester_id=g.user_id AND r.capability=g.capability
          WHERE g.organization_id=a.organization_id AND g.user_id=a.user_id
            AND g.capability=a.org_role AND g.status='active'
        )))
      UNION
      SELECT t.therapist_id,'therapist'::text
      FROM public.therapist_relationships t
      JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist'
      WHERE t.patient_id=p_patient_id AND t.is_active
    )
    SELECT p.id,btrim(p.first_name || ' ' || p.last_name),c.org_role,NULL::text,NULL::text
      FROM clinicians c JOIN public.profiles p ON p.id=c.user_id
    UNION ALL
    SELECT d.provider_id,d.display_name,d.specialty,d.practice_name,d.office_phone
      FROM public.hcn_get_patient_linked_healthcare_providers(p_organization_id,p_patient_id) d
    ORDER BY 2,3;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hcn_get_caregiver_patient_care_team(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_caregiver_patient_care_team(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
