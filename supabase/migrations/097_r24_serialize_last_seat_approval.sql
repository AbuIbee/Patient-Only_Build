-- Codex MMA-CODEX-09 — "simultaneous last-seat approvals."
--
-- CONFIRMED DEFECT: director_approve_application() locks the
-- professional_applications row being approved (FOR UPDATE), but that
-- only serializes two callers approving the SAME application. Two
-- DIFFERENT pending applications for the SAME organization's last
-- remaining licensed seat are two different rows — the lock does
-- nothing to serialize them against each other. The seat-capacity
-- check itself (`SELECT licensed_seats ...` / `SELECT count(*) ...`)
-- took no lock at all, so both concurrent approvals could read the
-- count as one-under-capacity before either INSERT committed,
-- resulting in more active members than the organization's licensed
-- seats permit.
--
-- Fix: lock the organization's own organization_licenses row before
-- checking capacity. Whichever approval starts first holds that lock
-- until it commits its new membership; the second approval blocks,
-- then re-counts against the now-current (one higher) active count
-- and correctly fails if that was genuinely the last seat.
CREATE OR REPLACE FUNCTION public.director_approve_application(p_application_id UUID) RETURNS professional_applications AS $$
DECLARE
  v_app professional_applications;
  v_seats INTEGER;
  v_active_count INTEGER;
BEGIN
  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.requested_office = 'director' THEN
    RAISE EXCEPTION 'Director applications are approved by the Platform Owner, not an organization director';
  END IF;
  IF v_app.status NOT IN ('pending_review', 'resubmitted') THEN RAISE EXCEPTION 'This application is not open for approval'; END IF;
  IF NOT public.is_active_org_director(v_app.target_organization_id) THEN
    RAISE EXCEPTION 'Only an active director of the target organization may approve this application';
  END IF;
  IF v_app.applicant_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own application';
  END IF;
  IF v_app.credential_verification_status != 'independently_verified' THEN
    RAISE EXCEPTION 'This application cannot be approved until its credential has been independently verified (current status: %). Call record_credential_verification() first.', v_app.credential_verification_status;
  END IF;

  PERFORM licensed_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id FOR UPDATE;
  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = v_app.target_organization_id;
  IF v_seats IS NOT NULL THEN
    SELECT count(*) INTO v_active_count FROM organization_memberships WHERE organization_id = v_app.target_organization_id AND status = 'active';
    IF v_active_count >= v_seats THEN
      RAISE EXCEPTION 'This organization has no remaining licensed seats. Increase licensed seats before approving this application.';
    END IF;
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_app.target_organization_id, v_app.applicant_user_id, v_app.requested_office, 'active', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role, status = 'active', updated_at = now();

  UPDATE professional_applications SET
    status = 'approved', approved_office = v_app.requested_office, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id RETURNING * INTO v_app;

  INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status)
  VALUES (p_application_id, 'approved', auth.uid(), 'director', 'pending_review', 'approved');

  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.director_approve_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.director_approve_application(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.director_approve_application(UUID) FROM anon;
