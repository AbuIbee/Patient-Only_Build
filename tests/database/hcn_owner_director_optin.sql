-- Disposable staging-only owner/director permission matrix. Rolls back every row.
BEGIN;
CREATE TEMP TABLE hcn_owner_test_results (test text, passed boolean);
DO $hcn$
DECLARE
  v_owner uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid();
  v_org uuid:=gen_random_uuid();
  v_inactive uuid:=gen_random_uuid();
  v_staff_org uuid:=gen_random_uuid();
  v_failed boolean;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (v_owner,'fictional-owner-'||v_owner||'@example.invalid','{}'),
    (v_other,'fictional-other-'||v_other||'@example.invalid','{}');
  INSERT INTO public.organizations(id,name,package_type,created_by,owner_user_id)
    VALUES
    (v_org,'Haneen Fictional Director Opt-In','integrated_care',v_owner,v_owner),
    (v_inactive,'Haneen Fictional Inactive','integrated_care',v_owner,v_owner),
    (v_staff_org,'Haneen Fictional Role Conflict','integrated_care',v_owner,v_owner);
  INSERT INTO public.organization_licenses(organization_id,status,license_number)
    VALUES
    (v_org,'active','HCN-OWNER-FICTIONAL-1'),
    (v_inactive,'proposed','HCN-OWNER-FICTIONAL-2'),
    (v_staff_org,'active','HCN-OWNER-FICTIONAL-3');

  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  v_failed:=false;
  BEGIN PERFORM public.hcn_owner_enable_director_office(v_org);
  EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
  INSERT INTO hcn_owner_test_results VALUES('non-owner denied',v_failed);
  INSERT INTO hcn_owner_test_results VALUES('non-owner cannot see owned org',NOT EXISTS(
    SELECT 1 FROM public.hcn_my_owned_organizations() WHERE organization_id=v_org));

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  INSERT INTO hcn_owner_test_results VALUES('owner activates Director',public.hcn_owner_enable_director_office(v_org));
  INSERT INTO hcn_owner_test_results VALUES('owner retained',EXISTS(
    SELECT 1 FROM public.organizations WHERE id=v_org AND owner_user_id=v_owner));
  INSERT INTO hcn_owner_test_results VALUES('director granted only in own org',EXISTS(
    SELECT 1 FROM public.organization_memberships
      WHERE organization_id=v_org AND user_id=v_owner AND org_role='director' AND status='active'));
  INSERT INTO hcn_owner_test_results VALUES('second activation idempotent',public.hcn_owner_enable_director_office(v_org));
  INSERT INTO hcn_owner_test_results VALUES('one role row and one audit',(
    SELECT count(*) FROM public.organization_memberships
      WHERE organization_id=v_org AND user_id=v_owner)=1 AND (
    SELECT count(*) FROM public.account_management_audit WHERE organization_id=v_org
      AND action_type='hcn_owner_enabled_director_office')=1);

  v_failed:=false;
  BEGIN PERFORM public.hcn_owner_enable_director_office(v_inactive);
  EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
  INSERT INTO hcn_owner_test_results VALUES('inactive license denied',v_failed);

  INSERT INTO public.organization_memberships(organization_id,user_id,org_role,status)
    VALUES(v_staff_org,v_owner,'caregiver','active');
  v_failed:=false;
  BEGIN PERFORM public.hcn_owner_enable_director_office(v_staff_org);
  EXCEPTION WHEN check_violation THEN v_failed:=true; END;
  INSERT INTO hcn_owner_test_results VALUES('existing caregiver role preserved',v_failed AND EXISTS(
    SELECT 1 FROM public.organization_memberships WHERE organization_id=v_staff_org
      AND user_id=v_owner AND org_role='caregiver' AND status='active'));

  INSERT INTO hcn_owner_test_results VALUES('no Platform Owner role assignment',NOT EXISTS(
    SELECT 1 FROM public.organization_memberships WHERE organization_id IN (v_org,v_staff_org)
      AND user_id=v_owner AND org_role='platform_owner'));
END;
$hcn$;
SELECT test,passed FROM hcn_owner_test_results ORDER BY test;
ROLLBACK;