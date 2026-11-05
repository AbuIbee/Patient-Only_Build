-- Split free-text home-report details from team-shared structured fields.
-- This permits invoker-security views and column-level grants: assigned care
-- team members can read structured reports, while only the patient can read
-- notes and answers until recipient-level sharing is explicitly selected.
BEGIN;

CREATE TABLE IF NOT EXISTS public.care_partner_log_private_details (
  log_id uuid PRIMARY KEY REFERENCES public.care_partner_logs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  notes text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.care_partner_log_private_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_partner_log_private_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.care_partner_log_private_details TO authenticated;
GRANT ALL ON public.care_partner_log_private_details TO service_role;

DROP POLICY IF EXISTS "Patient reads own private home report details" ON public.care_partner_log_private_details;
DROP POLICY IF EXISTS "Patient inserts own private home report details" ON public.care_partner_log_private_details;
DROP POLICY IF EXISTS "Patient updates own private home report details" ON public.care_partner_log_private_details;
DROP POLICY IF EXISTS "Patient deletes own private home report details" ON public.care_partner_log_private_details;

CREATE POLICY "Patient reads own private home report details"
ON public.care_partner_log_private_details FOR SELECT TO authenticated
USING (patient_id = (select auth.uid()));
CREATE POLICY "Patient inserts own private home report details"
ON public.care_partner_log_private_details FOR INSERT TO authenticated
WITH CHECK (patient_id = (select auth.uid()));
CREATE POLICY "Patient updates own private home report details"
ON public.care_partner_log_private_details FOR UPDATE TO authenticated
USING (patient_id = (select auth.uid()))
WITH CHECK (patient_id = (select auth.uid()));
CREATE POLICY "Patient deletes own private home report details"
ON public.care_partner_log_private_details FOR DELETE TO authenticated
USING (patient_id = (select auth.uid()));

-- Preserve existing private content before restricting the original columns.
INSERT INTO public.care_partner_log_private_details (log_id, patient_id, notes, answers)
SELECT id, patient_id, notes, coalesce(answers, '{}'::jsonb)
FROM public.care_partner_logs
WHERE notes IS NOT NULL OR coalesce(answers, '{}'::jsonb) <> '{}'::jsonb
ON CONFLICT (log_id) DO NOTHING;

UPDATE public.care_partner_logs
SET notes = NULL, answers = '{}'::jsonb
WHERE notes IS NOT NULL OR coalesce(answers, '{}'::jsonb) <> '{}'::jsonb;

-- Keep legacy patient inserts/updates working while ensuring free-text is
-- always stored in the patient-only table, never in the team-readable row.
CREATE OR REPLACE FUNCTION private.sync_care_partner_log_private_details()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.care_partner_log_private_details (log_id, patient_id, notes, answers)
  VALUES (NEW.id, NEW.patient_id, NEW.notes, coalesce(NEW.answers, '{}'::jsonb))
  ON CONFLICT (log_id) DO UPDATE
    SET patient_id = EXCLUDED.patient_id,
        notes = EXCLUDED.notes,
        answers = EXCLUDED.answers,
        updated_at = now();

  NEW.notes := NULL;
  NEW.answers := '{}'::jsonb;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_care_partner_log_private_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sync_care_partner_log_private_details() TO authenticated, service_role;

DROP TRIGGER IF EXISTS sync_care_partner_log_private_details ON public.care_partner_logs;
CREATE TRIGGER sync_care_partner_log_private_details
BEFORE INSERT OR UPDATE OF patient_id, notes, answers
ON public.care_partner_logs
FOR EACH ROW EXECUTE FUNCTION private.sync_care_partner_log_private_details();

-- Remove broad table SELECT and restore only the structured columns needed by
-- authenticated care-team views. INSERT/UPDATE stay patient-RLS-protected.
REVOKE ALL ON TABLE public.care_partner_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, patient_id, report_date, submitted_at, mood, meals, hydration,
              medications, mobility, exercise, sleep_quality, pain_level)
  ON public.care_partner_logs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.care_partner_logs TO authenticated;
GRANT ALL ON TABLE public.care_partner_logs TO service_role;

DROP POLICY IF EXISTS "HCN authorized care team reads home reports" ON public.care_partner_logs;
CREATE POLICY "HCN authorized care team reads structured home reports"
ON public.care_partner_logs FOR SELECT TO authenticated
USING (private.hcn_can_read_care_partner_notes(patient_id));

CREATE OR REPLACE VIEW public.patient_home_reports_self
WITH (security_invoker = true, security_barrier = true)
AS
SELECT l.id, l.patient_id, l.report_date, l.submitted_at, l.mood, l.meals,
       l.hydration, l.medications, l.mobility, l.exercise, l.sleep_quality,
       l.pain_level, d.notes, d.answers
FROM public.care_partner_logs l
LEFT JOIN public.care_partner_log_private_details d
  ON d.log_id = l.id AND d.patient_id = l.patient_id
WHERE l.patient_id = (select auth.uid());

CREATE OR REPLACE VIEW public.care_team_home_reports
WITH (security_invoker = true, security_barrier = true)
AS
SELECT id, patient_id, report_date, submitted_at, mood, meals, hydration,
       medications, mobility, exercise, sleep_quality, pain_level
FROM public.care_partner_logs
WHERE private.hcn_can_read_care_partner_notes(patient_id);

REVOKE ALL ON public.patient_home_reports_self, public.care_team_home_reports
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_home_reports_self, public.care_team_home_reports
  TO authenticated;

COMMIT;
