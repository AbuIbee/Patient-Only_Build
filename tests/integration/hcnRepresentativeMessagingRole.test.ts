import {randomUUID,randomBytes} from 'node:crypto';
import {it,expect} from 'vitest';
import {authSignUp,login,rpc,http,sql} from './_runtime';

it('an active proxy sends under its own identity; recipient/add paths work; revocation denies the same session',async()=>{
 const stamp=Date.now();const pw=randomBytes(24).toString('hex')+'Aa9!';
 const users=[];
 for(const role of ['director','caregiver','patient','proxy','pending']){
  const id=await authSignUp(`proxy-role-${role}-${stamp}@local.test`,pw);
  sql(`UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id='${id}';`);
  users.push({id,token:await login(`proxy-role-${role}-${stamp}@local.test`,pw)});
 }
 const [director,caregiver,patient,proxy,pending]=users;const org=randomUUID();
 sql(`INSERT INTO organizations(id,name,package_type,created_by) VALUES('${org}','Proxy role regression ${stamp}','integrated_care','${director.id}');
 INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${org}',10,10,399,'active');
 INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${org}','${director.id}','director','active'),('${org}','${caregiver.id}','caregiver','active');
 INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patient.id}','Synthetic','Proxy','Synthetic Proxy','1 Test Avenue','Home');
 INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${org}','${patient.id}','active','${director.id}');
 INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${org}','${caregiver.id}','${patient.id}','caregiver',true,'${director.id}');
 INSERT INTO patient_representatives(patient_id,organization_id,representative_user_id,legal_first_name,legal_last_name,contact_email,contact_phone,residential_address,relationship_to_patient,authorization_basis,verification_status,status,initiated_by)
 VALUES('${patient.id}','${org}','${proxy.id}','Proxy','Test','proxy@local.test','215-555-0100','1 Test Ave','daughter','fictional fixture','verified','active','${director.id}'),('${patient.id}','${org}','${pending.id}','Pending','Test','pending@local.test','215-555-0101','2 Test Ave','daughter','fictional fixture','pending_verification','pending_verification','${director.id}');`);
 const [poolStatus,pool]=await rpc('get_patient_care_circle',{p_patient_id:patient.id},caregiver.token) as [number,Array<{user_id:string}>];expect(poolStatus).toBe(200);expect(pool.some(p=>p.user_id===proxy.id)).toBe(true);expect(pool.some(p=>p.user_id===pending.id)).toBe(false);
 const [createdStatus,created]=await rpc('create_conversation',{p_patient_id:patient.id,p_recipient_user_ids:[caregiver.id],p_subject:'Proxy-authored regression'},proxy.token) as [number,{id:string}];
 expect(createdStatus,JSON.stringify(created)).toBe(200);
 const [sentStatus,sent]=await rpc('send_message',{p_conversation_id:created.id,p_body:'Fictional proxy message with own actor',p_is_urgent:false,p_reply_to_message_id:null},proxy.token) as [number,{id:string;sender_id:string}];
 expect(sentStatus,JSON.stringify(sent)).toBe(200);expect(sent.sender_id).toBe(proxy.id);expect(sent.sender_id).not.toBe(patient.id);
 const [readStatus,read]=await http('GET',`/rest/v1/messages?id=eq.${sent.id}&select=sender_id,body`,undefined,caregiver.token);
 expect(readStatus).toBe(200);expect(read).toEqual([{sender_id:proxy.id,body:'Fictional proxy message with own actor'}]);
 const [recipientStatus,recipient]=await rpc('create_conversation',{p_patient_id:patient.id,p_recipient_user_ids:[proxy.id],p_subject:'Proxy recipient regression'},caregiver.token) as [number,{id:string}];
 expect(recipientStatus,JSON.stringify(recipient)).toBe(200);
 const [baseStatus,base]=await rpc('create_conversation',{p_patient_id:patient.id,p_recipient_user_ids:[caregiver.id],p_subject:'Proxy add regression'},director.token) as [number,{id:string}];expect(baseStatus).toBe(200);
 expect((await rpc('add_conversation_participant',{p_conversation_id:base.id,p_user_id:proxy.id},director.token))[0]).toBe(200);
 expect((await rpc('create_conversation',{p_patient_id:patient.id,p_recipient_user_ids:[caregiver.id],p_subject:'Pending denied'},pending.token))[0]).toBeGreaterThanOrEqual(400);
 expect((await rpc('create_conversation',{p_patient_id:patient.id,p_recipient_user_ids:[pending.id],p_subject:'Pending recipient denied'},caregiver.token))[0]).toBeGreaterThanOrEqual(400);
 sql(`UPDATE patient_representatives SET status='revoked',revoked_by='${director.id}',revoked_at=now(),revocation_reason='isolated regression' WHERE representative_user_id='${proxy.id}' AND patient_id='${patient.id}';`);
 expect((await http('GET',`/rest/v1/messages?conversation_id=eq.${created.id}&select=id`,undefined,proxy.token))).toEqual([200,[]]);
 expect((await rpc('send_message',{p_conversation_id:created.id,p_body:'Revoked denied',p_is_urgent:false,p_reply_to_message_id:null},proxy.token))[0]).toBeGreaterThanOrEqual(400);
 const [,revokedPool]=await rpc('get_patient_care_circle',{p_patient_id:patient.id},caregiver.token) as [number,Array<{user_id:string}>];expect(revokedPool.some(p=>p.user_id===proxy.id)).toBe(false);
 // Disposable regression fixtures are retained for inspection, not production records.
});
