-- Rollback-only fixtures; never changes an existing account or organization.
-- Execute as the migration administrator against an explicitly selected target.
BEGIN;
CREATE TEMP TABLE hcn_gate_evidence (check_name text, actual boolean, expected boolean);
DO $test$
DECLARE
  director_id uuid := gen_random_uuid();
  patient_id uuid := gen_random_uuid();
  org_id uuid := gen_random_uuid();
  unrelated_patient_id uuid := gen_random_uuid();
  license_state text;
  denied boolean;
  contact public.patient_care_providers;
BEGIN
  INSERT INTO auth.users (id,email,raw_user_meta_data)
  VALUES (director_id,'hcn-gate-'||director_id||'@example.invalid','{}'),
         (patient_id,'hcn-gate-'||patient_id||'@example.invalid','{}');
  INSERT INTO public.organizations(id,name,package_type,created_by,owner_user_id)
    VALUES(org_id,'HCN license gate rollback fixture','integrated_care',director_id,director_id);
  INSERT INTO public.organization_licenses(organization_id,status) VALUES(org_id,'active');
  INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status)
    VALUES(org_id,director_id,'director','active');
  INSERT INTO public.patients(id,first_name,last_name) VALUES(patient_id,'Fictional','GateFixture');
  INSERT INTO public.covered_patient_memberships(organization_id,patient_id,status)
    VALUES(org_id,patient_id,'active');
  INSERT INTO hcn_gate_evidence VALUES
    ('active license',public.is_org_director_for_patient(director_id,patient_id),true),
    ('wrong patient',public.is_org_director_for_patient(director_id,unrelated_patient_id),false),
    ('wrong user',public.is_org_director_for_patient(gen_random_uuid(),patient_id),false),
    ('null actor',public.is_org_director_for_patient(null,patient_id),false);
  PERFORM set_config('request.jwt.claim.sub',director_id::text,true);
  contact := public.hcn_save_patient_contact(p_patient_id => patient_id,
    p_provider_name => 'Fictional test physician',p_provider_role => 'Primary physician');
  INSERT INTO hcn_gate_evidence VALUES
    ('active director contact write',contact.patient_id=patient_id,true);
  FOREACH license_state IN ARRAY ARRAY['suspended','expired','canceled'] LOOP
    UPDATE public.organization_licenses SET status=license_state WHERE organization_id=org_id;
    INSERT INTO hcn_gate_evidence VALUES
      (license_state||' license',public.is_org_director_for_patient(director_id,patient_id),false);
    denied := false;
    BEGIN
      PERFORM public.hcn_save_patient_contact(p_patient_id => patient_id,
        p_provider_name => 'Must not be saved',p_provider_role => 'Primary physician');
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    INSERT INTO hcn_gate_evidence VALUES (license_state||' contact write denied',denied,true);
  END LOOP;
  UPDATE public.organization_licenses SET status='active' WHERE organization_id=org_id;
  UPDATE public.organization_memberships SET status='revoked' WHERE organization_id=org_id;
  INSERT INTO hcn_gate_evidence VALUES
    ('revoked director',public.is_org_director_for_patient(director_id,patient_id),false);
  UPDATE public.organization_memberships SET status='active' WHERE organization_id=org_id;
  UPDATE public.covered_patient_memberships SET status='ended' WHERE organization_id=org_id;
  INSERT INTO hcn_gate_evidence VALUES
    ('ended coverage',public.is_org_director_for_patient(director_id,patient_id),false);
END;
$test$;
SELECT json_build_object('check_name',check_name,'actual',actual,'expected',expected,'passed',actual IS NOT DISTINCT FROM expected) FROM hcn_gate_evidence;
ROLLBACK;
