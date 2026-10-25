-- MMA-ENT-CAREGIVER-MASTER-003, D08 (P1) — "Incidents and HELP."
-- Independent runtime audit (MMA_ENT_CAREGIVER_MASTER_002_RUNTIME_AUDIT.md,
-- finding D08): the Alerts & Incidents form only ever had patient/type/
-- description; the created incident always defaulted to low severity
-- (file_incident_report()'s own p_severity parameter already existed
-- server-side but the UI never offered a way to choose it), there was
-- no way to record WHEN an incident occurred (as opposed to when it was
-- typed up, which can legitimately be later), and no attachment
-- mechanism existed for an incident at all. Correction/escalation
-- (resolve_incident_report(), director-only) and acknowledgment already
-- exist and are already reachable from OrganizationDirectorDashboard's
-- own IncidentsView -- this migration does not touch that path.
--
-- §1 — file_incident_report() gains an optional p_occurred_at, falling
-- back to now() exactly as before when omitted (no existing caller
-- breaks), rejecting a future timestamp (an incident cannot be
-- reported as occurring before it happened).
CREATE OR REPLACE FUNCTION public.file_incident_report(
  p_org_id UUID, p_patient_id UUID, p_incident_type TEXT, p_description TEXT, p_severity TEXT DEFAULT 'low',
  p_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS incident_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row incident_reports;
  v_notify TIMESTAMP WITH TIME ZONE := NULL;
  v_occurred_at TIMESTAMP WITH TIME ZONE := COALESCE(p_occurred_at, now());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  IF v_occurred_at > now() THEN
    RAISE EXCEPTION 'An incident cannot be reported as occurring in the future';
  END IF;
  IF p_severity IN ('high', 'critical') THEN
    v_notify := now();
  END IF;
  INSERT INTO incident_reports (organization_id, patient_id, reported_by, incident_type, description, severity, occurred_at, supervisor_notified_at)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_incident_type, p_description, p_severity, v_occurred_at, v_notify)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.file_incident_report(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_incident_report(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated;
-- The old 5-argument overload (no occurred_at) is superseded -- drop it
-- so PostgREST's schema cache has exactly one file_incident_report to
-- resolve (an ambiguous overload set is a real PostgREST footgun).
DROP FUNCTION IF EXISTS public.file_incident_report(UUID, UUID, TEXT, TEXT, TEXT);

-- §2 — incident_attachments: private-Storage metadata table, following
-- this engagement's own established pattern (patient_document_uploads,
-- professional_application_documents) -- RLS-governed directly, no RPC
-- wrapper needed. Visibility mirrors incident_reports' own three SELECT
-- policies exactly (migration 068) rather than relying on cross-table
-- RLS propagation, so a change to those policies can never silently
-- widen or narrow attachment visibility without an equivalent, explicit
-- change here.
CREATE TABLE IF NOT EXISTS incident_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   UUID NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL UNIQUE,
  file_name     TEXT NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incident_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Reporter can view attachments on their own incident reports"
    ON incident_attachments FOR SELECT
    USING (EXISTS (SELECT 1 FROM incident_reports ir WHERE ir.id = incident_id AND ir.reported_by = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned staff can view attachments on incidents for their patients"
    ON incident_attachments FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM incident_reports ir
      JOIN staff_patient_assignments spa ON spa.organization_id = ir.organization_id AND spa.patient_id = ir.patient_id
      WHERE ir.id = incident_id AND spa.user_id = auth.uid() AND spa.is_active = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view attachments on incidents in their own org"
    ON incident_attachments FOR SELECT
    USING (EXISTS (SELECT 1 FROM incident_reports ir WHERE ir.id = incident_id AND public.is_active_org_director(ir.organization_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only the original reporter may attach a file to their own incident
-- report -- re-derived server-side, never trusted from the client.
DO $$ BEGIN
  CREATE POLICY "Reporter can attach a file to their own incident report"
    ON incident_attachments FOR INSERT
    WITH CHECK (
      uploaded_by = auth.uid()
      AND EXISTS (SELECT 1 FROM incident_reports ir WHERE ir.id = incident_id AND ir.reported_by = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON incident_attachments FROM PUBLIC;
GRANT SELECT, INSERT ON incident_attachments TO authenticated;
REVOKE ALL ON incident_attachments FROM anon;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('incident-attachments', 'incident-attachments', false, 20971520,
  ARRAY['image/*', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Reporter can upload their own incident attachment objects"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'incident-attachments'
      AND EXISTS (SELECT 1 FROM incident_reports ir WHERE ir.id::text = (storage.foldername(name))[1] AND ir.reported_by = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone who can see the incident can read its attachment objects"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'incident-attachments'
      AND EXISTS (
        SELECT 1 FROM incident_reports ir
        WHERE ir.id::text = (storage.foldername(name))[1]
          AND (
            ir.reported_by = auth.uid()
            OR public.is_active_org_director(ir.organization_id)
            OR EXISTS (SELECT 1 FROM staff_patient_assignments spa WHERE spa.organization_id = ir.organization_id AND spa.patient_id = ir.patient_id AND spa.user_id = auth.uid() AND spa.is_active = true)
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
