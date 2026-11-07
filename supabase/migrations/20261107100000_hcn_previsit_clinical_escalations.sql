-- HCN-OPS-20261107. Deploy only after test approval.
-- Never grants clinical treatment/diagnosis authority to a caregiver or Director.
CREATE TABLE IF NOT EXISTS public.hcn_previsit_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_sequence bigint GENERATED ALWAYS AS IDENTITY,
  visit_id uuid NOT NULL REFERENCES public.caregiver_visits(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  caregiver_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_sections text[] NOT NULL,
  latest_handoff_at timestamptz,
  latest_patient_note_at timestamptz,
  latest_medications_at timestamptz,
  latest_contacts_at timestamptz,
  latest_patient_information_at timestamptz,
  attestation text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Older staging iteration had one mutable receipt per visit. Drop that
-- uniqueness to retain each re-review as a separate immutable event.
ALTER TABLE public.hcn_previsit_acknowledgments
  DROP CONSTRAINT IF EXISTS hcn_previsit_acknowledgments_visit_id_caregiver_id_key;
ALTER TABLE public.hcn_previsit_acknowledgments
  ADD COLUMN IF NOT EXISTS review_sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS hcn_previsit_visit_history_idx
  ON public.hcn_previsit_acknowledgments(visit_id,caregiver_id,review_sequence DESC);
ALTER TABLE public.hcn_previsit_acknowledgments
  ADD COLUMN IF NOT EXISTS latest_medications_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_contacts_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_patient_information_at timestamptz;
CREATE INDEX IF NOT EXISTS hcn_previsit_patient_idx
  ON public.hcn_previsit_acknowledgments(organization_id,patient_id,acknowledged_at DESC);
ALTER TABLE public.hcn_previsit_acknowledgments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_previsit_acknowledgments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_previsit_acknowledgments TO authenticated;
GRANT ALL ON public.hcn_previsit_acknowledgments TO service_role;
DROP POLICY IF EXISTS "HCN scoped previsit reads" ON public.hcn_previsit_acknowledgments;
CREATE POLICY "HCN scoped previsit reads" ON public.hcn_previsit_acknowledgments
FOR SELECT TO authenticated
USING (
  EXISTS(SELECT 1 FROM public.organization_licenses license
    WHERE license.organization_id=hcn_previsit_acknowledgments.organization_id AND license.status='active')
  AND (
    public.is_active_org_director(organization_id)
    OR (
      caregiver_id=(SELECT auth.uid())
      AND EXISTS(SELECT 1 FROM public.organization_memberships m
        JOIN public.staff_patient_assignments a
          ON a.organization_id=m.organization_id AND a.user_id=m.user_id
        JOIN public.covered_patient_memberships c
          ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active'
        WHERE m.organization_id=hcn_previsit_acknowledgments.organization_id
          AND m.user_id=(SELECT auth.uid()) AND m.org_role='caregiver' AND m.status='active'
          AND a.patient_id=hcn_previsit_acknowledgments.patient_id AND a.is_active)
    )
  )
);

CREATE OR REPLACE FUNCTION public.hcn_acknowledge_previsit(
  p_visit_id uuid, p_sections text[], p_attestation text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_visit public.caregiver_visits; v_id uuid;
  v_handoff timestamptz; v_note timestamptz;
  v_meds timestamptz;v_contacts timestamptz;v_info timestamptz;
BEGIN
  SELECT * INTO v_visit FROM public.caregiver_visits
    WHERE id=p_visit_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_visit.caregiver_id<>auth.uid()
    OR v_visit.status NOT IN ('scheduled','missed') THEN
    RAISE EXCEPTION 'Only the scheduled caregiver may acknowledge an upcoming visit'
      USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    JOIN public.staff_patient_assignments a
      ON a.organization_id=m.organization_id AND a.user_id=m.user_id
    JOIN public.organization_licenses l
      ON l.organization_id=m.organization_id AND l.status='active'
    JOIN public.covered_patient_memberships c
      ON c.organization_id=m.organization_id AND c.patient_id=a.patient_id AND c.status='active'
    WHERE m.organization_id=v_visit.organization_id
      AND m.user_id=auth.uid() AND m.org_role='caregiver' AND m.status='active'
      AND a.patient_id=v_visit.patient_id AND a.is_active
  ) THEN RAISE EXCEPTION 'Active caregiver assignment and licensed coverage required'
      USING ERRCODE='42501'; END IF;
  IF p_sections IS NULL OR NOT (
    p_sections @> ARRAY['patient_updates','care_plan','medications','healthcare_contacts','handoffs']::text[]
  ) OR cardinality(p_sections)>12
    OR p_attestation <> 'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.'
  THEN RAISE EXCEPTION 'Complete the required five-section acknowledgment' USING ERRCODE='22023'; END IF;
  SELECT max(created_at) INTO v_handoff FROM public.shift_handoffs
    WHERE organization_id=v_visit.organization_id AND patient_id=v_visit.patient_id;
  SELECT max(updated_at) INTO v_note FROM public.patient_notes
    WHERE patient_id=v_visit.patient_id AND note_type NOT IN
      ('therapist_session','clinical_observation','care_partner_personal');
  SELECT max(updated_at) INTO v_meds FROM public.medications WHERE patient_id=v_visit.patient_id;
  SELECT max(updated_at) INTO v_contacts FROM public.patient_care_providers WHERE patient_id=v_visit.patient_id;
  SELECT max(updated_at) INTO v_info FROM public.hcn_patient_information
    WHERE patient_id=v_visit.patient_id AND organization_id=v_visit.organization_id;
  INSERT INTO public.hcn_previsit_acknowledgments
    (visit_id,organization_id,patient_id,caregiver_id,reviewed_sections,latest_handoff_at,latest_patient_note_at,latest_medications_at,latest_contacts_at,latest_patient_information_at,attestation)
  VALUES(p_visit_id,v_visit.organization_id,v_visit.patient_id,auth.uid(),
         p_sections,v_handoff,v_note,v_meds,v_contacts,v_info,p_attestation)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_acknowledge_previsit(uuid,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_acknowledge_previsit(uuid,text[],text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_is_previsit_current(p_visit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM public.hcn_previsit_acknowledgments ack
    JOIN public.caregiver_visits v ON v.id=ack.visit_id
    WHERE ack.visit_id=p_visit_id
      AND ack.caregiver_id=v.caregiver_id AND ack.organization_id=v.organization_id
      AND ack.patient_id=v.patient_id
      AND EXISTS(SELECT 1 FROM public.organization_licenses l
        WHERE l.organization_id=v.organization_id AND l.status='active')
      AND (
        public.is_active_org_director(v.organization_id)
        OR (
          v.caregiver_id=(SELECT auth.uid())
          AND EXISTS(SELECT 1 FROM public.organization_memberships m
            JOIN public.staff_patient_assignments a
              ON a.organization_id=m.organization_id AND a.user_id=m.user_id
            JOIN public.covered_patient_memberships c
              ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active'
            WHERE m.organization_id=v.organization_id
              AND m.user_id=(SELECT auth.uid()) AND m.org_role='caregiver' AND m.status='active'
              AND a.patient_id=v.patient_id AND a.is_active)
        )
      )
      AND ack.id=(SELECT recent.id FROM public.hcn_previsit_acknowledgments recent
        WHERE recent.visit_id=v.id AND recent.caregiver_id=v.caregiver_id
        ORDER BY recent.review_sequence DESC LIMIT 1)
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
$fn$;
REVOKE ALL ON FUNCTION public.hcn_is_previsit_current(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_is_previsit_current(uuid) TO authenticated,service_role;

-- Gate the existing start RPC at the database layer so a direct client RPC
-- cannot bypass the acknowledgment UI. On staging this applies to all visits
-- only after acceptance testing; production migration is separately gated.
CREATE OR REPLACE FUNCTION public.start_caregiver_visit(
  p_visit_id uuid,p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL
) RETURNS public.caregiver_visits LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_row public.caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.caregiver_visits WHERE id=p_visit_id
    AND caregiver_id=auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Visit not assigned to this caregiver' USING ERRCODE='42501'; END IF;
  IF v_row.status NOT IN ('scheduled','missed') THEN
    RAISE EXCEPTION 'Visit cannot be started from current status' USING ERRCODE='22023'; END IF;
  IF NOT public.hcn_is_previsit_current(p_visit_id) THEN
    RAISE EXCEPTION 'Pre-visit review required or updates arrived since your last acknowledgment'
      USING ERRCODE='22023'; END IF;
  UPDATE public.caregiver_visits SET status='in_progress',actual_start=now(),
    evv_latitude=p_latitude,evv_longitude=p_longitude,updated_at=now()
    WHERE id=p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$fn$;

CREATE TABLE IF NOT EXISTS public.hcn_care_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 4000),
  urgency text NOT NULL CHECK(urgency IN ('routine','priority','urgent')),
  status text NOT NULL DEFAULT 'director_pending'
    CHECK(status IN ('director_pending','clinical_review_requested','clinical_reviewed','resolved')),
  director_id uuid REFERENCES public.profiles(id),
  director_note text,
  clinical_reviewer_id uuid REFERENCES public.profiles(id),
  clinical_note text,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  director_reviewed_at timestamptz,
  clinical_reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hcn_escalation_queue_idx
ON public.hcn_care_escalations(organization_id,status,created_at DESC);
ALTER TABLE public.hcn_care_escalations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_care_escalations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_care_escalations TO authenticated;
GRANT ALL ON public.hcn_care_escalations TO service_role;
DROP POLICY IF EXISTS "HCN scoped care escalation read" ON public.hcn_care_escalations;
CREATE POLICY "HCN scoped care escalation read" ON public.hcn_care_escalations
FOR SELECT TO authenticated
USING (
  EXISTS(SELECT 1 FROM public.organization_licenses l WHERE l.organization_id=hcn_care_escalations.organization_id AND l.status='active')
  AND (public.is_active_org_director(organization_id)
  OR EXISTS(
    SELECT 1 FROM public.staff_patient_assignments a
    JOIN public.organization_memberships m ON m.organization_id=a.organization_id
      AND m.user_id=a.user_id AND m.status='active'
    WHERE a.organization_id=hcn_care_escalations.organization_id
      AND a.patient_id=hcn_care_escalations.patient_id
      AND a.user_id=(SELECT auth.uid()) AND a.is_active
  ))
);

CREATE TABLE IF NOT EXISTS public.hcn_care_escalation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES public.hcn_care_escalations(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN ('submitted','director_triaged','clinician_reviewed','director_closed')),
  from_status text,
  to_status text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hcn_escalation_events_case_idx
  ON public.hcn_care_escalation_events(escalation_id,created_at DESC);
ALTER TABLE public.hcn_care_escalation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_care_escalation_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_care_escalation_events TO authenticated;
GRANT ALL ON public.hcn_care_escalation_events TO service_role;
DROP POLICY IF EXISTS "HCN scoped escalation event history" ON public.hcn_care_escalation_events;
CREATE POLICY "HCN scoped escalation event history"
  ON public.hcn_care_escalation_events FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.hcn_care_escalations e WHERE e.id=escalation_id));

CREATE OR REPLACE FUNCTION public.hcn_submit_care_escalation(
  p_org_id uuid,p_patient_id uuid,p_reason text,p_urgency text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_urgency NOT IN ('routine','priority','urgent')
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 4000 THEN
    RAISE EXCEPTION 'Authenticated author, valid reason and urgency required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses l WHERE l.organization_id=p_org_id AND l.status='active') THEN
    RAISE EXCEPTION 'Active organization license required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.staff_patient_assignments a
    JOIN public.organization_memberships m ON m.organization_id=a.organization_id
      AND m.user_id=a.user_id AND m.status='active' AND m.org_role='caregiver'
    JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active'
    JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id
      AND c.patient_id=a.patient_id AND c.status='active'
    WHERE a.organization_id=p_org_id AND a.patient_id=p_patient_id
      AND a.user_id=auth.uid() AND a.is_active
  ) THEN RAISE EXCEPTION 'Active assigned caregiver required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.hcn_care_escalations
    (organization_id,patient_id,created_by,reason,urgency)
  VALUES(p_org_id,p_patient_id,auth.uid(),btrim(p_reason),p_urgency)
  RETURNING id INTO v_id;
  INSERT INTO public.hcn_care_escalation_events
    (escalation_id,actor_id,event_type,from_status,to_status,detail)
  VALUES(v_id,auth.uid(),'submitted',NULL,'director_pending',btrim(p_reason));
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_submit_care_escalation(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_submit_care_escalation(uuid,uuid,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_director_triage_escalation(
  p_id uuid,p_action text,p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_case public.hcn_care_escalations;
BEGIN
  SELECT * INTO v_case FROM public.hcn_care_escalations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_active_org_director(v_case.organization_id) THEN
    RAISE EXCEPTION 'Only this organization Director may triage' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_licenses l
    WHERE l.organization_id=v_case.organization_id AND l.status='active') THEN
    RAISE EXCEPTION 'Active organization license required' USING ERRCODE='42501'; END IF;
  IF v_case.status<>'director_pending'
    OR p_action NOT IN ('request_clinical_review','resolve_nonclinical')
    OR length(btrim(coalesce(p_note,'')))<10 THEN
    RAISE EXCEPTION 'Invalid triage state, action or note' USING ERRCODE='22023'; END IF;
  UPDATE public.hcn_care_escalations
    SET status=CASE WHEN p_action='request_clinical_review' THEN 'clinical_review_requested' ELSE 'resolved' END,
    director_id=auth.uid(),director_note=btrim(p_note),director_reviewed_at=now(),
    resolved_at=CASE WHEN p_action='resolve_nonclinical' THEN now() ELSE NULL END,
    resolution_note=CASE WHEN p_action='resolve_nonclinical' THEN btrim(p_note) ELSE NULL END,
    updated_at=now() WHERE id=p_id;
  INSERT INTO public.hcn_care_escalation_events
    (escalation_id,actor_id,event_type,from_status,to_status,detail)
  VALUES(p_id,auth.uid(),'director_triaged','director_pending',
    CASE WHEN p_action='request_clinical_review' THEN 'clinical_review_requested' ELSE 'resolved' END,
    btrim(p_note));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_triage_escalation(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_triage_escalation(uuid,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_clinician_review_escalation(
  p_id uuid,p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_case public.hcn_care_escalations;
BEGIN
  SELECT * INTO v_case FROM public.hcn_care_escalations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_case.status<>'clinical_review_requested'
    OR length(btrim(coalesce(p_note,'')))<10 THEN
    RAISE EXCEPTION 'Clinical review must be requested and documented' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses l WHERE l.organization_id=v_case.organization_id AND l.status='active') THEN
    RAISE EXCEPTION 'Active organization license required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.staff_patient_assignments a
    JOIN public.organization_memberships m ON m.organization_id=a.organization_id
      AND m.user_id=a.user_id AND m.status='active'
      AND m.org_role IN ('medical_professional','therapist','clinical_supervisor')
    WHERE a.organization_id=v_case.organization_id
      AND a.patient_id=v_case.patient_id AND a.user_id=auth.uid() AND a.is_active
  ) THEN RAISE EXCEPTION 'Assigned clinical professional required' USING ERRCODE='42501'; END IF;
  UPDATE public.hcn_care_escalations SET status='clinical_reviewed',
    clinical_reviewer_id=auth.uid(),clinical_note=btrim(p_note),
    clinical_reviewed_at=now(),updated_at=now() WHERE id=p_id;
  INSERT INTO public.hcn_care_escalation_events
    (escalation_id,actor_id,event_type,from_status,to_status,detail)
  VALUES(p_id,auth.uid(),'clinician_reviewed','clinical_review_requested','clinical_reviewed',btrim(p_note));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_clinician_review_escalation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_clinician_review_escalation(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.hcn_director_close_escalation(
  p_id uuid,p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_case public.hcn_care_escalations;
BEGIN
  SELECT * INTO v_case FROM public.hcn_care_escalations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_active_org_director(v_case.organization_id) THEN
    RAISE EXCEPTION 'Only organization Director may close an escalation' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_licenses l WHERE l.organization_id=v_case.organization_id AND l.status='active') THEN
    RAISE EXCEPTION 'Active organization license required' USING ERRCODE='42501'; END IF;
  IF v_case.status<>'clinical_reviewed' OR length(btrim(coalesce(p_note,'')))<10 THEN
    RAISE EXCEPTION 'Clinical review and closure notes required' USING ERRCODE='22023'; END IF;
  UPDATE public.hcn_care_escalations
    SET status='resolved',resolution_note=btrim(p_note),resolved_at=now(),updated_at=now()
    WHERE id=p_id;
  INSERT INTO public.hcn_care_escalation_events
    (escalation_id,actor_id,event_type,from_status,to_status,detail)
  VALUES(p_id,auth.uid(),'director_closed','clinical_reviewed','resolved',btrim(p_note));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_close_escalation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_close_escalation(uuid,text) TO authenticated,service_role;
