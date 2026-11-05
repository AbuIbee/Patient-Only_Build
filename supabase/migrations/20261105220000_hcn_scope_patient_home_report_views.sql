-- Keep free-text patient home-report notes visible only to the patient
-- until recipient-level sharing is implemented. Authorized staff receive a
-- structured, note-free view through the current assignment authorization.
BEGIN;

DROP POLICY IF EXISTS "HCN authorized care team reads home reports" ON public.care_partner_logs;
REVOKE SELECT ON TABLE public.care_partner_logs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.patient_home_reports_self
WITH (security_barrier = true)
AS
SELECT id, patient_id, report_date, submitted_at, mood, meals, hydration,
       medications, mobility, exercise, sleep_quality, pain_level, notes, answers
FROM public.care_partner_logs
WHERE patient_id = (select auth.uid());

CREATE OR REPLACE VIEW public.care_team_home_reports
WITH (security_barrier = true)
AS
SELECT id, patient_id, report_date, submitted_at, mood, meals, hydration,
       medications, mobility, exercise, sleep_quality, pain_level
FROM public.care_partner_logs
WHERE public.hcn_can_read_care_partner_notes(patient_id);

REVOKE ALL ON public.patient_home_reports_self, public.care_team_home_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_home_reports_self, public.care_team_home_reports TO authenticated;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'care_partner_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.care_partner_logs;
  END IF;
END
$migration$;

COMMIT;
