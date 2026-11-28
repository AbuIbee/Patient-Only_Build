import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { authSignUp, authDeleteUser, login, http, rpc, sql } from './_runtime';

// Only disposable, explicitly configured local Supabase. Never hosted production data.
const stamp = randomUUID(), password = randomBytes(24).toString('hex'), org = randomUUID();
const people: Record<string,string>={},tokens:Record<string,string>={};
const quote = (value: string) => "'" + value.replaceAll("'","''") + "'";
const patient = () => people.patient;
const start = new Date(Date.now()+4*3600000).toISOString();
const end = new Date(Date.now()+5*3600000).toISOString();
let assistanceId='',requirementId='',visitId='',handoffId='';
const deny = (status:number) => expect([400,401,403,404,409]).toContain(status);
async function list(table:string,token:string) {
  const [status,body] = await http('GET','/rest/v1/'+table+'?organization_id=eq.'+org+'&select=*',undefined,token);
  expect(status).toBe(200);
  return body as Array<Record<string,unknown>>;
}

describe.sequential('HCN Director safety permissions — real disposable Supabase',()=>{
  beforeAll(async()=>{
    for(const role of ['director','caregiver','outgoing','outsider','patient']){
      const email='safety-'+role+'-'+stamp+'@example.invalid';
      people[role]=await authSignUp(email,password);
      tokens[role]=await login(email,password);
    }
    const names=Object.values(people).map(quote).join(',');
    const orgQ=quote(org),patQ=quote(patient()),director=quote(people.director);
    const cg=quote(people.caregiver),out=quote(people.outgoing);
    sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id IN ("+names+");"+
      "INSERT INTO organizations(id,name,package_type,created_by) VALUES("+orgQ+","+
       quote('Safety Fictional '+stamp)+",'integrated_care',"+director+");"+
      "INSERT INTO organization_licenses(organization_id,status,license_number) VALUES("+orgQ+",'active',"+quote('SAFE-'+stamp)+");"+
      "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES"+
       "("+orgQ+","+director+",'director','active'),"+
       "("+orgQ+","+cg+",'caregiver','active'),"+
       "("+orgQ+","+out+",'caregiver','active');"+
      "INSERT INTO patients(id,first_name,last_name) VALUES("+patQ+",'Fictional','Safety');"+
      "INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES("+orgQ+","+patQ+",'active');"+
      "INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active) VALUES"+
       "("+orgQ+","+cg+","+patQ+",'caregiver',true),"+
       "("+orgQ+","+out+","+patQ+",'caregiver',true);");
  });
  afterAll(async()=>{
    try {
      const oq=quote(org),pq=quote(patient());
      sql("DELETE FROM hcn_director_visit_actions WHERE organization_id="+oq+";"+
        "DELETE FROM hcn_handoff_receipt_targets WHERE organization_id="+oq+";"+
        "DELETE FROM shift_handoff_acknowledgments WHERE handoff_id IN (SELECT id FROM shift_handoffs WHERE organization_id="+oq+");"+
        "DELETE FROM shift_handoffs WHERE organization_id="+oq+";"+
        "DELETE FROM caregiver_visits WHERE organization_id="+oq+";"+
        "DELETE FROM hcn_required_care_slot_events WHERE slot_id IN (SELECT id FROM hcn_required_care_slots WHERE organization_id="+oq+");"+
        "DELETE FROM hcn_required_care_slots WHERE organization_id="+oq+";"+
        "DELETE FROM hcn_caregiver_assistance_events WHERE alert_id IN (SELECT id FROM hcn_caregiver_assistance_alerts WHERE organization_id="+oq+");"+
        "DELETE FROM hcn_caregiver_assistance_alerts WHERE organization_id="+oq+";"+
        "DELETE FROM staff_patient_assignments WHERE organization_id="+oq+";"+
        "DELETE FROM covered_patient_memberships WHERE organization_id="+oq+";"+
        "DELETE FROM organization_memberships WHERE organization_id="+oq+";"+
        "DELETE FROM organization_licenses WHERE organization_id="+oq+";"+
        "DELETE FROM organizations WHERE id="+oq+";"+
        "DELETE FROM patients WHERE id="+pq+";");
    } finally {
      for(const id of Object.values(people)) await authDeleteUser(id);
    }
  });
  it('scopes caregiver assistance creation/reads and denies unauthorized status forgery',async()=>{
    const [status,body]=await http('POST','/rest/v1/hcn_caregiver_assistance_alerts',{
      organization_id:org,patient_id:patient(),reason:'Fictional assistance request from caregiver'
    },tokens.caregiver);
    expect(status).toBe(201);
    assistanceId=String((body as Array<{id:string}>)[0].id);
    expect((await list('hcn_caregiver_assistance_alerts',tokens.director)).map(x=>x.id)).toContain(assistanceId);
    expect(await list('hcn_caregiver_assistance_alerts',tokens.outsider)).toHaveLength(0);
    deny((await http('PATCH','/rest/v1/hcn_caregiver_assistance_alerts?id=eq.'+assistanceId,
      {status:'resolved'},tokens.caregiver))[0]);
    deny((await http('POST','/rest/v1/hcn_caregiver_assistance_alerts',{
      organization_id:org,patient_id:patient(),reason:'Unauthorized outside request'},tokens.outsider))[0]);
  });
  it('enforces Director-only sequential assistance actions with immutable audit history',async()=>{
    const req=(action:string,note:string|null=null,method:string|null=null,token=tokens.director)=>
      rpc('hcn_director_action_assistance_alert',{
        p_alert_id:assistanceId,p_action:action,p_note:note,p_contact_method:method
      },token);
    deny((await req('acknowledge',null,null,tokens.caregiver))[0]);
    expect(await req('acknowledge')).toEqual([200,'acknowledged']);
    deny((await req('resolve','Invalid bypass resolution'))[0]);
    expect(await req('contact','Phoned caregiver and confirmed situation','phone')).toEqual([200,'in_contact']);
    expect(await req('resolve','Director verified the caregiver has assistance')).toEqual([200,'resolved']);
    expect(sql('SELECT count(*) FROM hcn_caregiver_assistance_events WHERE alert_id='+quote(assistanceId))).toBe('4');
    deny((await req('acknowledge'))[0]);
  });
  it('tracks independently required care and audits Director cancellation; non-director denied',async()=>{
    const args={p_org:org,p_patient:patient(),p_start:start,p_end:end,p_note:'Fictional required staffing coverage'};
    deny((await rpc('hcn_director_require_care',args,tokens.caregiver))[0]);
    const [status,id]=await rpc('hcn_director_require_care',args,tokens.director);
    expect(status).toBe(200);
    requirementId=String(id);
    expect((await list('hcn_required_care_slots',tokens.director)).map(x=>x.id)).toContain(requirementId);
    expect(await list('hcn_required_care_slots',tokens.outsider)).toHaveLength(0);
    deny((await rpc('hcn_director_require_care',args,tokens.director))[0]);
    expect(await rpc('hcn_director_cancel_required_care',{
      p_slot:requirementId,p_reason:'Requirement discontinued in fictional care plan'
    },tokens.director)).toEqual([200,true]);
    expect(sql('SELECT count(*) FROM hcn_required_care_slot_events WHERE slot_id='+quote(requirementId))).toBe('2');
  });
  it('tracks the incoming caregiver and handoff acknowledgment without elevating outsider access',async()=>{
    visitId=randomUUID();
    const oq=quote(org),pq=quote(patient());
    sql("INSERT INTO caregiver_visits(id,organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end) VALUES("+
      quote(visitId)+","+oq+","+pq+","+quote(people.caregiver)+","+quote(start)+","+quote(end)+");");
    const [handoffStatus]=await rpc('record_shift_handoff',{
      p_org_id:org,p_patient_id:patient(),p_summary:'Fictional clinical handoff notes'
    },tokens.outgoing);
    expect(handoffStatus).toBe(200);
    handoffId=sql('SELECT id FROM shift_handoffs WHERE organization_id='+oq+' ORDER BY created_at DESC LIMIT 1;');
    const args={p_org:org,p_until:new Date(Date.now()+48*3600000).toISOString()};
    const [status,rows]=await rpc('hcn_director_handoff_receipts',args,tokens.director);
    expect(status).toBe(200);
    const pending=(rows as Array<Record<string,unknown>>).find(x=>x.handoff_id===handoffId);
    expect(pending?.incoming_caregiver_id).toBe(people.caregiver);
    expect(pending?.acknowledged_at).toBeNull();
    expect(await rpc('hcn_director_handoff_receipts',args,tokens.outsider)).toEqual([200,[]]);
    expect((await rpc('acknowledge_shift_handoff',{p_handoff_id:handoffId},tokens.caregiver))[0]).toBe(200);
    const [after,receipts]=await rpc('hcn_director_handoff_receipts',args,tokens.director);
    expect(after).toBe(200);
    expect((receipts as Array<Record<string,unknown>>).find(x=>x.handoff_id===handoffId)?.acknowledged_at).toBeTruthy();
  });
  it('rejects caregiver schedule overlaps and permits only Director audited cancellation',async()=>{
    const [blocked]=await rpc('hcn_director_schedule_assigned_visit',{
      p_org_id:org,p_patient_id:patient(),p_caregiver_id:people.caregiver,
      p_scheduled_start:new Date(Date.parse(start)+10*60_000).toISOString(),
      p_scheduled_end:new Date(Date.parse(end)+10*60_000).toISOString(),
    },tokens.director);
    deny(blocked);
    deny((await rpc('hcn_director_cancel_scheduled_visit',{
      p_visit:visitId,p_reason:'Unauthorized visitor cancellation attempt'
    },tokens.outsider))[0]);
    expect((await rpc('hcn_director_record_visit_action',{
      p_visit:visitId,p_action:'reviewed',p_note:'Director reviewed test visit conflict'
    },tokens.director))[0]).toBe(200);
    expect(await rpc('hcn_director_cancel_scheduled_visit',{
      p_visit:visitId,p_reason:'Fictional visit correction with audited reason'
    },tokens.director)).toEqual([200,true]);
    expect(sql('SELECT status FROM caregiver_visits WHERE id='+quote(visitId))).toBe('canceled');
    expect(sql('SELECT count(*) FROM hcn_director_visit_actions WHERE visit_id='+quote(visitId))).toBe('2');
  });
  it('prevents requests and coverage updates after revocation or license expiration',async()=>{
    sql("UPDATE staff_patient_assignments SET is_active=false WHERE organization_id="+quote(org)+
      " AND user_id="+quote(people.caregiver)+";");
    deny((await http('POST','/rest/v1/hcn_caregiver_assistance_alerts',{
      organization_id:org,patient_id:patient(),reason:'Revoked caregiver cannot request assistance'
    },tokens.caregiver))[0]);
    sql("UPDATE staff_patient_assignments SET is_active=true WHERE organization_id="+quote(org)+
      " AND user_id="+quote(people.caregiver)+";"+
      "UPDATE organization_licenses SET status='expired' WHERE organization_id="+quote(org)+";");
    deny((await rpc('hcn_director_require_care',{
      p_org:org,p_patient:patient(),p_start:start,p_end:end,p_note:'Unlicensed coverage must be denied'
    },tokens.director))[0]);
  });
});
