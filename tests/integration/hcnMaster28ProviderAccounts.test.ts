// Real Supabase integration test. _runtime fails closed unless an isolated
// disposable stack is explicitly configured. All actors/records are fictional.
import { describe, it, expect } from 'vitest';
import { authSignUp, authDeleteUser, login, rpc, sql } from './_runtime';

const PW = 'ProviderMaster28!Pass';
const stamp = String(Date.now());
const esc = (s: string) => s.replace(/'/g, "''");
const quoted = (s: string) => "'" + esc(s) + "'";

describe('HCN Master #28 — permanent provider authorization', () => {
  it('requires claim, independent approval and patient association; stops on revocation', async () => {
    const users: string[] = [];
    let org = '', patient = '', provider = '', thread = '';
    try {
      const emails = ['director','approver','provider','outsider'].map(
        role => 'm28-' + role + '-' + stamp + '@local.test'
      );
      for (const email of emails) users.push(await authSignUp(email,PW));
      sql('UPDATE profiles SET must_change_password=false, provisioning_status=' + quoted('complete') +
        ' WHERE id IN (' + users.map(quoted).join(',') + ');');
      org=sql('INSERT INTO organizations(name,package_type,created_by) VALUES(' +
        quoted('M28 Synthetic ' + stamp) + ",'integrated_care'," + quoted(users[0]) + ') RETURNING id;');
      patient=sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) " +
        "VALUES('Synthetic','Patient','Synthetic Person','1 Test Lane','Home') RETURNING id;");
      sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) "+
        "VALUES(" +quoted(org)+ ",10,10,399,'active');" +
        "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES" +
        "(" +quoted(org)+ ","+quoted(users[0])+",'director','active')," +
        "(" +quoted(org)+ ","+quoted(users[1])+",'co_director','active');"+
        "INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES("+
        quoted(org)+","+quoted(patient)+",'active',"+quoted(users[0])+");");
      const tokens = await Promise.all(emails.map(e=>login(e,PW)));
      const [createCode, created] = await rpc('hcn_upsert_healthcare_provider',{
        p_organization_id:org,p_provider_id:null,p_display_name:'M28 Synthetic Clinician',
        p_professional_title:'Test MD',p_specialty:'primary_care_physician',
        p_specialty_other_label:null,p_practice_name:'Synthetic Clinic',
        p_office_phone:null,p_fax_number:null,p_secure_contact_email:emails[2],
        p_office_address:null,p_professional_identifier:'TEST-NPI-001',
        p_credentials:'Synthetic test credentials',p_expected_version:null,
      },tokens[0]);
      expect(createCode,JSON.stringify(created)).toBe(200);
      provider=(created as {id:string}).id;

      const [wrongClaim] = await rpc('hcn_claim_provider_account',{p_provider_id:provider},tokens[3]);
      expect(wrongClaim).toBeGreaterThanOrEqual(400);
      const [claim,claimBody] = await rpc('hcn_claim_provider_account',{p_provider_id:provider},tokens[2]);
      expect(claim,JSON.stringify(claimBody)).toBe(200);
      expect((claimBody as {status:string}).status).toBe('pending');

      const [premature] = await rpc('hcn_open_provider_thread',
        {p_org:org,p_patient:patient,p_provider:provider},tokens[0]);
      expect(premature).toBeGreaterThanOrEqual(400);
      const [selfApproval] = await rpc('hcn_decide_provider_account',
        {p_provider_id:provider,p_approve:true,p_evidence_note:'Synthetic verification proof'},tokens[2]);
      expect(selfApproval).toBeGreaterThanOrEqual(400);
      const [approved,account] = await rpc('hcn_decide_provider_account',{
        p_provider_id:provider,p_approve:true,
        p_evidence_note:'Synthetic provider credentials independently verified by co-Director',
      },tokens[1]);
      expect(approved,JSON.stringify(account)).toBe(200);
      const [notAssociated] = await rpc('hcn_open_provider_thread',
        {p_org:org,p_patient:patient,p_provider:provider},tokens[0]);
      expect(notAssociated).toBeGreaterThanOrEqual(400);
      const [associated] = await rpc('hcn_associate_provider_with_patient',
        {p_patient_id:patient,p_provider_id:provider,p_relationship_note:'Synthetic association'},tokens[0]);
      expect(associated).toBe(200);

      const [opened,threadRow] = await rpc('hcn_open_provider_thread',
        {p_org:org,p_patient:patient,p_provider:provider},tokens[0]);
      expect(opened,JSON.stringify(threadRow)).toBe(200);
      thread=(threadRow as {id:string}).id;
      const messages = [
        [tokens[0],'Director request','aeb2a4af-a1fe-49ce-95f5-76c97b7243e1'],
        [tokens[2],'Provider reply without a new code','c2ca8c69-1ee6-4d69-83a1-c57ef8bb2ed8'],
        [tokens[0],'Director followup','b1ff98b5-e3d4-4920-a3e0-6a1803d3ae52'],
      ];
      for(const [token,body,id] of messages){
        const [status,response] = await rpc('hcn_post_provider_message',
          {p_thread_id:thread,p_message:body,p_client_message_id:id},token);
        expect(status,JSON.stringify(response)).toBe(200);
      }
      const [readCode,received] = await rpc('hcn_list_provider_messages',
        {p_thread_id:thread},tokens[2]);
      expect(readCode).toBe(200);
      expect((received as unknown[]).length).toBe(3);
      const [wrongRead] = await rpc('hcn_list_provider_messages',{p_thread_id:thread},tokens[3]);
      expect(wrongRead).toBeGreaterThanOrEqual(400);

      // A Director cannot bypass Owner Office approval by claiming an external
      // provider account under the Director's own email.
      const [selfProviderCode,selfProvider] = await rpc('hcn_upsert_healthcare_provider',{
        p_organization_id:org,p_provider_id:null,p_display_name:'M28 Director Self-Claim',
        p_professional_title:'Synthetic Director',p_specialty:'primary_care_physician',
        p_specialty_other_label:null,p_practice_name:'Synthetic Clinic',
        p_office_phone:null,p_fax_number:null,p_secure_contact_email:emails[0],
        p_office_address:null,p_professional_identifier:'TEST-SELF-001',
        p_credentials:'Synthetic self-claim',p_expected_version:null,
      },tokens[0]);
      expect(selfProviderCode,JSON.stringify(selfProvider)).toBe(200);
      const selfProviderId=(selfProvider as {id:string}).id;
      const [selfClaimCode] = await rpc('hcn_claim_provider_account',{
        p_provider_id:selfProviderId,
      },tokens[0]);
      expect(selfClaimCode).toBe(200);
      const [bypassApproval] = await rpc('hcn_decide_provider_account',{
        p_provider_id:selfProviderId,p_approve:true,
        p_evidence_note:'Another Director attempts to grant clinical office access',
      },tokens[1]);
      expect(bypassApproval).toBeGreaterThanOrEqual(400);

      sql('UPDATE hcn_provider_accounts SET status=' +quoted('revoked')+
        ' WHERE provider_id='+quoted(provider)+';');
      const [revokedRead] = await rpc('hcn_list_provider_messages',{p_thread_id:thread},tokens[2]);
      expect(revokedRead).toBeGreaterThanOrEqual(400);
    } finally {
      if(thread)sql('DELETE FROM hcn_provider_messages WHERE thread_id='+quoted(thread)+';'+
        'DELETE FROM hcn_provider_threads WHERE id='+quoted(thread)+';');
      if(org)sql('DELETE FROM hcn_provider_accounts WHERE organization_id='+quoted(org)+';'+
        'DELETE FROM hcn_patient_provider_associations WHERE organization_id='+quoted(org)+';'+
        'DELETE FROM hcn_healthcare_providers WHERE organization_id='+quoted(org)+';');
      if(org)sql('DELETE FROM covered_patient_memberships WHERE organization_id='+quoted(org)+';'+
        'DELETE FROM organization_memberships WHERE organization_id='+quoted(org)+';'+
        'DELETE FROM organization_licenses WHERE organization_id='+quoted(org)+';'+
        'DELETE FROM organizations WHERE id='+quoted(org)+';');
      if(patient)sql('DELETE FROM patients WHERE id='+quoted(patient)+';');
      for(const id of users)await authDeleteUser(id);
    }
  });
});
