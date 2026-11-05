-- Enable authorized patient/caregiver pages to receive live updates.
-- Realtime applies each table's RLS checks before delivering Postgres Changes.
BEGIN;

DO $migration$
DECLARE
  table_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required Supabase publication supabase_realtime is missing';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'mood_entries',
    'care_partner_checkins',
    'medications',
    'medication_logs',
    'care_partner_notes',
    'patient_notes'
  ]
  LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Required patient-care table public.% is missing', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE pg_catalog.format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        table_name
      );
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
