-- Disposable and rollback-only RLS authorization test. Requires staging schema.
BEGIN;
CREATE TEMP TABLE hcn_ops_rls_ids(kind text PRIMARY KEY,id uuid);
CREATE TEMP TABLE hcn_ops_rls_results(test text, passed boolean);
DO $fixture$
DECLARE
 v_org uuid:=gen_random_uuid();v_patient uuid:=gen_random_uuid();
 v_carer uuid:=gen_random_uuid();v_stranger uuid:=gen_random_uuid();
 v_visit uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (v_carer,'hcn-rls-carer-'||v_carer||'@example.invalid','{}'),
 (v_stranger,'hcn-rls-outsider-'||v_stranger||'@example.invalid','{}'),
 (v_patient,'hcn-rls-patient-'||v_patient||'@example.invalid','{}');
 INSERT INTO public.organizations(id,name,package_type,created_by,owner_user_id)
 VALUES(v_org,'HCN RLS Fictional Only','integrated_care',v_carer,v_carer);
 INSERT INTO public.organization_licenses(organization_id,status,license_number)
 VALUES(v_org,'active','HCN-RLS-FICTIONAL');
 INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status)
 VALUES(v_org,v_carer,'caregiver','active');
 INSERT INTO public.patients(id,first_name,last_name)
 VALUES(v_patient,'Fictional','RLS Patient');
 INSERT INTO public.covered_patient_memberships(organization_id,patient_id,status)
 VALUES(v_org,v_patient,'active');
 INSERT INTO public.staff_patient_assignments(organization_id,patient_id,user_id,org_role,is_active)
 VALUES(v_org,v_patient,v_carer,'caregiver',true);
 INSERT INTO public.caregiver_visits(id,organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status)
 VALUES(v_visit,v_org,v_patient,v_carer,now(),now()+interval '1 hour','scheduled');
 INSERT INTO public.hcn_previsit_acknowledgments(visit_id,organization_id,patient_id,caregiver_id,reviewed_sections,attestation)
 VALUES(v_visit,v_org,v_patient,v_carer,ARRAY['patient_updates','care_plan','medications','healthcare_contacts','handoffs'],
  'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.');
 INSERT INTO public.hcn_care_escalations(organization_id,patient_id,created_by,reason,urgency)
 VALUES(v_org,v_patient,v_carer,'Fictional concern requiring review','routine');
 INSERT INTO hcn_ops_rls_ids VALUES
 ('org',v_org),('patient',v_patient),('carer',v_carer),('stranger',v_stranger),('visit',v_visit);
END;
$fixture$;

-- Only row-level visibility is being tested; no session secrets or real PHI.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 (SELECT id::text FROM hcn_ops_rls_ids WHERE kind='carer'),true);
INSERT INTO hcn_ops_rls_results SELECT 'active assigned caregiver sees own receipt',
 count(*)=1 FROM public.hcn_previsit_acknowledgments;
INSERT INTO hcn_ops_rls_results SELECT 'active assigned caregiver sees own escalation',
 count(*)=1 FROM public.hcn_care_escalations;
SELECT set_config('request.jwt.claim.sub',
 (SELECT id::text FROM hcn_ops_rls_ids WHERE kind='stranger'),true);
INSERT INTO hcn_ops_rls_results SELECT 'unrelated user cannot read receipt',
 count(*)=0 FROM public.hcn_previsit_acknowledgments;
INSERT INTO hcn_ops_rls_results SELECT 'unrelated user cannot read escalation',
 count(*)=0 FROM public.hcn_care_escalations;

RESET ROLE;
UPDATE public.staff_patient_assignments SET is_active=false
 WHERE user_id=(SELECT id FROM hcn_ops_rls_ids WHERE kind='carer');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 (SELECT id::text FROM hcn_ops_rls_ids WHERE kind='carer'),true);
INSERT INTO hcn_ops_rls_results SELECT 'revoked assignment cannot read receipt',
 count(*)=0 FROM public.hcn_previsit_acknowledgments;
INSERT INTO hcn_ops_rls_results SELECT 'revoked assignment cannot read escalation',
 count(*)=0 FROM public.hcn_care_escalations;

RESET ROLE;
UPDATE public.staff_patient_assignments SET is_active=true
 WHERE user_id=(SELECT id FROM hcn_ops_rls_ids WHERE kind='carer');
UPDATE public.organization_licenses SET status='expired'
 WHERE organization_id=(SELECT id FROM hcn_ops_rls_ids WHERE kind='org');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 (SELECT id::text FROM hcn_ops_rls_ids WHERE kind='carer'),true);
INSERT INTO hcn_ops_rls_results SELECT 'expired license blocks receipt reads',
 count(*)=0 FROM public.hcn_previsit_acknowledgments;
INSERT INTO hcn_ops_rls_results SELECT 'expired license blocks escalation reads',
 count(*)=0 FROM public.hcn_care_escalations;

RESET ROLE;
SELECT test, passed FROM hcn_ops_rls_results ORDER BY test;
ROLLBACK;
