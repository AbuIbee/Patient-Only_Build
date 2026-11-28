-- HCN Director safety operations: caregiver assistance, required care demand, handoff receipt.
-- This migration must be validated against a disposable full-migration database first.
-- No existing role, visit, clinical review or patient-access permissions are broadened.

CREATE TABLE public.hcn_caregiver_assistance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','in_contact','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  contacted_by uuid,
  contacted_at timestamptz,
  contact_method text CHECK (contact_method IN ('phone','secure_message','in_person')),
  contact_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text
);
CREATE INDEX hcn_assistance_org_status_idx ON public.hcn_caregiver_assistance_alerts
  (organization_id,status,created_at DESC);
CREATE TABLE public.hcn_caregiver_assistance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.hcn_caregiver_assistance_alerts(id),
  actor_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('opened','acknowledged','in_contact','resolved')),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hcn_assistance_events_alert_idx ON public.hcn_caregiver_assistance_events
  (alert_id,occurred_at);

ALTER TABLE public.hcn_caregiver_assistance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcn_caregiver_assistance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_caregiver_assistance_alerts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.hcn_caregiver_assistance_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_caregiver_assistance_alerts TO authenticated;
GRANT INSERT (organization_id,patient_id,reason) ON public.hcn_caregiver_assistance_alerts TO authenticated;
GRANT SELECT ON public.hcn_caregiver_assistance_events TO authenticated;
CREATE POLICY hcn_assistance_read ON public.hcn_caregiver_assistance_alerts FOR SELECT TO authenticated
USING (
  hcn_private.current_director_patient_v1(organization_id,patient_id)
  OR (created_by=(SELECT auth.uid())
      AND hcn_private.current_staff_patient_v1(organization_id,patient_id,'caregiver'))
);
CREATE POLICY hcn_assistance_open ON public.hcn_caregiver_assistance_alerts FOR INSERT TO authenticated
WITH CHECK (
  created_by=(SELECT auth.uid())
  AND hcn_private.current_staff_patient_v1(organization_id,patient_id,'caregiver')
);
CREATE POLICY hcn_assistance_event_read ON public.hcn_caregiver_assistance_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.hcn_caregiver_assistance_alerts a WHERE a.id=alert_id
));

CREATE FUNCTION public.hcn_assistance_open_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
  INSERT INTO public.hcn_caregiver_assistance_events (alert_id,actor_id,event_type,note)
  VALUES (NEW.id,NEW.created_by,'opened',NULL);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER hcn_assistance_open_audit_trg AFTER INSERT ON public.hcn_caregiver_assistance_alerts
