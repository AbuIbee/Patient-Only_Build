-- HCN-CLINICAL-MASTER-002 RELEASE RESOLUTION Step 2 -- scheduler
-- infrastructure + a real exclusion-logic fix found while addressing
-- it.
--
-- pg_cron and pg_net are both Supabase-shipped, officially supported
-- extensions (confirmed directly against this project's own disposable
-- stack: both already report an installed_version in
-- pg_available_extensions) -- "existing approved Supabase
-- infrastructure," not a new dependency. Enabling the EXTENSION here
-- is inert on its own (it adds the `cron`/`net` schemas and their
-- functions; it does not schedule or run anything by itself) -- safe
-- to ship in a tracked migration the same way pgcrypto etc. already
-- are elsewhere in this project.
--
-- The actual cron.schedule(...) call that ACTIVATES a recurring job is
-- DELIBERATELY NOT included here, and never will be in a tracked
-- migration -- that is the literal "activate a new production job"
-- action the continuation directive requires separate deployment
-- authorization for. It is issued directly (see
-- docs/acceptance/HCN-CLINICAL-MASTER-002/SCHEDULER_RUNBOOK.md) against
-- whichever environment a human with that authorization chooses, and
-- was exercised directly against this LOCAL disposable stack only to
-- produce the evidence this step requires.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- BUG FOUND WHILE ADDRESSING THE RELEASE-RESOLUTION DIRECTIVE'S OWN
-- "revoked... requests are excluded" requirement: hcn_revoke_clinical_
-- request_access() (SEC-001 migration) only ever revoked the
-- request's TOKENS/SESSIONS -- it never touched hcn_clinical_requests
-- .status at all, so a request whose external access had been
-- explicitly revoked could still sit at status='sent' past its
-- deadline and would have been (incorrectly) picked up as "due" by
-- the reminder processor. There is no point reminding a provider
-- about access that has been revoked. Excluded via the request's own
-- event history (the 'revoked' event hcn_revoke_clinical_request_access
-- already records) rather than introducing a new status value or
-- touching that function's own behavior.
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
      SELECT EXISTS (
        SELECT 1 FROM hcn_clinical_request_events e WHERE e.request_id = r.id AND e.event_type = 'revoked'
      ) INTO v_access_revoked;
      IF v_access_revoked THEN
        out_request_id := r.id; processed := false; detail := 'access to this request has been revoked -- no reminder is sent';
        RETURN NEXT;
        CONTINUE;
      END IF;

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
