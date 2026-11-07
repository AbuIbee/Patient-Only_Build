-- Synthetic-only rollback test for shared caregiver visit backward compatibility.
BEGIN;
CREATE TEMP TABLE hcn_legacy_results(test text,passed boolean);
DO $fixture$
DECLARE
  v_caregiver uuid:=gen_random_uuid();
  v_outsider uuid:=gen_random_uuid();
  v_patient uuid:=gen_random_uuid();
  v_org uuid:=gen_random_uuid();
  v_visit uuid:=gen_random_uuid();
  v_deny boolean;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (v_caregiver,'legacy-carer-'||v_caregiver||'@example.invalid','{}'),
    (v_outsider,'legacy-outsider-'||v_outsider||'@example.invalid','{}'),
    (v_patient,'legacy-patient-'||v_patient||'@example.invalid','{}');
  INSERT INTO public.organizations(id,name,package_type,created_by,owner_user_id)
    VALUES(v_org,'Fictional legacy visit only','integrated_care',v_caregiver,v_caregiver);
  INSERT INTO public.patients(id,first_name,last_name)
    VALUES(v_patient,'Fictional','LegacyCare');
  INSERT INTO public.caregiver_patients(caregiver_id,patient_id)
    VALUES(v_caregiver,v_patient);
  INSERT INTO public.caregiver_visits(id,organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
    VALUES(v_visit,v_org,v_patient,v_caregiver,now(),now()+interval '1 hour','scheduled');

  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  v_deny:=false;
  BEGIN PERFORM public.start_caregiver_visit(v_visit);
  EXCEPTION WHEN insufficient_privilege THEN v_deny:=true; END;
  INSERT INTO hcn_legacy_results VALUES('unassigned outsider denied',v_deny);

  PERFORM set_config('request.jwt.claim.sub',v_caregiver::text,true);
  INSERT INTO hcn_legacy_results VALUES('legacy caregiver may start without Haneen acknowledgment',
    (public.start_caregiver_visit(v_visit)).status='in_progress');

  UPDATE public.caregiver_visits SET status='scheduled', actual_start=null WHERE id=v_visit;
  INSERT INTO public.covered_patient_memberships(organization_id,patient_id,status)
    VALUES(v_org,v_patient,'active');
  v_deny:=false;
  BEGIN PERFORM public.start_caregiver_visit(v_visit);
  EXCEPTION WHEN invalid_parameter_value THEN v_deny:=true; END;
  INSERT INTO hcn_legacy_results VALUES('enterprise-covered patient cannot bypass acknowledgment through legacy link',v_deny);
END;
$fixture$;
SELECT test,passed FROM hcn_legacy_results ORDER BY test;
ROLLBACK;