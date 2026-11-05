-- A patient-entered home report must be readable by the currently authorized
-- care team. Keep writes patient-owned; staff receive read access only through
-- the P1 authorization helper.
BEGIN;

DROP POLICY IF EXISTS "Patients can delete their own old care partner logs" ON public.care_partner_logs;
DROP POLICY IF EXISTS "Patients can insert their own care partner logs" ON public.care_partner_logs;
DROP POLICY IF EXISTS "Patients can update their own care partner logs" ON public.care_partner_logs;
DROP POLICY IF EXISTS "Patients can view their own care partner logs" ON public.care_partner_logs;
DROP POLICY IF EXISTS "HCN patients read their own home reports" ON public.care_partner_logs;
DROP POLICY IF EXISTS "HCN authorized care team reads home reports" ON public.care_partner_logs;
DROP POLICY IF EXISTS "HCN patients create their own home reports" ON public.care_partner_logs;
DROP POLICY IF EXISTS "HCN patients update their own home reports" ON public.care_partner_logs;
DROP POLICY IF EXISTS "HCN patients delete their own home reports" ON public.care_partner_logs;

ALTER TABLE public.care_partner_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.care_partner_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.care_partner_logs TO authenticated;
GRANT ALL ON TABLE public.care_partner_logs TO service_role;

CREATE POLICY "HCN patients read their own home reports"
ON public.care_partner_logs FOR SELECT TO authenticated
USING (patient_id = (select auth.uid()));

CREATE POLICY "HCN authorized care team reads home reports"
ON public.care_partner_logs FOR SELECT TO authenticated
USING (public.hcn_can_read_care_partner_notes(patient_id));

CREATE POLICY "HCN patients create their own home reports"
ON public.care_partner_logs FOR INSERT TO authenticated
WITH CHECK (patient_id = (select auth.uid()));

CREATE POLICY "HCN patients update their own home reports"
ON public.care_partner_logs FOR UPDATE TO authenticated
USING (patient_id = (select auth.uid()))
WITH CHECK (patient_id = (select auth.uid()));

CREATE POLICY "HCN patients delete their own home reports"
ON public.care_partner_logs FOR DELETE TO authenticated
USING (patient_id = (select auth.uid()));

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required Supabase publication supabase_realtime is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'care_partner_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.care_partner_logs';
  END IF;
END
$migration$;

COMMIT;
