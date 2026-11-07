// HCN-CARE-INFO-SEARCH-001: real RPC + RLS, disposable Supabase only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const stamp=Date.now();
const org='c0410000-aaaa-4bbb-8ccc-'+String(stamp).slice(-12).padStart(12,'0');
const accounts={
  director:`info-dir-${stamp}@local.test`,
  caregiver:`info-care-${stamp}@local.test`,
  patient:`info-patient-${stamp}@local.test`,
  outsider:`info-outsider-${stamp}@local.test`,
};
const ids:Record<string,string>={},tokens:Record<string,string>={};
const pw='PatientInfoTesting2026!';

beforeAll(async()=>{
  for(const [name,email] of Object.entries(accounts)) ids[name]=await authSignUp(email,pw);
  sql(`
    UPDATE profiles SET must_change_password=false,provisioning_status='complete'
      WHERE id IN ('${Object.values(ids).join("','")}');
    INSERT INTO organizations(id,name,package_type,created_by)
      VALUES ('${org}','HCN Patient Info Test ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number)
      VALUES ('${org}',10,10,399,'active','HCN-INFO-${stamp}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${org}','${ids.director}','director','active'),
      ('${org}','${ids.caregiver}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name)
      VALUES ('${ids.patient}','Test','Patient','Patient Information Test');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status)
      VALUES ('${org}','${ids.patient}','active');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by)
      VALUES ('${org}','${ids.caregiver}','${ids.patient}','caregiver',true,'${ids.director}');
    INSERT INTO patient_care_providers(patient_id,provider_name,provider_role,phone,source,author_id)
      VALUES ('${ids.patient}','Fictional Physician','Primary physician','555-0190','caregiver_report','${ids.director}');
  `);
  for(const [name,email] of Object.entries(accounts))tokens[name]=await login(email,pw);
},30000);

afterAll(async()=>{
  if(ids.patient){
    sql(`
      DELETE FROM hcn_patient_information_audit WHERE patient_id='${ids.patient}';
      DELETE FROM hcn_patient_information WHERE patient_id='${ids.patient}';
      DELETE FROM patient_care_providers WHERE patient_id='${ids.patient}';
      DELETE FROM staff_patient_assignments WHERE organization_id='${org}';
      DELETE FROM covered_patient_memberships WHERE organization_id='${org}';
      DELETE FROM organization_memberships WHERE organization_id='${org}';
      DELETE FROM organization_licenses WHERE organization_id='${org}';
      DELETE FROM organizations WHERE id='${org}';
      DELETE FROM patients WHERE id='${ids.patient}';
    `);
  }
  for(const id of Object.values(ids))await authDeleteUser(id);
},30000);

describe('HCN Patient Information: real authenticated role and record tests',()=>{
  it('Director reads exact patient with one shared provider contact',async()=>{
    const [status,response]=await rpc('hcn_get_patient_information',{p_org_id:org,p_patient_id:ids.patient},tokens.director);
    expect(status).toBe(200);
    const row=response as {patient:{id:string};providers:Array<{name:string}>};
    expect(row.patient.id).toBe(ids.patient);
    expect(row.providers.some(p=>p.name==='Fictional Physician')).toBe(true);
  });
  it('assigned caregiver can read and correct an authorized detail',async()=>{
    const [status,response]=await rpc('hcn_save_patient_information',{
      p_org_id:org,p_patient_id:ids.patient,
      p_changes:{mobile_phone:'555-0134',medical_care_needs:'Fictional care needs only'},
      p_expected_version:null,
    },tokens.caregiver);
    expect(status).toBe(200);
    const saved=response as {version:number;patient_id:string};
    expect(saved.patient_id).toBe(ids.patient);
    const [readCode,row]=await rpc('hcn_get_patient_information',{p_org_id:org,p_patient_id:ids.patient},tokens.director);
    expect(readCode).toBe(200);
    expect((row as {details:{mobile_phone:string}}).details.mobile_phone).toBe('555-0134');
  });
  it('unknown user cannot read any dossier or change any field',async()=>{
    const [readStatus]=await rpc('hcn_get_patient_information',{p_org_id:org,p_patient_id:ids.patient},tokens.outsider);
    const [editStatus]=await rpc('hcn_save_patient_information',{
      p_org_id:org,p_patient_id:ids.patient,p_changes:{mobile_phone:'unapproved'},p_expected_version:1,
    },tokens.outsider);
    expect(readStatus).toBeGreaterThanOrEqual(400);
    expect(editStatus).toBeGreaterThanOrEqual(400);
  });
  it('stale update returns HTTP 409 without retrying or overwriting',async()=>{
    const started=Date.now();
    const [status,body]=await rpc('hcn_save_patient_information',{
      p_org_id:org,p_patient_id:ids.patient,p_changes:{home_phone:'555-0138'},p_expected_version:0,
    },tokens.director);
    expect(status).toBe(409);
    expect((body as {code?:string}).code).toBe('PT409');
    expect(Date.now()-started).toBeLessThan(10000);
  });
  it('audit actor is the real caregiver, and revocation removes read access',async()=>{
    const actor=sql(`SELECT actor_user_id FROM hcn_patient_information_audit WHERE patient_id='${ids.patient}'
      ORDER BY id DESC LIMIT 1`);
    expect(actor).toBe(ids.caregiver);
    sql(`UPDATE staff_patient_assignments SET is_active=false
      WHERE organization_id='${org}' AND user_id='${ids.caregiver}' AND patient_id='${ids.patient}';`);
    const [status]=await rpc('hcn_get_patient_information',{p_org_id:org,p_patient_id:ids.patient},tokens.caregiver);
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
