-- Hosted staging role probe; no user/contract/payment fixtures are created.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.run_automated_application_verification('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION 'FAIL: internal verification callable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
DECLARE submission_owner text;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO submission_owner FROM pg_proc
    WHERE oid='public.start_self_service_application(text,integer,text,text,jsonb,text,text)'::regprocedure;
  IF NOT has_function_privilege(submission_owner,'public.run_automated_application_verification(uuid)','execute')
    OR NOT has_function_privilege('service_role','public.run_automated_application_verification(uuid)','execute')
    OR has_function_privilege('anon','public.run_automated_application_verification(uuid)','execute') THEN
    RAISE EXCEPTION 'FAIL: helper ACL regression';
  END IF;
END $$;
SELECT 'PASS: client denied; submission owner and service role retained' AS result;
ROLLBACK;
