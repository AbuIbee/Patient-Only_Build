-- HCN Patient Information: publish approved, scoped updates for authorized portal refresh.
-- Existing patient-specific SELECT RLS remains authoritative. No new role grants.
DO $pub$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'hcn_patient_information'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hcn_patient_information;
  END IF;
END
$pub$;
