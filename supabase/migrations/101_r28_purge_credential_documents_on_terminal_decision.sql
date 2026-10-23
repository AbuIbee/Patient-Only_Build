-- Codex MMA-CODEX-16 — Document Storage hygiene gap (b), confirmed live:
-- professional-credentials' uploaded documents (identity/license scans,
-- potentially sensitive) had NO cleanup path anywhere in the codebase.
-- professional_application_documents.application_id has ON DELETE
-- CASCADE, but applications are never actually DELETEd — they are
-- status-transitioned — so that cascade never fires. A rejected or
-- withdrawn application's credential documents stayed in storage
-- indefinitely with no code path that ever removed them.
--
-- Fix, part 1 (this migration): reject_application()/withdraw_application()
-- now purge the document METADATA rows for this application once it
-- reaches a terminal (rejected/withdrawn) state, inside the same
-- transaction as the status change. The durable audit trail is
-- professional_application_events (already append-only, unaffected by
-- this) — it records that a document existed and was reviewed/rejected,
-- not the document's bytes, so purging the metadata row does not lose
-- any audit information this system already relies on elsewhere.
--
-- Fix, part 2 (client-side, professionalApplicationService.ts):
-- `DELETE FROM storage.objects` directly from SQL is blocked by Supabase
-- Storage's own protective trigger ("Direct deletion from storage
-- tables is not allowed. Use the Storage API instead.") even from a
-- SECURITY DEFINER function — confirmed live, not assumed. The actual
-- object removal is therefore done via supabase.storage...remove() in
-- the client service, called with the storage paths fetched BEFORE this
-- RPC (which deletes their metadata row), immediately after this RPC
-- succeeds — the same established pattern already used elsewhere in
-- this codebase (patient-documents/patient-media's own .remove() calls).
CREATE OR REPLACE FUNCTION public.withdraw_application(p_application_id UUID) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.applicant_user_id <> auth.uid() THEN RAISE EXCEPTION 'You may only withdraw your own application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'info_required', 'resubmitted') THEN
    RAISE EXCEPTION 'This application can no longer be withdrawn';
  END IF;

  UPDATE professional_applications SET status = 'withdrawn', updated_at = now() WHERE id = p_application_id RETURNING * INTO v_app;
  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status)
  VALUES (p_application_id, 'withdrawn', auth.uid(), 'applicant', v_app.status, 'withdrawn');

  DELETE FROM professional_application_documents WHERE application_id = p_application_id;

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.withdraw_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_application(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_application(p_application_id UUID, p_rejection_reason TEXT) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_actor_role TEXT;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.status NOT IN ('pending_review', 'info_required', 'resubmitted') THEN RAISE EXCEPTION 'This application cannot be rejected from its current state'; END IF;

  IF v_app.requested_office = 'director' THEN
    IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Only the Platform Owner may reject a Director application'; END IF;
    v_actor_role := 'platform_owner';
  ELSE
    IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
      RAISE EXCEPTION 'Only an active director of the target organization may reject this application';
    END IF;
    v_actor_role := 'director';
  END IF;

  UPDATE professional_applications SET
    status = 'rejected', rejection_reason = p_rejection_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
  VALUES (p_application_id, 'rejected', auth.uid(), v_actor_role, v_app.status, 'rejected', p_rejection_reason);

  DELETE FROM professional_application_documents WHERE application_id = p_application_id;

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.reject_application(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_application(UUID, TEXT) TO authenticated;
