-- HCN-OPS: notify the next accountable role in-app without including PHI.
-- Retain existing notification RLS, queue permissions and delivery providers.
CREATE OR REPLACE FUNCTION public.hcn_notify_care_escalation_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_type text;
  v_title text;
  v_recipient record;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NEW.status='director_pending' THEN
    v_type:='hcn_care_escalation_director_attention';
    v_title:='Care escalation awaiting Director review';
    FOR v_recipient IN
      SELECT DISTINCT m.user_id
      FROM public.organization_memberships m
      WHERE m.organization_id=NEW.organization_id
        AND m.status='active' AND m.org_role='director'
    LOOP
      INSERT INTO public.enterprise_notifications
        (recipient_user_id,notification_type,title,body,related_entity_type,related_entity_id,dedup_key)
      VALUES (v_recipient.user_id,v_type,v_title,
        'Open the authorized Care Review & Escalations queue to review this item.',
        'hcn_care_escalation',NEW.id,'hcn-escalation-'||NEW.id||'-'||NEW.status)
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSIF NEW.status='clinical_review_requested' THEN
    v_type:='hcn_care_escalation_clinical_review';
    v_title:='Clinical review requested for assigned patient';
    FOR v_recipient IN
      SELECT DISTINCT a.user_id
      FROM public.staff_patient_assignments a
      JOIN public.organization_memberships m
        ON m.organization_id=a.organization_id AND m.user_id=a.user_id
      WHERE a.organization_id=NEW.organization_id AND a.patient_id=NEW.patient_id
        AND a.is_active AND m.status='active'
        AND m.org_role IN ('medical_professional','therapist','clinical_supervisor')
        AND a.org_role IN ('medical_professional','therapist','clinical_supervisor')
    LOOP
      INSERT INTO public.enterprise_notifications
        (recipient_user_id,notification_type,title,body,related_entity_type,related_entity_id,dedup_key)
      VALUES (v_recipient.user_id,v_type,v_title,
        'Open your Clinical Reviews queue for the authorized care escalation.',
        'hcn_care_escalation',NEW.id,'hcn-escalation-'||NEW.id||'-'||NEW.status)
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSIF NEW.status='clinical_reviewed' THEN
    v_type:='hcn_care_escalation_director_close';
    v_title:='Clinical review completed; Director follow-up required';
    FOR v_recipient IN
      SELECT DISTINCT m.user_id
      FROM public.organization_memberships m
      WHERE m.organization_id=NEW.organization_id
        AND m.status='active' AND m.org_role='director'
    LOOP
      INSERT INTO public.enterprise_notifications
        (recipient_user_id,notification_type,title,body,related_entity_type,related_entity_id,dedup_key)
      VALUES(v_recipient.user_id,v_type,v_title,
        'Review the clinician response and document the Director closure decision.',
        'hcn_care_escalation',NEW.id,'hcn-escalation-'||NEW.id||'-'||NEW.status)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hcn_notify_care_escalation_transition() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS hcn_escalation_transition_notification ON public.hcn_care_escalations;
CREATE TRIGGER hcn_escalation_transition_notification
AFTER INSERT OR UPDATE OF status ON public.hcn_care_escalations
FOR EACH ROW EXECUTE FUNCTION public.hcn_notify_care_escalation_transition();
