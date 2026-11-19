import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {authSignUp,login,http,sql} from './_runtime';

describe('Assigned clinician patient access without financial grants',()=>{
 it('opens assigned patient, hides license financial rows and denies an unrelated patient and revoked assignment',async()=>{
  const email=`clinical-isolation-${randomUUID()}@local.test`,password=randomUUID()+'Aa9!';
  const clinician=await authSignUp(email,password),patient=randomUUID(),other=randomUUID(),org=randomUUID();
  sql(`INSERT INTO organizations(id,name,package_type,created_by) VALUES('${org}','Synthetic clinical financial isolation','integrated_care','${clinician}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number,license_tier_code,specialist_slot_count) VALUES('${org}',5,2,0,'active','LOCAL-${org}','plus',1);
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${org}','${clinician}','therapist','active');
    INSERT INTO patients(id,first_name,last_name) VALUES('${patient}','Synthetic','Assigned'),('${other}','Synthetic','Excluded');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${org}','${patient}','active','${clinician}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${org}','${clinician}','${patient}','therapist',true,'${clinician}');`);
  const token=await login(email,password);
  const [status,rows]=await http('GET',`/rest/v1/patients?select=id&id=eq.${patient}`,undefined,token);
  expect(status).toBe(200);expect(rows).toEqual([{id:patient}]);
  expect((await http('GET',`/rest/v1/organization_licenses?select=id&organization_id=eq.${org}`,undefined,token))[1]).toEqual([]);
  expect((await http('GET',`/rest/v1/patients?select=id&id=eq.${other}`,undefined,token))[1]).toEqual([]);
  sql(`UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='${org}' AND user_id='${clinician}';`);
  expect((await http('GET',`/rest/v1/patients?select=id&id=eq.${patient}`,undefined,token))[1]).toEqual([]);
 });
});
