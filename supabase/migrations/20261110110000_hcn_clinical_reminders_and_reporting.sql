-- HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- Automated
-- Follow-Ups and Reporting.
--
-- hcn_process_due_clinical_reminders() mirrors
-- archive_eligible_closed_patients() (migration 146)'s own established
-- pattern exactly: retry-safe (re-running after a partial run only
-- touches requests that still qualify), a per-row EXCEPTION handler so
-- one bad row never aborts the batch, and idempotent via a cooldown
-- check against its own event history (no separate "already
-- processed" flag needed -- hcn_clinical_request_events IS the
-- delivery-tracking record).
--
-- KNOWN LIMITATION, explicitly recorded rather than silently skipped
-- (same posture migration 146 already established for this exact
-- situation): actual periodic SCHEDULING of this function is NOT
-- configured by this migration. pg_cron is not installed on this
-- project at all (confirmed: migration 146's own comment), and
-- wiring an external scheduler (Vercel Cron, a scheduled GitHub
-- Action, Supabase's own scheduled functions, etc.) against a real
-- production project is a deployment-configuration decision for
-- whoever controls that environment, not an application-code gap.
-- The REMINDER LOGIC ITSELF is complete, idempotent, retry-safe, and
-- independently tested by direct invocation (service_role only, via
-- the hcn-process-clinical-reminders Edge Function or a direct RPC
-- call) -- exactly as complete as the archival feature it mirrors.
CREATE OR REPLACE FUNCTION public.hcn_process_due_clinical_reminders(p_cooldown_hours INTEGER DEFAULT 24)
RETURNS TABLE(out_request_id UUID, processed BOOLEAN, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD; v_already_reminded BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM hcn_clinical_requests
    WHERE status IN ('sent', 'response_received') AND deadline_at IS NOT NULL AND deadline_at <= now()
  LOOP
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM hcn_clinical_request_events e
        WHERE e.request_id = r.id AND e.event_type = 'reminder_sent' AND e.created_at > now() - (p_cooldown_hours || ' hours')::interval
      ) INTO v_already_reminded;

      IF v_already_reminded THEN
        out_request_id := r.id; processed := false; detail := 'cooldown active -- a reminder was already recorded within the window';
        RETURN NEXT;
        CONTINUE;
      END IF;

      PERFORM hcn_record_request_event(r.id, 'reminder_sent', NULL, NULL, jsonb_build_object(
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

-- Director/Owner reporting, reconciled directly against the real
-- tables at query time -- every number here is independently
-- re-derivable by a Director via the same tables this function reads,
-- never a cached or separately-maintained counter that could drift.
CREATE OR REPLACE FUNCTION public.hcn_get_clinical_coordination_report(p_organization_id UUID)
RETURNS TABLE(
  total_requests INTEGER, requests_sent INTEGER, requests_overdue INTEGER, requests_pending_review INTEGER,
  requests_pending_clinical_approval INTEGER, requests_closed_or_accepted INTEGER,
  documents_pending_administrative_review INTEGER, documents_pending_clinical_approval INTEGER,
  active_coordination_plans INTEGER, reminders_sent_last_30_days INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (is_active_org_director(p_organization_id) OR is_organization_owner(p_organization_id)) THEN
    RAISE EXCEPTION 'Only an active Director or the Organization Owner may view this report';
  END IF;

  RETURN QUERY SELECT
    (SELECT count(*)::INTEGER FROM hcn_clinical_requests WHERE organization_id = p_organization_id),
    (SELECT count(*)::INTEGER FROM hcn_clinical_requests WHERE organization_id = p_organization_id AND status IN ('sent', 'response_received')),
    (SELECT count(*)::INTEGER FROM hcn_clinical_requests WHERE organization_id = p_organization_id AND status IN ('sent', 'response_received') AND deadline_at IS NOT NULL AND deadline_at <= now()),
    (SELECT count(*)::INTEGER FROM hcn_clinical_requests WHERE organization_id = p_organization_id AND status = 'pending_review'),
    (SELECT count(*)::INTEGER FROM hcn_clinical_requests WHERE organization_id = p_organization_id AND status = 'pending_clinical_approval'),
    (SELECT count(*)::INTEGER FROM hcn_clinical_requests WHERE organization_id = p_organization_id AND status IN ('closed', 'accepted')),
    (SELECT count(*)::INTEGER FROM hcn_clinical_documents WHERE organization_id = p_organization_id AND review_status = 'received_unreviewed'),
    (SELECT count(*)::INTEGER FROM hcn_clinical_documents WHERE organization_id = p_organization_id AND review_status = 'forwarded_for_clinical_review'),
    (SELECT count(*)::INTEGER FROM hcn_coordination_plans WHERE organization_id = p_organization_id AND status = 'active'),
    (SELECT count(*)::INTEGER FROM hcn_clinical_request_events e JOIN hcn_clinical_requests r ON r.id = e.request_id
       WHERE r.organization_id = p_organization_id AND e.event_type = 'reminder_sent' AND e.created_at > now() - interval '30 days');
END;
$$;
REVOKE ALL ON FUNCTION public.hcn_get_clinical_coordination_report(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_clinical_coordination_report(UUID) TO authenticated;
