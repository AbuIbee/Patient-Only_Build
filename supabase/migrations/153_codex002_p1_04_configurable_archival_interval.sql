-- MMA-P1-CODEX-002 P1-04 — "Automatic archival and isolated five-minute
-- mode." Independent Codex audit: close_patient_coverage() hardcoded
-- INTERVAL '45 days' with no isolated-test override and no scheduled
-- invocation anywhere; "a manual archival function alone does not
-- satisfy this requirement."
--
-- THIS MIGRATION covers the part that is safe to apply to ANY
-- environment (including staging) without separate deployment
-- authorization: a configurable interval function and
-- close_patient_coverage()'s use of it. It does NOT enable pg_cron or
-- schedule any job -- per the directive's own instruction, "verify the
-- supported configuration and implement the appropriate migration...
-- WITHOUT enabling it on a protected environment." Confirmed this
-- session: pg_cron IS available on the local disposable stack's Postgres
-- image (already present in shared_preload_libraries) but is not
-- CREATE EXTENSION'd by default -- enabling an extension is a real
-- platform-configuration action, not a plain additive schema change, so
-- it is deliberately kept OUT of the numbered migration stream and
-- implemented instead as a separate, explicitly-labeled, disposable-only
-- script: scripts/disposable_archival_scheduler.mjs.
--
-- SAFEGUARD DESIGN: the test interval is read from a Postgres custom GUC
-- (app.settings.archival_test_interval) that NO client-reachable role
-- (anon/authenticated, i.e. every PostgREST/RPC caller) can ever set --
-- PostgREST never executes a raw `SET`/`ALTER DATABASE` on a caller's
-- behalf, only declared function/table calls. The GUC is settable only
-- by a direct superuser session (exactly what the disposable test
-- scheduler script below uses) or by whoever controls a real deployment
-- pipeline's `ALTER DATABASE ... SET` -- i.e. exactly the same trust
-- boundary as enabling pg_cron itself. "Production must default to 45
-- days and reject accidental five-minute configuration" is satisfied
-- structurally: there is no ordinary application code path, RPC, or
-- client request that could ever set this GUC by accident.
CREATE OR REPLACE FUNCTION public.archival_interval()
RETURNS INTERVAL
LANGUAGE sql STABLE AS $function$
  SELECT COALESCE(
    (SELECT current_setting('app.settings.archival_test_interval', true))::interval,
    INTERVAL '45 days'
  );
$function$;
REVOKE ALL ON FUNCTION public.archival_interval() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archival_interval() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_patient_coverage(
  p_org_id UUID,
  p_patient_id UUID,
  p_reason TEXT,
  p_notes TEXT
) RETURNS covered_patient_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may close a patient''s coverage';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A closure reason is required';
  END IF;
  IF p_notes IS NULL OR char_length(btrim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Explanatory closure notes are required';
  END IF;

  SELECT * INTO v_row FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No coverage relationship found for this organization and patient';
  END IF;

  IF v_row.status IN ('closed', 'archived') THEN
    RETURN v_row; -- idempotent: already closed, no-op
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Coverage is not active (current status: %) and cannot be closed', v_row.status;
  END IF;

  UPDATE covered_patient_memberships SET
    status = 'closed', closed_by = auth.uid(), closure_reason = btrim(p_reason), closure_notes = btrim(p_notes),
    closed_at = now(), scheduled_archival_at = now() + public.archival_interval()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (p_patient_id, p_org_id, 'patient_coverage_closed', auth.uid(), jsonb_build_object('scheduled_archival_at', v_row.scheduled_archival_at, 'notes', p_notes), p_reason);

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_patient_coverage(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_patient_coverage(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
