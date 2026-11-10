-- HCN-CLINICAL-MASTER-002 Workstream B follow-up delivery truthfulness.
-- Previous hcn_process_due_clinical_reminders() only wrote a 'sent'
-- event, without sending any email. Preserve legacy queue-selection
-- tests while preventing falsely reported delivery. The new Edge worker
-- uses claim/complete below to send actual generic non-PHI emails.

ALTER TABLE public.hcn_clinical_request_events
  DROP CONSTRAINT IF EXISTS hcn_clinical_request_events_event_type_check;
ALTER TABLE public.hcn_clinical_request_events
  ADD CONSTRAINT hcn_clinical_request_events_event_type_check
  CHECK (event_type IN (
    'created','recipient_selected','send_attempted','send_delivered','send_failed',
    'recipient_verified','request_accessed','document_uploaded','response_submitted',
    'administrative_review','clinical_review','revision_requested','cancelled','revoked',
    'reminder_queued','reminder_failed','reminder_sent','completed','closed'
  ));

-- Legacy direct invocation is an event QUEUE only. NEVER 'sent' until
-- the mail provider actually accepts the email. Cron/Edge uses new
-- claim+delivery RPCs; previously recorded legacy sent events remain
-- unchanged in historical records.
CREATE OR REPLACE FUNCTION public.hcn_process_due_clinical_reminders(p_cooldown_hours INTEGER DEFAULT 24)
RETURNS TABLE(out_request_id UUID, processed BOOLEAN, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD; v_already_reminded BOOLEAN; v_access_revoked BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM hcn_clinical_requests
    WHERE status IN ('sent', 'response_received') AND deadline_at IS NOT NULL AND deadline_at <= now()
  LOOP
    BEGIN
      -- Do not requeue an invitation with revoked external access.
      -- The request can legitimately remain status='sent' after revocation.
      SELECT EXISTS (
        SELECT 1 FROM hcn_clinical_request_events e
        WHERE e.request_id = r.id AND e.event_type = 'revoked'
      ) INTO v_access_revoked;
      IF v_access_revoked THEN
        out_request_id := r.id;
        processed := false;
        detail := 'access revoked -- no reminder queued';
        RETURN NEXT;
        CONTINUE;
      END IF;
      SELECT EXISTS (
        SELECT 1 FROM hcn_clinical_request_events e
        WHERE e.request_id = r.id AND e.event_type = 'reminder_queued' AND e.created_at > now() - (p_cooldown_hours || ' hours')::interval
      ) INTO v_already_reminded;

      IF v_already_reminded THEN
        out_request_id := r.id; processed := false; detail := 'cooldown active -- a reminder was already recorded within the window';
        RETURN NEXT;
        CONTINUE;
      END IF;

      PERFORM hcn_record_request_event(r.id, 'reminder_queued', NULL, NULL, jsonb_build_object(
        'reason', 'deadline passed with no response', 'deadline_at', r.deadline_at, 'status_at_reminder', r.status
      ));
      out_request_id := r.id; processed := true; detail := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      out_request_id := r.id; processed := false; detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_process_due_clinical_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_process_due_clinical_reminders(INTEGER) TO service_role;



CREATE TABLE public.hcn_clinical_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.hcn_clinical_requests(id),
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','accepted','failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  resend_message_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hcn_reminder_delivery_recent_idx ON public.hcn_clinical_reminder_deliveries(request_id,claimed_at DESC);
ALTER TABLE public.hcn_clinical_reminder_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_clinical_reminder_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hcn_clinical_reminder_deliveries TO service_role;

-- Locked claims prevent competing cron ticks from scheduling the same
-- message concurrently. The verified recipient comes ONLY from the
-- active request-bound token (not caller-controlled email inputs).
-- Stale processing claims are RETRIED with the SAME attempt id, which
-- also becomes the Resend 24-hour Idempotency-Key.
CREATE FUNCTION public.hcn_claim_due_clinical_reminders(
  p_cooldown_hours integer DEFAULT 24,p_batch_size integer DEFAULT 25)
RETURNS TABLE(attempt_id uuid,request_id uuid,recipient_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row record; v_last public.hcn_clinical_reminder_deliveries;
BEGIN
  IF p_cooldown_hours NOT BETWEEN 1 AND 168 OR p_batch_size NOT BETWEEN 1 AND 50
    THEN RAISE EXCEPTION 'Invalid reminder cooldown or batch size'; END IF;
  FOR v_row IN
    SELECT req.id AS request_id,tok.recipient_email
    FROM public.hcn_clinical_requests req
    JOIN LATERAL (
      SELECT t.recipient_email FROM public.hcn_external_access_tokens t
      WHERE t.request_id=req.id AND t.status IN ('pending','verified')
        AND t.revoked_at IS NULL AND t.expires_at>now()
      ORDER BY t.created_at DESC LIMIT 1
    ) tok ON true
    WHERE req.status='sent' AND req.deadline_at IS NOT NULL AND req.deadline_at<=now()
      AND NOT EXISTS (
        SELECT 1 FROM public.hcn_clinical_request_events e
        WHERE e.request_id=req.id AND e.event_type='revoked'
      )
    ORDER BY req.deadline_at,req.id
    LIMIT p_batch_size
    FOR UPDATE OF req SKIP LOCKED
  LOOP
    SELECT * INTO v_last FROM public.hcn_clinical_reminder_deliveries d
      WHERE d.request_id=v_row.request_id ORDER BY d.claimed_at DESC LIMIT 1 FOR UPDATE;
    IF v_last.id IS NOT NULL THEN
      IF v_last.status='accepted' AND v_last.finished_at>now()-make_interval(hours=>p_cooldown_hours)
        THEN CONTINUE; END IF;
      IF v_last.status='failed' AND v_last.finished_at>now()-interval '1 hour'
        THEN CONTINUE; END IF;
      IF v_last.status='processing' AND v_last.claimed_at>now()-interval '15 minutes'
        THEN CONTINUE; END IF;
    END IF;
    IF v_last.id IS NOT NULL AND v_last.status='processing' THEN
      UPDATE public.hcn_clinical_reminder_deliveries SET claimed_at=now()
        WHERE id=v_last.id;
      attempt_id:=v_last.id;
    ELSE
      INSERT INTO public.hcn_clinical_reminder_deliveries(request_id,recipient_email)
        VALUES(v_row.request_id,v_row.recipient_email) RETURNING id INTO attempt_id;
    END IF;
    request_id:=v_row.request_id;
    recipient_email:=v_row.recipient_email;
    RETURN NEXT;
    v_last:=NULL;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_claim_due_clinical_reminders(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_claim_due_clinical_reminders(integer,integer) TO service_role;

CREATE FUNCTION public.hcn_complete_clinical_reminder(
  p_attempt_id uuid,p_accepted boolean,p_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_attempt public.hcn_clinical_reminder_deliveries;
BEGIN
  SELECT * INTO v_attempt FROM public.hcn_clinical_reminder_deliveries WHERE id=p_attempt_id FOR UPDATE;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'No such reminder claim'; END IF;
  IF v_attempt.status<>'processing' THEN RETURN false; END IF;
  UPDATE public.hcn_clinical_reminder_deliveries
    SET status=CASE WHEN p_accepted THEN 'accepted' ELSE 'failed' END,
      finished_at=now(),
      resend_message_id=CASE WHEN p_accepted THEN left(coalesce(p_message_id,''),128) ELSE NULL END,
      error_code=CASE WHEN p_accepted THEN NULL ELSE left(coalesce(p_error_code,'delivery_failed'),96) END
    WHERE id=p_attempt_id;
  PERFORM public.hcn_record_request_event(v_attempt.request_id,
    CASE WHEN p_accepted THEN 'reminder_sent' ELSE 'reminder_failed' END,
    NULL,NULL,jsonb_build_object('attempt_id',p_attempt_id,
      'provider_accepted',p_accepted));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_complete_clinical_reminder(uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hcn_complete_clinical_reminder(uuid,boolean,text,text) TO service_role;
