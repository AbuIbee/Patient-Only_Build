-- Master #28: pre-visit and clock-out enforce active secondary office grants.
-- Legacy caregiver-only flows remain unchanged for non-enterprise patients.

CREATE OR REPLACE FUNCTION public.hcn_is_previsit_current(p_visit_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.hcn_previsit_acknowledgments ack
    JOIN public.caregiver_visits v ON v.id=ack.visit_id
    WHERE ack.visit_id=p_visit_id
      AND ack.caregiver_id=v.caregiver_id AND ack.organization_id=v.organization_id
      AND (v.caregiver_id=(SELECT auth.uid()) OR public.is_active_org_director(v.organization_id))
      AND ack.patient_id=v.patient_id
      -- A previously valid receipt must be revoked with the assignment,
      -- membership, organization license or patient coverage.
      AND EXISTS (
        SELECT 1
        FROM public.staff_patient_assignments a
        JOIN public.organization_memberships m
          ON m.organization_id=a.organization_id AND m.user_id=a.user_id
        JOIN public.organization_licenses l
          ON l.organization_id=a.organization_id AND l.status='active'
        JOIN public.covered_patient_memberships c
          ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active'
        WHERE a.organization_id=v.organization_id
          AND a.patient_id=v.patient_id AND a.user_id=v.caregiver_id
          AND a.org_role='caregiver' AND a.is_active
          AND m.status='active'
          AND (m.org_role='caregiver' OR (m.org_role IN ('director','co_director')
            AND EXISTS (
              SELECT 1 FROM public.hcn_director_office_grants g
              JOIN public.hcn_director_office_requests req ON req.id=g.source_request_id
                AND req.organization_id=g.organization_id AND req.requester_id=g.user_id
                AND req.capability=g.capability AND req.status='approved'
              WHERE g.organization_id=v.organization_id AND g.user_id=v.caregiver_id
                AND g.capability='caregiver' AND g.status='active'
                AND req.decided_by IS DISTINCT FROM req.requester_id
            )))
      )
      AND ack.acknowledged_at>now()-interval '24 hours'
      AND ack.latest_handoff_at IS NOT DISTINCT FROM (
        SELECT max(h.created_at) FROM public.shift_handoffs h
         WHERE h.organization_id=v.organization_id AND h.patient_id=v.patient_id
      )
      AND ack.latest_patient_note_at IS NOT DISTINCT FROM (
        SELECT max(n.updated_at) FROM public.patient_notes n
         WHERE n.patient_id=v.patient_id AND n.note_type NOT IN
           ('therapist_session','clinical_observation','care_partner_personal')
      )
      AND ack.latest_medications_at IS NOT DISTINCT FROM
        (SELECT max(m.updated_at) FROM public.medications m WHERE m.patient_id=v.patient_id)
      AND ack.latest_contacts_at IS NOT DISTINCT FROM
        (SELECT max(p.updated_at) FROM public.patient_care_providers p WHERE p.patient_id=v.patient_id)
      AND ack.latest_patient_information_at IS NOT DISTINCT FROM
        (SELECT max(i.updated_at) FROM public.hcn_patient_information i WHERE i.patient_id=v.patient_id AND i.organization_id=v.organization_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.end_caregiver_visit(p_visit_id uuid, p_visit_notes text DEFAULT NULL::text)
 RETURNS caregiver_visits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF EXISTS (SELECT 1 FROM public.covered_patient_memberships
             WHERE organization_id=v_row.organization_id AND patient_id=v_row.patient_id) THEN
    -- Enterprise patient: never fall back to a legacy caregiver relationship.
    IF NOT hcn_private.current_staff_patient_v1(v_row.organization_id,v_row.patient_id,'caregiver') THEN
      RAISE EXCEPTION 'Your active caregiver authorization for this patient has ended';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments
                   WHERE patient_id=v_row.patient_id AND user_id=auth.uid() AND is_active=true)
      AND NOT EXISTS (SELECT 1 FROM caregiver_patients
                      WHERE patient_id=v_row.patient_id AND caregiver_id=auth.uid()) THEN
      RAISE EXCEPTION 'Your authorization for this patient has ended';
    END IF;
  END IF;
  IF v_row.status != 'in_progress' THEN RAISE EXCEPTION 'This visit is not currently in progress'; END IF;
  IF btrim(COALESCE(p_visit_notes, '')) = '' THEN
    RAISE EXCEPTION 'Visit notes are required to complete this visit';
  END IF;
  UPDATE caregiver_visits SET status = 'completed', actual_end = now(), visit_notes = p_visit_notes, updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
