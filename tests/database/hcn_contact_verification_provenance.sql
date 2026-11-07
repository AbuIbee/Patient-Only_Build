-- A patient may report a contact, but cannot attest that it was verified.
-- All fixtures and attempted writes are rolled back.
BEGIN;
CREATE TEMP TABLE hcn_provenance_evidence(check_name text,passed boolean);
GRANT INSERT ON hcn_provenance_evidence TO authenticated;
DO $test$
DECLARE
  subject_id uuid := gen_random_uuid();
  blocked boolean := false;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
    VALUES(subject_id,'hcn-provenance-'||subject_id||'@example.invalid','{}');
  INSERT INTO public.patients(id,first_name,last_name) VALUES(subject_id,'Fictional','ProvenanceFixture');
  PERFORM set_config('request.jwt.claim.sub',subject_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.patient_care_providers(patient_id,provider_name,provider_role,source,author_id,verification_status)
      VALUES(subject_id,'Fictional provider','Primary physician','unknown',subject_id,'verified');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  INSERT INTO hcn_provenance_evidence VALUES('patient cannot forge verified contact status',blocked);
  INSERT INTO public.patient_care_providers(patient_id,provider_name,provider_role,source,author_id)
    VALUES(subject_id,'Fictional reported provider','Primary physician','unknown',subject_id);
  INSERT INTO hcn_provenance_evidence
    SELECT 'patient may still submit an unverified contact',count(*)=1
    FROM public.patient_care_providers WHERE patient_id=subject_id AND provider_name='Fictional reported provider' AND verification_status='unverified';
  EXECUTE 'RESET ROLE';
END;
$test$;
SELECT json_build_object('check_name',check_name,'passed',passed) FROM hcn_provenance_evidence;
ROLLBACK;
