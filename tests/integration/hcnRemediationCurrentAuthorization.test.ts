import {randomBytes,randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {authSignUp,authDeleteUser,login,http,sql,rpc} from './_runtime';

// Real local GoTrue JWTs + PostgREST + PostgreSQL RLS. Never hosted credentials.
const pw=randomBytes(24).toString('hex'),stamp=randomUUID();
const ids:Record<string,string>={},tokens:Record<string,string>={};
const org=randomUUID(),otherOrg=randomUUID(),visit=randomUUID();
const mail=(k:string)=>`hcn-remediation-${k}-${stamp}@example.invalid`;
async function getRows(table:string,token:string){
  const [status,body]=await http('GET',`/rest/v1/${table}?patient_id=eq.${ids.patient}&select=*`,undefined,token);
  expect(status).toBe(200);expect(Array.isArray(body)).toBe(true);
  return body as Array<Record<string,unknown>>;
}
async function deniedReads(token:string){
  for(const table of ['hcn_previsit_acknowledgments','hcn_care_escalations','care_partner_notes','covered_patient_memberships'])
    expect(await getRows(table,token),table).toHaveLength(0);
}
async function mood(token:string,changes:Record<string,unknown>={}){
  return http('POST','/rest/v1/mood_entries',{patient_id:ids.patient,organization_id:org,
    mood:'calm',intensity:5,recorded_by:'untrusted client label',...changes},token);
}
describe('HCN remediation current database authorization and immutable wellness',()=>{
  beforeAll(async()=>{
    for(const role of ['caregiver','patient','outsider','director','otherPatient']){
      ids[role]=await authSignUp(mail(role),pw);tokens[role]=await login(mail(role),pw);
    }
    sql(`
      INSERT INTO organizations(id,name,package_type,created_by) VALUES
        ('${org}','HCN Remediation TEST ONLY','integrated_care','${ids.director}'),
        ('${otherOrg}','HCN Other TEST ONLY','integrated_care','${ids.outsider}');
      INSERT INTO organization_licenses(organization_id,status,license_number) VALUES
        ('${org}','active','HCN-R-${stamp}'),('${otherOrg}','active','HCN-RB-${stamp}');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
        ('${org}','${ids.caregiver}','caregiver','active'),('${org}','${ids.director}','director','active'),
        ('${otherOrg}','${ids.outsider}','caregiver','active');
      INSERT INTO patients(id,first_name,last_name) VALUES ('${ids.patient}','Synthetic','Remediation'),
        ('${ids.otherPatient}','Synthetic','Other') ON CONFLICT(id) DO NOTHING;
      INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
        ('${org}','${ids.patient}','active'),('${otherOrg}','${ids.otherPatient}','active');
      INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active)
        VALUES('${org}','${ids.caregiver}','${ids.patient}','caregiver',true);
      INSERT INTO caregiver_visits(id,organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end)
        VALUES('${visit}','${org}','${ids.patient}','${ids.caregiver}',now(),now()+interval '1 hour');
      INSERT INTO hcn_previsit_acknowledgments(visit_id,organization_id,patient_id,caregiver_id,reviewed_sections,attestation)
        VALUES('${visit}','${org}','${ids.patient}','${ids.caregiver}',ARRAY['patient_updates','care_plan','medications','healthcare_contacts','handoffs'],'Synthetic test receipt');
      INSERT INTO hcn_care_escalations(organization_id,patient_id,created_by,reason,urgency)
        VALUES('${org}','${ids.patient}','${ids.caregiver}','Synthetic nonclinical test','routine');
      INSERT INTO care_partner_notes(patient_id,category,note) VALUES('${ids.patient}','A','Synthetic private test note');
    `);
  });
  beforeEach(()=>sql(`UPDATE organization_memberships SET status='active',org_role='caregiver' WHERE organization_id='${org}' AND user_id='${ids.caregiver}';
    UPDATE staff_patient_assignments SET is_active=true,org_role='caregiver' WHERE organization_id='${org}' AND user_id='${ids.caregiver}';
    UPDATE covered_patient_memberships SET status='active' WHERE organization_id='${org}';
    UPDATE organization_licenses SET status='active',license_number='HCN-R-${stamp}' WHERE organization_id='${org}';`));
  afterAll(async()=>{
    sql(`DELETE FROM hcn_previsit_acknowledgments WHERE organization_id='${org}';
      DELETE FROM hcn_care_escalations WHERE organization_id='${org}';
      DELETE FROM mood_entries WHERE patient_id='${ids.patient}';
      DELETE FROM caregiver_visits WHERE organization_id='${org}';
      DELETE FROM organizations WHERE id IN ('${org}','${otherOrg}');`);
    for(const id of Object.values(ids))await authDeleteUser(id);
  });
  it('permits both operational positives and patient self-access; rejects cross-tenant reads',async()=>{
    for(const table of ['hcn_previsit_acknowledgments','hcn_care_escalations','care_partner_notes','covered_patient_memberships'])
      expect(await getRows(table,tokens.caregiver)).toHaveLength(1);
    expect(await getRows('care_partner_notes',tokens.patient)).toHaveLength(1);
    await deniedReads(tokens.outsider);
    expect(await getRows('hcn_care_escalations',tokens.director)).toHaveLength(1);
  });
  it('membership revocation defeats the old JWT and independently issued fresh JWT with assignment left active',async()=>{
    sql(`UPDATE organization_memberships SET status='revoked' WHERE organization_id='${org}' AND user_id='${ids.caregiver}';`);
    expect(sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${org}' AND user_id='${ids.caregiver}';`)).toBe('t');
    await deniedReads(tokens.caregiver);
    const fresh=await login(mail('caregiver'),pw);expect(fresh).not.toBe(tokens.caregiver);await deniedReads(fresh);
  });
  it('ended coverage defeats old and new JWTs while membership and assignment remain active',async()=>{
    sql(`UPDATE covered_patient_memberships SET status='ended' WHERE organization_id='${org}';`);
    await deniedReads(tokens.caregiver);await deniedReads(await login(mail('caregiver'),pw));
  });
  it('revoked assignment, mismatched organizational role and expired license each deny reads',async()=>{
    sql(`UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='${org}';`);await deniedReads(tokens.caregiver);
    sql(`UPDATE staff_patient_assignments SET is_active=true,org_role='therapist' WHERE organization_id='${org}';`);await deniedReads(tokens.caregiver);
    sql(`UPDATE staff_patient_assignments SET org_role='caregiver' WHERE organization_id='${org}'; UPDATE organization_licenses SET status='expired' WHERE organization_id='${org}';`);
    await deniedReads(tokens.caregiver);
  });
  it('an active but unissued license cannot authorize clinical records or wellness',async()=>{
    sql(`UPDATE organization_licenses SET license_number=NULL WHERE organization_id='${org}';`);
    await deniedReads(tokens.caregiver);expect((await mood(tokens.caregiver))[0]).toBe(403);
  });
  it('does not expose a private RPC or grant caregivers license financial rows',async()=>{
    const [status]=await http('POST','/rest/v1/rpc/current_staff_patient_v1',{p_org:org,p_patient:ids.patient},tokens.caregiver);
    expect([404,400]).toContain(status);
    const [s,b]=await http('GET',`/rest/v1/organization_licenses?organization_id=eq.${org}`,undefined,tokens.caregiver);
    expect(s).toBe(200);expect(b).toEqual([]);
    expect(sql(`SELECT has_function_privilege('anon','hcn_private.current_staff_patient_v1(uuid,uuid,text)','execute');`)).toBe('f');
  });
  it('stamps patient and caregiver with independent immutable authors and correct shared scope',async()=>{
    const [ps,p]=await mood(tokens.patient,{entry_source:'patient_reported',created_at:'2000-01-01T00:00:00Z'});
    const [cs,c]=await mood(tokens.caregiver,{entry_source:'caregiver_observed'});
    expect(ps).toBe(201);expect(cs).toBe(201);
    const patient=(p as Array<Record<string,unknown>>)[0],carer=(c as Array<Record<string,unknown>>)[0];
    expect(patient).toMatchObject({author_user_id:ids.patient,author_role:'patient',entry_source:'patient_reported',organization_id:org});
    expect(carer).toMatchObject({author_user_id:ids.caregiver,author_role:'caregiver',entry_source:'caregiver_observed',organization_id:org});
    expect(String(patient.created_at)).not.toContain('2000-01-01');
    const pRows=await getRows('mood_entries',tokens.patient),cRows=await getRows('mood_entries',tokens.caregiver);
    for(const row of [patient,carer]){expect(pRows.some(r=>r.id===row.id)).toBe(true);expect(cRows.some(r=>r.id===row.id)).toBe(true);}
    expect(await getRows('mood_entries',tokens.outsider)).toHaveLength(0);
    expect(await getRows('mood_entries',tokens.otherPatient)).toHaveLength(0);
  });
  it('rejects patient/staff impersonation, foreign scope and unassigned writes without persisted rows',async()=>{
    const before=sql(`SELECT count(*) FROM mood_entries WHERE patient_id='${ids.patient}';`);
    for(const [token,payload] of [
      [tokens.caregiver,{author_user_id:ids.patient,entry_source:'patient_reported'}],
      [tokens.patient,{author_role:'caregiver',entry_source:'caregiver_observed'}],
      [tokens.caregiver,{organization_id:otherOrg}],
      [tokens.outsider,{}],
    ] as Array<[string,Record<string,unknown>]>){const [status]=await mood(token,payload);expect([401,403]).toContain(status);}
    expect(sql(`SELECT count(*) FROM mood_entries WHERE patient_id='${ids.patient}';`)).toBe(before);
  });
  it('rejects UPDATE and UPSERT provenance changes, preserving original content and history',async()=>{
    const [created,body]=await mood(tokens.caregiver,{entry_source:'caregiver_observed'});expect(created).toBe(201);
    const row=(body as Array<Record<string,unknown>>)[0];
    const snapshot=sql(`SELECT row_to_json(mood_entries)::text FROM mood_entries WHERE id='${row.id}';`);
    // Independently exercise the invariant trigger, not just the lack of an
    // ordinary-user UPDATE policy. This is not an ordinary-user permission proof.
    expect(()=>sql(`UPDATE mood_entries SET author_user_id='${ids.patient}',author_role='patient',entry_source='patient_reported' WHERE id='${row.id}';`)).toThrow('append-only');
    for(const token of [tokens.patient,tokens.caregiver]){
      await http('PATCH',`/rest/v1/mood_entries?id=eq.${row.id}`,{author_user_id:ids.patient,patient_id:ids.otherPatient,organization_id:otherOrg,recorded_by:'Patient',created_at:'2000-01-01'},token);
      // POST to an existing PK exercises the conflict path; PostgREST update
      // upsert is separately tested below with its actual merge preference.
      const response=await fetch(`${process.env.MMA_TEST_API_BASE}/rest/v1/mood_entries`,{
        method:'POST',headers:{apikey:(await import('./_runtime')).ANON,Authorization:`Bearer ${token}`,
          'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({id:row.id,patient_id:ids.patient,organization_id:org,mood:'happy',intensity:6,recorded_by:'forged'})});
      expect([401,403]).toContain(response.status);
      expect(sql(`SELECT row_to_json(mood_entries)::text FROM mood_entries WHERE id='${row.id}';`)).toBe(snapshot);
    }
    const [revisionStatus,revisionBody]=await mood(tokens.caregiver,{supersedes_entry_id:row.id,entry_source:'caregiver_observed'});
    expect(revisionStatus).toBe(201);expect((revisionBody as Array<Record<string,unknown>>)[0].supersedes_entry_id).toBe(row.id);
    expect((await mood(tokens.patient,{supersedes_entry_id:row.id}))[0]).toBe(403);
    expect(sql(`SELECT row_to_json(mood_entries)::text FROM mood_entries WHERE id='${row.id}';`)).toBe(snapshot);
  });
  it('denies wellness writes after membership revocation using old and fresh tokens',async()=>{
    sql(`UPDATE organization_memberships SET status='revoked' WHERE organization_id='${org}' AND user_id='${ids.caregiver}';`);
    expect((await mood(tokens.caregiver))[0]).toBe(403);
    expect((await mood(await login(mail('caregiver'),pw)))[0]).toBe(403);
  });
  it('authoring RPCs reject a mismatched assignment role and do not persist receipts/escalations',async()=>{
    sql(`UPDATE staff_patient_assignments SET org_role='therapist' WHERE organization_id='${org}';`);
    const before=sql(`SELECT row_to_json(a)::text FROM hcn_previsit_acknowledgments a WHERE visit_id='${visit}';
      SELECT count(*) FROM hcn_care_escalations WHERE organization_id='${org}';`);
    expect((await rpc('hcn_acknowledge_previsit',{p_visit_id:visit,p_sections:['patient_updates','care_plan','medications','healthcare_contacts','handoffs'],p_attestation:'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.'},tokens.caregiver))[0]).toBe(403);
    expect((await rpc('hcn_submit_care_escalation',{p_org_id:org,p_patient_id:ids.patient,p_reason:'Synthetic authorized workflow test',p_urgency:'routine'},tokens.caregiver))[0]).toBe(403);
    expect(sql(`SELECT row_to_json(a)::text FROM hcn_previsit_acknowledgments a WHERE visit_id='${visit}';
      SELECT count(*) FROM hcn_care_escalations WHERE organization_id='${org}';`)).toBe(before);
  });
  it('does not share organization-authored wellness across two organizations covering the same patient',async()=>{
    sql(`INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES('${otherOrg}','${ids.patient}','active');
      INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active)
        VALUES('${otherOrg}','${ids.outsider}','${ids.patient}','caregiver',true);`);
    const [aStatus,aBody]=await mood(tokens.caregiver,{entry_source:'caregiver_observed'});expect(aStatus).toBe(201);
    const aId=(aBody as Array<Record<string,unknown>>)[0].id;
    expect((await getRows('covered_patient_memberships',tokens.caregiver)).map(r=>r.organization_id)).toEqual([org]);
    expect((await getRows('covered_patient_memberships',tokens.outsider)).map(r=>r.organization_id)).toEqual([otherOrg]);
    expect((await getRows('mood_entries',tokens.outsider)).some(r=>r.id===aId)).toBe(false);
    const [bStatus,bBody]=await mood(tokens.outsider,{organization_id:otherOrg,entry_source:'caregiver_observed'});expect(bStatus).toBe(201);
    const bId=(bBody as Array<Record<string,unknown>>)[0].id;
    expect((await getRows('mood_entries',tokens.caregiver)).some(r=>r.id===bId)).toBe(false);
    const patientRows=await getRows('mood_entries',tokens.patient);
    expect(patientRows.some(r=>r.id===aId)).toBe(true);expect(patientRows.some(r=>r.id===bId)).toBe(true);
  });
  it('the database constraint rejects an unattributed verified source independently of the stamping trigger',()=>{
    // PostgreSQL LIKE copies constraints, not triggers. This isolates CHECK's
    // NULL semantics without disabling any production/app-table enforcement.
    expect(()=>sql(`BEGIN; CREATE TEMP TABLE provenance_probe (LIKE public.mood_entries INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
      INSERT INTO provenance_probe(patient_id,mood,intensity,recorded_by,author_user_id,author_role,entry_source)
      VALUES('${ids.patient}','calm',5,'Probe','${ids.caregiver}',NULL,'caregiver_observed'); ROLLBACK;`)).toThrow('hcn_wellness_provenance_v1');
    expect(sql(`BEGIN; CREATE TEMP TABLE provenance_probe (LIKE public.mood_entries INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
      INSERT INTO provenance_probe(patient_id,mood,intensity,recorded_by) VALUES('${ids.patient}','calm',5,'Historical probe');
      SELECT count(*) FROM provenance_probe; ROLLBACK;`)).toBe('1');
  });
});
