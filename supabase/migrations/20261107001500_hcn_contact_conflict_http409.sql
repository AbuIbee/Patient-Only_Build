-- HCN-CARE-INFO-SEARCH-002: PostgREST-safe optimistic-lock conflicts.
-- SQLSTATE 40001 is reserved for serialization failures; when raised deliberately
-- by RPC functions, PostgREST 14 can retry indefinitely rather than return.
-- Preserve current security and provenance changes by replacing ONLY the
-- existing deliberate version-conflict SQLSTATE, not re-installing old functions.
DO $migration$
DECLARE current_function record; definition text; old_count integer;
BEGIN
  FOR current_function IN
    SELECT p.oid,p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('hcn_save_patient_information','hcn_save_patient_contact')
  LOOP
    definition := pg_get_functiondef(current_function.oid);
    old_count := (length(definition) - length(replace(definition,'ERRCODE=''40001''',''))) /
      length('ERRCODE=''40001''');
    IF old_count < 1 THEN
      RAISE EXCEPTION 'Expected version conflict error not found in function %',
        current_function.proname;
    END IF;
    definition := replace(definition,'ERRCODE=''40001''','ERRCODE=''PT409''');
    EXECUTE definition;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN
        ('hcn_save_patient_information','hcn_save_patient_contact'))<>2 THEN
    RAISE EXCEPTION 'Expected both healthcare record save functions';
  END IF;
END;
$migration$;
