BEGIN;
CREATE TEMP TABLE hcn_ops_results(test text,passed boolean);
DO $test$
DECLARE
  v_director uuid:=gen_random_uuid();
  v_carer uuid:=gen_random_uuid();
  v_clinician uuid:=gen_random_uuid();
  v_stranger uuid:=gen_random_uuid();
  v_patient uuid:=gen_random_uuid();
  v_org uuid:=gen_random_uuid();
  v_visit uuid:=gen_random_uuid();
  v_case uuid;
  v_deny boolean;
  v_attestation text := 'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.';
  v_sections text[] := ARRAY['patient_updates','care_plan','medications','healthcare_contacts','handoffs'];
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES (v_director,'hcn-director-'||v_director||'@example.invalid','{}'),
    (v_carer,'hcn-carer-'||v_carer||'@example.invalid','{}'),
    (v_clinician,'hcn-clinician-'||v_clinician||'@example.invalid','{}'),
    (v_stranger,'hcn-stranger-'||v_stranger||'@example.invalid','{}'),
    (v_patient,'hcn-patient-'||v_patient||'@example.invalid','{}');
  INSERT INTO public.organizations(id,name,package_type,created_by,owner_user_id)
  VALUES(v_org,'HCN Fictional Operations Tests','integrated_care',v_director,v_director);
  INSERT INTO public.organization_licenses(organization_id,status,license_number)
  VALUES(v_org,'active','HCN-OPS-FICTIONAL-ONLY');
  INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status)
  VALUES(v_org,v_director,'director','active'),
    (v_org,v_carer,'caregiver','active'),
    (v_org,v_clinician,'medical_professional','active');
  INSERT INTO public.patients(id,first_name,last_name)
  VALUES(v_patient,'Fictional','CareRecipient');
  INSERT INTO public.covered_patient_memberships(organization_id,patient_id,status)
  VALUES(v_org,v_patient,'active');
  INSERT INTO public.staff_patient_assignments(organization_id,patient_id,user_id,org_role,is_active)
  VALUES(v_org,v_patient,v_carer,'caregiver',true),
    (v_org,v_patient,v_clinician,'medical_professional',true);
  INSERT INTO public.caregiver_visits(id,organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
  VALUES(v_visit,v_org,v_patient,v_carer,now()+interval '5 minutes',now()+interval '65 minutes','scheduled');

  PERFORM set_config('request.jwt.claim.sub',v_stranger::text,true);
  v_deny:=false;
  BEGIN
    PERFORM public.hcn_acknowledge_previsit(v_visit,v_sections,v_attestation);
  EXCEPTION WHEN insufficient_privilege THEN v_deny:=true; END;
  INSERT INTO hcn_ops_results VALUES('unassigned user cannot acknowledge visit',v_deny);

  PERFORM set_config('request.jwt.claim.sub',v_carer::text,true);
  v_deny:=false;
  BEGIN PERFORM public.start_caregiver_visit(v_visit);
  EXCEPTION WHEN invalid_parameter_value THEN v_deny:=true; END;
  INSERT INTO hcn_ops_results VALUES('visit cannot start before acknowledgment',v_deny);

  v_deny:=false;
  BEGIN PERFORM public.hcn_acknowledge_previsit(v_visit,ARRAY['patient_updates'],v_attestation);
  EXCEPTION WHEN invalid_parameter_value THEN v_deny:=true; END;
  INSERT INTO hcn_ops_results VALUES('incomplete five-section review rejected',v_deny);
  INSERT INTO hcn_ops_results VALUES('complete review saved',
    public.hcn_acknowledge_previsit(v_visit,v_sections,v_attestation) IS NOT NULL);
  INSERT INTO hcn_ops_results VALUES('review receipt current',public.hcn_is_previsit_current(v_visit));

  INSERT INTO public.shift_handoffs(organization_id,patient_id,author_id,summary)
  VALUES(v_org,v_patient,v_carer,'Fictional follow-up handoff just posted');
  INSERT INTO hcn_ops_results VALUES('new handoff invalidates previous acknowledgment',
    NOT public.hcn_is_previsit_current(v_visit));
  PERFORM public.hcn_acknowledge_previsit(v_visit,v_sections,v_attestation);
  INSERT INTO hcn_ops_results VALUES('reacknowledge after handoff',
    public.hcn_is_previsit_current(v_visit));
  INSERT INTO public.medications(patient_id,name,dosage,instructions)
    VALUES(v_patient,'Fictional Test Medication','No actual dosage','TEST DATA ONLY — no administration');
  INSERT INTO hcn_ops_results VALUES('medication change invalidates previsit acknowledgment',
    NOT public.hcn_is_previsit_current(v_visit));
  PERFORM public.hcn_acknowledge_previsit(v_visit,v_sections,v_attestation);
  INSERT INTO hcn_ops_results VALUES('reacknowledge after medication record change',
    public.hcn_is_previsit_current(v_visit));
  INSERT INTO hcn_ops_results VALUES('visit can start after review',
    (public.start_caregiver_visit(v_visit)).status='in_progress');

  v_case:=public.hcn_submit_care_escalation(
    v_org,v_patient,'Fictional patient reports new dizziness and declined meal.', 'priority');
  INSERT INTO hcn_ops_results VALUES('caregiver escalation queued',
    (SELECT status FROM public.hcn_care_escalations WHERE id=v_case)='director_pending');

  PERFORM set_config('request.jwt.claim.sub',v_stranger::text,true);
  v_deny:=false;
  BEGIN PERFORM public.hcn_director_triage_escalation(
    v_case,'request_clinical_review','Fictional director followup required');
  EXCEPTION WHEN insufficient_privilege THEN v_deny:=true; END;
  INSERT INTO hcn_ops_results VALUES('outsider cannot triage',v_deny);

  PERFORM set_config('request.jwt.claim.sub',v_carer::text,true);
  v_deny:=false;
  BEGIN PERFORM public.hcn_clinician_review_escalation(
    v_case,'Fictional clinician reviewed patient observation');
  EXCEPTION WHEN invalid_parameter_value THEN v_deny:=true; END;
  INSERT INTO hcn_ops_results VALUES('clinical response cannot precede Director triage',v_deny);

  PERFORM set_config('request.jwt.claim.sub',v_director::text,true);
  INSERT INTO hcn_ops_results VALUES('Director requests clinical review',
    public.hcn_director_triage_escalation(
      v_case,'request_clinical_review','Fictional clinical review requested'));

  PERFORM set_config('request.jwt.claim.sub',v_carer::text,true);
  v_deny:=false;
  BEGIN PERFORM public.hcn_clinician_review_escalation(
    v_case,'Fictional caregiver trying to make medical review');
  EXCEPTION WHEN insufficient_privilege THEN v_deny:=true; END;
  INSERT INTO hcn_ops_results VALUES('caregiver cannot masquerade as clinician',v_deny);

  PERFORM set_config('request.jwt.claim.sub',v_clinician::text,true);
  INSERT INTO hcn_ops_results VALUES('assigned clinician records review',
    public.hcn_clinician_review_escalation(v_case,'Fictional clinician contacted and assessed information'));

  PERFORM set_config('request.jwt.claim.sub',v_director::text,true);
  INSERT INTO hcn_ops_results VALUES('Director closes after clinician review',
    public.hcn_director_close_escalation(v_case,'Fictional clinical followup completed and documented'));
  INSERT INTO hcn_ops_results VALUES('final escalation status resolved',
    (SELECT status FROM public.hcn_care_escalations WHERE id=v_case)='resolved');
END;
$test$;
SELECT test,passed FROM hcn_ops_results ORDER BY test;
ROLLBACK;