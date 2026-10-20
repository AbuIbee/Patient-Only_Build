-- ROUND 5 — ENTERPRISE CAREGIVER PORTAL: new backend subsystems for the
-- Professional Caregiver Work Tools (W01-W14), Homepage items with no
-- prior backend (H11-H13, H17), and Navigation items N08-N10 that
-- depend on them. These genuinely did not exist before this round —
-- no prior table, RPC, or UI touched visit tracking, shift handoffs,
-- incident reports, scope-of-practice escalation, or caregiver
-- credentials/training.
--
-- All new tables are scoped to an organization + a staff member's own
-- active staff_patient_assignments row for that patient — the same
-- authorization source migration 067 just extended base clinical
-- tables to recognize. A director may view (never author on behalf of
-- someone else) everything within their own organization, per
-- "an organization director must have authority within their own
-- organization only" (established pattern, migration 035).

-- ============================================================================
-- §1 — caregiver_visits (W01 Visit Start/End, H06 Today's Schedule,
-- H07 Current/Next Visit, H13 Visit Verification/Clock-In & Out,
-- W11 Calendar & Appointments, N03 My Schedule, N10 Visits & Time
-- Records).
--
-- EVV (Electronic Visit Verification) fields are present but OPTIONAL
-- and NEVER asserted as a certified EVV/Medicaid/Medicare compliance
-- claim anywhere in this schema or its RPCs — "applicable payer/state
-- EVV validation only when required... no blanket Medicaid/Medicare
-- certification claims" (locked requirement W01/H13). evv_required is
-- an organization-configured flag an owner sets per deployment, not a
-- default.
-- ============================================================================
CREATE TABLE IF NOT EXISTS caregiver_visits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_start   TIMESTAMP WITH TIME ZONE,
  scheduled_end     TIMESTAMP WITH TIME ZONE,
  actual_start      TIMESTAMP WITH TIME ZONE,
  actual_end        TIMESTAMP WITH TIME ZONE,
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'missed', 'canceled')),
  visit_notes       TEXT,
  evv_required      BOOLEAN NOT NULL DEFAULT false,
  evv_latitude      DOUBLE PRECISION,
  evv_longitude     DOUBLE PRECISION,
  evv_offline_exception BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE caregiver_visits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Caregivers can view their own visits"
    ON caregiver_visits FOR SELECT
    USING (caregiver_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view all visits in their own org"
    ON caregiver_visits FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No direct client INSERT/UPDATE — RPCs below only, so every write is
-- re-validated against the caller's own active assignment, never a
-- bare client-supplied caregiver_id/patient_id pair.

CREATE OR REPLACE FUNCTION public.schedule_caregiver_visit(
  p_org_id UUID, p_patient_id UUID, p_scheduled_start TIMESTAMP WITH TIME ZONE, p_scheduled_end TIMESTAMP WITH TIME ZONE
) RETURNS caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an organization director may schedule a visit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND is_active = true) THEN
    RAISE EXCEPTION 'No active staff assignment exists for this patient in this organization';
  END IF;
  -- Scheduling assigns to whichever caregiver is passed; for the first
  -- cut this schedules the calling director's own org's single active
  -- caregiver assignment for this patient — ambiguous multi-caregiver
  -- scheduling is an OPEN OWNER DECISION, not invented here.
  INSERT INTO caregiver_visits (organization_id, patient_id, caregiver_id, scheduled_start, scheduled_end)
  SELECT p_org_id, p_patient_id, spa.user_id, p_scheduled_start, p_scheduled_end
  FROM staff_patient_assignments spa
  WHERE spa.organization_id = p_org_id AND spa.patient_id = p_patient_id AND spa.is_active = true AND spa.org_role = 'caregiver'
  LIMIT 1
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active caregiver assignment exists for this patient to schedule against';
  END IF;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.schedule_caregiver_visit(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_caregiver_visit(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_caregiver_visit(p_visit_id UUID, p_latitude DOUBLE PRECISION DEFAULT NULL, p_longitude DOUBLE PRECISION DEFAULT NULL)
RETURNS caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF v_row.status NOT IN ('scheduled', 'missed') THEN RAISE EXCEPTION 'This visit cannot be started from its current status'; END IF;
  UPDATE caregiver_visits SET status = 'in_progress', actual_start = now(), evv_latitude = p_latitude, evv_longitude = p_longitude, updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.start_caregiver_visit(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_caregiver_visit(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_caregiver_visit(p_visit_id UUID, p_visit_notes TEXT DEFAULT NULL)
RETURNS caregiver_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF v_row.status != 'in_progress' THEN RAISE EXCEPTION 'This visit is not currently in progress'; END IF;
  UPDATE caregiver_visits SET status = 'completed', actual_end = now(), visit_notes = COALESCE(p_visit_notes, visit_notes), updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.end_caregiver_visit(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_caregiver_visit(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_visits(p_patient_id UUID DEFAULT NULL)
RETURNS SETOF caregiver_visits
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT * FROM caregiver_visits
  WHERE caregiver_id = auth.uid() AND (p_patient_id IS NULL OR patient_id = p_patient_id)
  ORDER BY COALESCE(scheduled_start, created_at) DESC;
$function$;
REVOKE ALL ON FUNCTION public.get_my_visits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_visits(UUID) TO authenticated;

-- ============================================================================
-- §2 — shift_handoffs + shift_handoff_acknowledgments (H11 Shift
-- Handoff, W06 End-of-Shift Handoff, N08 Shift Handoffs).
-- ============================================================================
CREATE TABLE IF NOT EXISTS shift_handoffs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES profiles(id),
  summary           TEXT NOT NULL,
  pending_tasks     TEXT,
  concerns          TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE shift_handoffs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS shift_handoff_acknowledgments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id        UUID NOT NULL REFERENCES shift_handoffs(id) ON DELETE CASCADE,
  acknowledged_by   UUID NOT NULL REFERENCES profiles(id),
  acknowledged_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (handoff_id, acknowledged_by)
);
ALTER TABLE shift_handoff_acknowledgments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Assigned staff can view shift handoffs for their patients"
    ON shift_handoffs FOR SELECT
    USING (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.organization_id = shift_handoffs.organization_id AND spa.patient_id = shift_handoffs.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view all shift handoffs in their own org"
    ON shift_handoffs FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "A caregiver can view acknowledgments on handoffs they can see"
    ON shift_handoff_acknowledgments FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM shift_handoffs sh
      JOIN staff_patient_assignments spa ON spa.organization_id = sh.organization_id AND spa.patient_id = sh.patient_id
      WHERE sh.id = shift_handoff_acknowledgments.handoff_id AND spa.user_id = auth.uid() AND spa.is_active = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.record_shift_handoff(p_org_id UUID, p_patient_id UUID, p_summary TEXT, p_pending_tasks TEXT DEFAULT NULL, p_concerns TEXT DEFAULT NULL)
RETURNS shift_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row shift_handoffs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF btrim(COALESCE(p_summary, '')) = '' THEN RAISE EXCEPTION 'A handoff summary is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  INSERT INTO shift_handoffs (organization_id, patient_id, author_id, summary, pending_tasks, concerns)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_summary, p_pending_tasks, p_concerns)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_shift_handoff(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_shift_handoff(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_shift_handoff(p_handoff_id UUID)
RETURNS shift_handoff_acknowledgments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_handoff shift_handoffs;
  v_row shift_handoff_acknowledgments;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_handoff FROM shift_handoffs WHERE id = p_handoff_id;
  IF v_handoff.id IS NULL THEN RAISE EXCEPTION 'No such handoff'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = v_handoff.organization_id AND patient_id = v_handoff.patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  INSERT INTO shift_handoff_acknowledgments (handoff_id, acknowledged_by)
  VALUES (p_handoff_id, auth.uid())
  ON CONFLICT (handoff_id, acknowledged_by) DO UPDATE SET acknowledged_at = shift_handoff_acknowledgments.acknowledged_at
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.acknowledge_shift_handoff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_shift_handoff(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_patient_shift_handoffs(p_org_id UUID, p_patient_id UUID)
RETURNS TABLE (id UUID, author_id UUID, author_first_name TEXT, author_last_name TEXT, summary TEXT, pending_tasks TEXT, concerns TEXT, created_at TIMESTAMP WITH TIME ZONE, acknowledged_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
     AND NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'You are not authorized for this patient in this organization';
  END IF;
  RETURN QUERY
  SELECT sh.id, sh.author_id, pr.first_name, pr.last_name, sh.summary, sh.pending_tasks, sh.concerns, sh.created_at,
         (SELECT count(*) FROM shift_handoff_acknowledgments a WHERE a.handoff_id = sh.id)
  FROM shift_handoffs sh
  JOIN profiles pr ON pr.id = sh.author_id
  WHERE sh.organization_id = p_org_id AND sh.patient_id = p_patient_id
  ORDER BY sh.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_patient_shift_handoffs(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_shift_handoffs(UUID, UUID) TO authenticated;

-- ============================================================================
-- §3 — incident_reports (H12 Incident Reporting, W07 Incident Report,
-- N09 Alerts & Incidents, P18 Incident History).
-- ============================================================================
CREATE TABLE IF NOT EXISTS incident_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reported_by        UUID NOT NULL REFERENCES profiles(id),
  incident_type      TEXT NOT NULL CHECK (incident_type IN ('fall', 'injury', 'behavioral', 'medication_concern', 'safety_event', 'other')),
  description        TEXT NOT NULL,
  severity           TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  occurred_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolution_status  TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'under_review', 'resolved')),
  resolution_notes   TEXT,
  supervisor_notified_at TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Reporter can view their own incident reports"
    ON incident_reports FOR SELECT
    USING (reported_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned staff can view incident reports for their patients"
    ON incident_reports FOR SELECT
    USING (EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.organization_id = incident_reports.organization_id AND spa.patient_id = incident_reports.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view and resolve incident reports in their own org"
    ON incident_reports FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.file_incident_report(
  p_org_id UUID, p_patient_id UUID, p_incident_type TEXT, p_description TEXT, p_severity TEXT DEFAULT 'low'
) RETURNS incident_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row incident_reports;
  v_notify TIMESTAMP WITH TIME ZONE := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  -- "Supervisor escalation" — this records a timestamp marking the
  -- incident as flagged for director attention for high/critical
  -- severity; it is NOT a delivery guarantee (no push/SMS/email is
  -- sent from here) — "any delivery status beyond recorded in app must
  -- be backed by provider proof."
  IF p_severity IN ('high', 'critical') THEN
    v_notify := now();
  END IF;
  INSERT INTO incident_reports (organization_id, patient_id, reported_by, incident_type, description, severity, supervisor_notified_at)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_incident_type, p_description, p_severity, v_notify)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.file_incident_report(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_incident_report(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_incident_report(p_incident_id UUID, p_resolution_status TEXT, p_resolution_notes TEXT DEFAULT NULL)
RETURNS incident_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row incident_reports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM incident_reports WHERE id = p_incident_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such incident report'; END IF;
  IF NOT public.is_active_org_director(v_row.organization_id) THEN
    RAISE EXCEPTION 'Only an organization director may resolve an incident report';
  END IF;
  IF p_resolution_status NOT IN ('open', 'under_review', 'resolved') THEN
    RAISE EXCEPTION 'Invalid resolution status: %', p_resolution_status;
  END IF;
  UPDATE incident_reports SET resolution_status = p_resolution_status, resolution_notes = p_resolution_notes, updated_at = now()
  WHERE id = p_incident_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.resolve_incident_report(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_incident_report(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- §4 — scope_concerns (W08 Report Scope Concern, W09 Supervisor
-- Contact's escalation target).
-- ============================================================================
CREATE TABLE IF NOT EXISTS scope_concerns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reported_by       UUID NOT NULL REFERENCES profiles(id),
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE scope_concerns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Reporter can view their own scope concerns"
    ON scope_concerns FOR SELECT
    USING (reported_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view scope concerns in their own org"
    ON scope_concerns FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.report_scope_concern(p_org_id UUID, p_patient_id UUID, p_description TEXT)
RETURNS scope_concerns
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row scope_concerns;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF btrim(COALESCE(p_description, '')) = '' THEN RAISE EXCEPTION 'A description is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  INSERT INTO scope_concerns (organization_id, patient_id, reported_by, description)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_description)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.report_scope_concern(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_scope_concern(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- §5 — caregiver_credentials (H17 Credentials & Training, O06
-- Credentials).
-- ============================================================================
CREATE TABLE IF NOT EXISTS caregiver_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  credential_name   TEXT NOT NULL,
  issued_at         DATE,
  expires_at        DATE,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired')),
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE caregiver_credentials ENABLE ROW LEVEL SECURITY;

-- "without exposing other employees' sensitive personnel data" — a
-- caregiver sees only their own credentials; a director sees their
-- org's for legitimate training-compliance oversight.
DO $$ BEGIN
  CREATE POLICY "A caregiver can view their own credentials"
    ON caregiver_credentials FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view credentials within their own org"
    ON caregiver_credentials FOR SELECT
    USING (organization_id IS NOT NULL AND public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.get_my_credentials()
RETURNS SETOF caregiver_credentials
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT * FROM caregiver_credentials WHERE user_id = auth.uid() ORDER BY expires_at ASC NULLS LAST;
$function$;
REVOKE ALL ON FUNCTION public.get_my_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_credentials() TO authenticated;

-- A director records a credential for one of their OWN org's staff
-- members — never self-service (a caregiver cannot assert their own
-- certification exists), mirroring "credentials/training" being
-- director-managed organizational data, not a self-reported field.
CREATE OR REPLACE FUNCTION public.record_staff_credential(
  p_org_id UUID, p_user_id UUID, p_credential_name TEXT, p_issued_at DATE DEFAULT NULL, p_expires_at DATE DEFAULT NULL
) RETURNS caregiver_credentials
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row caregiver_credentials;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an organization director may record a staff credential';
  END IF;
  IF btrim(COALESCE(p_credential_name, '')) = '' THEN RAISE EXCEPTION 'A credential name is required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'That account is not an active member of this organization';
  END IF;
  v_status := CASE
    WHEN p_expires_at IS NULL THEN 'active'
    WHEN p_expires_at < CURRENT_DATE THEN 'expired'
    WHEN p_expires_at < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END;
  INSERT INTO caregiver_credentials (user_id, organization_id, credential_name, issued_at, expires_at, status)
  VALUES (p_user_id, p_org_id, p_credential_name, p_issued_at, p_expires_at, v_status)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_staff_credential(UUID, UUID, TEXT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_credential(UUID, UUID, TEXT, DATE, DATE) TO authenticated;

-- A director may read every credential within their own org scoped to
-- a specific member (for the O06/H17 "director oversight" view) — the
-- existing SELECT policy on caregiver_credentials already permits this
-- at the table level (organization_id IS NOT NULL AND
-- is_active_org_director(organization_id)); this RPC exists only to
-- offer a stable, explicit API surface the client service layer calls
-- rather than querying the table directly.
CREATE OR REPLACE FUNCTION public.get_org_staff_credentials(p_org_id UUID)
RETURNS TABLE (id UUID, user_id UUID, first_name TEXT, last_name TEXT, credential_name TEXT, issued_at DATE, expires_at DATE, status TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an organization director may view staff credentials';
  END IF;
  RETURN QUERY
  SELECT cc.id, cc.user_id, pr.first_name, pr.last_name, cc.credential_name, cc.issued_at, cc.expires_at, cc.status
  FROM caregiver_credentials cc
  JOIN profiles pr ON pr.id = cc.user_id
  WHERE cc.organization_id = p_org_id
  ORDER BY cc.expires_at ASC NULLS LAST;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_org_staff_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_staff_credentials(UUID) TO authenticated;