FOR EACH ROW EXECUTE FUNCTION public.hcn_assistance_open_audit();
REVOKE ALL ON FUNCTION public.hcn_assistance_open_audit() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.hcn_director_action_assistance_alert(
  p_alert_id uuid,p_action text,p_note text DEFAULT NULL,p_contact_method text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v public.hcn_caregiver_assistance_alerts%ROWTYPE;
  v_note text := btrim(coalesce(p_note,''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.hcn_caregiver_assistance_alerts
    WHERE id=p_alert_id FOR UPDATE;
  IF v.id IS NULL OR NOT hcn_private.current_director_patient_v1(v.organization_id,v.patient_id) THEN
    RAISE EXCEPTION 'Assistance alert is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_action='acknowledge' AND v.status='open' THEN
    UPDATE public.hcn_caregiver_assistance_alerts
      SET status='acknowledged',acknowledged_by=(SELECT auth.uid()),acknowledged_at=now()
      WHERE id=v.id;
  ELSIF p_action='contact' AND v.status='acknowledged' THEN
    IF p_contact_method NOT IN ('phone','secure_message','in_person')
       OR char_length(v_note) < 5 THEN
      RAISE EXCEPTION 'Contact method and a note of at least five characters are required';
    END IF;
    UPDATE public.hcn_caregiver_assistance_alerts
      SET status='in_contact',contacted_by=(SELECT auth.uid()),contacted_at=now(),
        contact_method=p_contact_method,contact_note=v_note WHERE id=v.id;
  ELSIF p_action='resolve' AND v.status='in_contact' THEN
    IF char_length(v_note) < 10 THEN
      RAISE EXCEPTION 'Resolution note must contain at least ten characters';
    END IF;
    UPDATE public.hcn_caregiver_assistance_alerts
      SET status='resolved',resolved_by=(SELECT auth.uid()),resolved_at=now(),
        resolution_note=v_note WHERE id=v.id;
  ELSE
    RAISE EXCEPTION 'Invalid assistance alert transition' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.hcn_caregiver_assistance_events(alert_id,actor_id,event_type,note)
  VALUES(v.id,(SELECT auth.uid()),CASE WHEN p_action='contact' THEN 'in_contact' ELSE
    CASE WHEN p_action='acknowledge' THEN 'acknowledged' ELSE 'resolved' END END,
    NULLIF(v_note,''));
  RETURN CASE WHEN p_action='contact' THEN 'in_contact'
    WHEN p_action='acknowledge' THEN 'acknowledged' ELSE 'resolved' END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_action_assistance_alert(uuid,text,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_action_assistance_alert(uuid,text,text,text)
  TO authenticated;

-- Required care must exist independently of a scheduled caregiver_visit. This is
-- demand entered by a Director, NOT inferred from an absence of appointment rows.
CREATE TABLE public.hcn_required_care_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  requirement_note text NOT NULL CHECK (char_length(btrim(requirement_note)) BETWEEN 6 AND 1000),
  status text NOT NULL DEFAULT 'required' CHECK (status IN ('required','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  CONSTRAINT hcn_required_slot_valid_window CHECK (ends_at>starts_at AND ends_at<=starts_at+interval '24 hours')
);
CREATE UNIQUE INDEX hcn_required_slot_no_dup ON public.hcn_required_care_slots
  (organization_id,patient_id,starts_at,ends_at) WHERE status='required';
CREATE INDEX hcn_required_slot_window_idx ON public.hcn_required_care_slots
  (organization_id,starts_at,ends_at) WHERE status='required';
CREATE TABLE public.hcn_required_care_slot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.hcn_required_care_slots(id),
  actor_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('required','cancelled')),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hcn_required_care_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcn_required_care_slot_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_required_care_slots FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.hcn_required_care_slot_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_required_care_slots TO authenticated;
GRANT SELECT ON public.hcn_required_care_slot_events TO authenticated;
CREATE POLICY hcn_required_care_director_read ON public.hcn_required_care_slots
FOR SELECT TO authenticated USING (
  hcn_private.current_director_patient_v1(organization_id,patient_id)
);
CREATE POLICY hcn_required_care_events_read ON public.hcn_required_care_slot_events
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.hcn_required_care_slots s WHERE s.id=slot_id
));

CREATE FUNCTION public.hcn_director_require_care(
  p_org uuid,p_patient uuid,p_start timestamptz,p_end timestamptz,p_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR
     NOT hcn_private.current_director_patient_v1(p_org,p_patient) THEN
    RAISE EXCEPTION 'Director care-coverage authorization required' USING ERRCODE='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start < now()-interval '1 minute'
     OR p_start > now()+interval '90 days'
     OR p_end<=p_start OR p_end>p_start+interval '24 hours'
     OR char_length(btrim(coalesce(p_note,''))) NOT BETWEEN 6 AND 1000 THEN
    RAISE EXCEPTION 'Invalid care requirement time or note' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.hcn_required_care_slots(
    organization_id,patient_id,starts_at,ends_at,requirement_note,created_by
  ) VALUES(p_org,p_patient,p_start,p_end,btrim(p_note),(SELECT auth.uid()))
  RETURNING id INTO v_id;
  INSERT INTO public.hcn_required_care_slot_events(slot_id,actor_id,event_type,reason)
  VALUES(v_id,(SELECT auth.uid()),'required',NULL);
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_require_care(uuid,uuid,timestamptz,timestamptz,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_require_care(uuid,uuid,timestamptz,timestamptz,text)
  TO authenticated;

CREATE FUNCTION public.hcn_director_cancel_required_care(p_slot uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v public.hcn_required_care_slots%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.hcn_required_care_slots WHERE id=p_slot FOR UPDATE;
  IF v.id IS NULL OR NOT hcn_private.current_director_patient_v1(v.organization_id,v.patient_id)
     OR v.status <> 'required' THEN
    RAISE EXCEPTION 'Requirement cannot be cancelled by this user' USING ERRCODE='42501';
  END IF;
  IF char_length(btrim(coalesce(p_reason,''))) < 10 THEN
    RAISE EXCEPTION 'A cancellation reason of at least ten characters is required';
  END IF;
  UPDATE public.hcn_required_care_slots SET status='cancelled',
    cancelled_by=(SELECT auth.uid()),cancelled_at=now(),cancellation_reason=btrim(p_reason)
    WHERE id=p_slot;
  INSERT INTO public.hcn_required_care_slot_events(slot_id,actor_id,event_type,reason)
  VALUES(p_slot,(SELECT auth.uid()),'cancelled',btrim(p_reason));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_cancel_required_care(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_cancel_required_care(uuid,text) TO authenticated;

-- Incoming caregiver and receipt deadline are derived from the ACTUAL scheduled
-- next visits. A handoff without a following scheduled caregiver remains unassigned
-- and must not be falsely reported as an overdue acknowledgment.
CREATE TABLE public.hcn_handoff_receipt_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  handoff_id uuid NOT NULL REFERENCES public.shift_handoffs(id),
  incoming_caregiver_id uuid NOT NULL,
  incoming_visit_id uuid NOT NULL REFERENCES public.caregiver_visits(id),
  acknowledge_by timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(handoff_id,incoming_caregiver_id)
);
CREATE INDEX hcn_handoff_target_due_idx ON public.hcn_handoff_receipt_targets
  (organization_id,acknowledge_by);
ALTER TABLE public.hcn_handoff_receipt_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_handoff_receipt_targets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_handoff_receipt_targets TO authenticated;
CREATE POLICY hcn_handoff_target_director_read ON public.hcn_handoff_receipt_targets
FOR SELECT TO authenticated USING (
  hcn_private.current_director_patient_v1(organization_id,patient_id)
);

CREATE FUNCTION public.hcn_capture_handoff_targets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
  INSERT INTO public.hcn_handoff_receipt_targets(
    organization_id,patient_id,handoff_id,incoming_caregiver_id,incoming_visit_id,acknowledge_by)
  SELECT NEW.organization_id,NEW.patient_id,NEW.id,v.caregiver_id,v.id,v.scheduled_start
  FROM (
    SELECT DISTINCT ON (cv.caregiver_id) cv.id,cv.caregiver_id,cv.scheduled_start
    FROM public.caregiver_visits cv
    JOIN public.staff_patient_assignments spa
      ON spa.organization_id=cv.organization_id AND spa.patient_id=cv.patient_id
       AND spa.user_id=cv.caregiver_id AND spa.org_role='caregiver' AND spa.is_active
    JOIN public.organization_memberships m
      ON m.organization_id=cv.organization_id AND m.user_id=cv.caregiver_id
       AND m.status='active' AND m.org_role='caregiver'
    WHERE cv.organization_id=NEW.organization_id AND cv.patient_id=NEW.patient_id
      AND cv.caregiver_id IS DISTINCT FROM NEW.author_id
      AND cv.status='scheduled'
      AND cv.scheduled_start>NEW.created_at
      AND cv.scheduled_start<=NEW.created_at+interval '48 hours'
    ORDER BY cv.caregiver_id,cv.scheduled_start ASC
  ) v ON CONFLICT (handoff_id,incoming_caregiver_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER hcn_handoff_capture_targets AFTER INSERT ON public.shift_handoffs
FOR EACH ROW EXECUTE FUNCTION public.hcn_capture_handoff_targets();
REVOKE ALL ON FUNCTION public.hcn_capture_handoff_targets() FROM PUBLIC,anon,authenticated;

COMMENT ON TABLE public.hcn_required_care_slots IS
  'Director-authored mandatory care windows; compares against actual scheduled visits for next 48-hour uncovered-care alerts.';
COMMENT ON TABLE public.hcn_handoff_receipt_targets IS
  'Immutable designated handoff recipients captured at record creation from future scheduled shifts. Receipt verified separately by shift_handoff_acknowledgments.';


-- Handoff acknowledgment receipts are available to Directors without widening
-- the caregiver-only RLS policy on shift_handoff_acknowledgments.
CREATE FUNCTION public.hcn_director_handoff_receipts(p_org uuid, p_until timestamptz)
RETURNS TABLE(
  id uuid, organization_id uuid, patient_id uuid, handoff_id uuid,
  incoming_caregiver_id uuid, incoming_visit_id uuid,
  acknowledge_by timestamptz, acknowledged_at timestamptz,
  outgoing_caregiver_id uuid, handoff_created_at timestamptz, handoff_summary text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
  SELECT t.id,t.organization_id,t.patient_id,t.handoff_id,
    t.incoming_caregiver_id,t.incoming_visit_id,t.acknowledge_by,
    ack.acknowledged_at,s.author_id,s.created_at,s.summary
  FROM public.hcn_handoff_receipt_targets t
  JOIN public.shift_handoffs s ON s.id=t.handoff_id
  LEFT JOIN public.shift_handoff_acknowledgments ack
    ON ack.handoff_id=t.handoff_id AND ack.acknowledged_by=t.incoming_caregiver_id
  WHERE t.organization_id=p_org
    AND t.acknowledge_by >= now()-interval '7 days'
    AND t.acknowledge_by <= LEAST(p_until,now()+interval '48 hours')
    AND hcn_private.current_director_patient_v1(t.organization_id,t.patient_id)
  ORDER BY t.acknowledge_by,t.id;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_handoff_receipts(uuid,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_handoff_receipts(uuid,timestamptz)
  TO authenticated;

-- If the next shift is scheduled AFTER handoff creation, populate its
-- acknowledgement expectation as well. Only the most recent relevant handoff
-- is attached, avoiding stale historical handoffs.
CREATE FUNCTION public.hcn_capture_handoff_on_new_visit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_handoff public.shift_handoffs%ROWTYPE;
BEGIN
  IF NEW.status<>'scheduled' OR NEW.scheduled_start IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_handoff FROM public.shift_handoffs sh
    WHERE sh.organization_id=NEW.organization_id
      AND sh.patient_id=NEW.patient_id
      AND sh.author_id IS DISTINCT FROM NEW.caregiver_id
      AND sh.created_at<=NEW.scheduled_start
      AND sh.created_at>=NEW.scheduled_start-interval '48 hours'
    ORDER BY sh.created_at DESC LIMIT 1;
  IF v_handoff.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staff_patient_assignments spa
    JOIN public.organization_memberships m
      ON m.organization_id=spa.organization_id AND m.user_id=spa.user_id
       AND m.org_role='caregiver' AND m.status='active'
    WHERE spa.organization_id=NEW.organization_id AND spa.patient_id=NEW.patient_id
      AND spa.user_id=NEW.caregiver_id AND spa.org_role='caregiver' AND spa.is_active
  ) THEN
    INSERT INTO public.hcn_handoff_receipt_targets(
      organization_id,patient_id,handoff_id,incoming_caregiver_id,incoming_visit_id,acknowledge_by
    ) VALUES(NEW.organization_id,NEW.patient_id,v_handoff.id,
      NEW.caregiver_id,NEW.id,NEW.scheduled_start)
    ON CONFLICT(handoff_id,incoming_caregiver_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER hcn_capture_handoff_on_visit_trg AFTER INSERT ON public.caregiver_visits
FOR EACH ROW EXECUTE FUNCTION public.hcn_capture_handoff_on_new_visit();
REVOKE ALL ON FUNCTION public.hcn_capture_handoff_on_new_visit() FROM PUBLIC,anon,authenticated;


-- Director can document an operational visit follow-up, but cannot forge caregiver
-- check-in/out times or alter clinical notes. Each entry is immutable.
CREATE TABLE public.hcn_director_visit_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  visit_id uuid NOT NULL REFERENCES public.caregiver_visits(id),
  actor_user_id uuid NOT NULL,
  action_type text NOT NULL CHECK(action_type IN ('contact_attempted','reviewed','replacement_planned','visit_cancelled')),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hcn_visit_actions_visit_idx ON public.hcn_director_visit_actions(visit_id,created_at);
ALTER TABLE public.hcn_director_visit_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_director_visit_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hcn_director_visit_actions TO authenticated;
CREATE POLICY hcn_visit_actions_director_read ON public.hcn_director_visit_actions
FOR SELECT TO authenticated USING (
  hcn_private.current_director_patient_v1(organization_id,patient_id)
);

CREATE FUNCTION public.hcn_director_record_visit_action(
  p_visit uuid,p_action text,p_note text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v public.caregiver_visits%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v FROM public.caregiver_visits WHERE id=p_visit;
  IF v.id IS NULL OR NOT hcn_private.current_director_patient_v1(v.organization_id,v.patient_id) THEN
    RAISE EXCEPTION 'Visit is unavailable for this Director' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('contact_attempted','reviewed','replacement_planned')
      OR char_length(btrim(coalesce(p_note,''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'A valid operational action and note (10-2000 characters) are required'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.hcn_director_visit_actions(organization_id,patient_id,visit_id,actor_user_id,action_type,note)
  VALUES(v.organization_id,v.patient_id,v.id,(SELECT auth.uid()),p_action,btrim(p_note))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_record_visit_action(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_record_visit_action(uuid,text,text) TO authenticated;

-- Cancellation is limited to NOT STARTED visits. Do not alter actual attendance.
-- This permits Director correction of legacy/overlapping scheduled visits.
CREATE FUNCTION public.hcn_director_cancel_scheduled_visit(
  p_visit uuid,p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v public.caregiver_visits%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.caregiver_visits WHERE id=p_visit FOR UPDATE;
  IF v.id IS NULL OR NOT hcn_private.current_director_patient_v1(v.organization_id,v.patient_id) THEN
    RAISE EXCEPTION 'Visit is unavailable for this Director' USING ERRCODE='42501';
  END IF;
  IF v.status<>'scheduled' OR v.actual_start IS NOT NULL OR v.actual_end IS NOT NULL THEN
    RAISE EXCEPTION 'Only visits that have not started can be cancelled' USING ERRCODE='23514';
  END IF;
  IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Cancellation reason must contain 10-2000 characters';
  END IF;
  UPDATE public.caregiver_visits SET status='canceled',updated_at=now() WHERE id=v.id;
  INSERT INTO public.hcn_director_visit_actions(organization_id,patient_id,visit_id,actor_user_id,action_type,note)
  VALUES(v.organization_id,v.patient_id,v.id,(SELECT auth.uid()),'visit_cancelled',btrim(p_reason));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.hcn_director_cancel_scheduled_visit(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_director_cancel_scheduled_visit(uuid,text) TO authenticated;
