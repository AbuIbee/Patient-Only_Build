// HCN Master 28 independent Owner approval: disposable synthetic accounts only.
import { describe, it, expect } from 'vitest';
import { authSignUp, authDeleteUser, login, rpc, sql } from './_runtime';
const PW='OfficeApproval28!pass';
const stamp=Date.now();
const q=(s:string)=>"'" + s.replace(/'/g,"''") + "'";

describe('HCN Master #28 Director Office Ownership request reviews',()=>{
  it('records independent approval without granting extra roles or allowing same-user decisions',async()=>{
    const users:string[]=[]; let org='', dualOrg='';
    try{
      const emails=['owner','director','dual'].map(r=>'m28-'+r+'-'+stamp+'@local.test');
      for(const e of emails)users.push(await authSignUp(e,PW));
      sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id IN ("+users.map(q).join(',')+");");
      org=sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+q('M28 Office '+stamp)+",'integrated_care',"+q(users[0])+") RETURNING id;");
      dualOrg=sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+q('M28 Dual '+stamp)+",'integrated_care',"+q(users[2])+") RETURNING id;");
      sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES("+
        q(org)+",10,10,399,'active'),("+q(dualOrg)+",10,10,399,'active');"+
        "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES"+
        "("+q(org)+","+q(users[1])+",'director','active'),"+
        "("+q(dualOrg)+","+q(users[2])+",'director','active');");
      const toks=await Promise.all(emails.map(e=>login(e,PW)));
      const args={p_org:org,p_capability:'caregiver',p_reason:'Require caregiver office for backup coverage'};
      const [requestCode,request]=await rpc('hcn_request_director_office',args,toks[1]);
      expect(requestCode,JSON.stringify(request)).toBe(200);
      const requestId=(request as {id:string}).id;
      const [dupCode,duplicate]=await rpc('hcn_request_director_office',args,toks[1]);
      expect(dupCode).toBe(200);
      expect((duplicate as {id:string}).id).toBe(requestId);
      const [selfReview]=await rpc('hcn_decide_director_office_request',{
        p_request_id:requestId,p_approve:true,p_note:'Self approval forbidden'
      },toks[1]);
      expect(selfReview).toBeGreaterThanOrEqual(400);
      const [ownerReview,reviewed]=await rpc('hcn_decide_director_office_request',{
        p_request_id:requestId,p_approve:true,p_note:'Approved for coverage but not effective until authorization engine activation'
      },toks[0]);
      expect(ownerReview,JSON.stringify(reviewed)).toBe(200);
      expect((reviewed as {status:string}).status).toBe('approved');
      expect(sql("SELECT count(*) FROM organization_memberships WHERE organization_id="+q(org)+
        " AND user_id="+q(users[1])+" AND org_role='caregiver';")).toBe('0');
      expect(sql("SELECT count(*) FROM organization_owner_capability_grants WHERE organization_id="+q(org)+
        " AND user_id="+q(users[1])+" AND capability='caregiver';")).toBe('0');

      const [dualRequestCode,dualRequest]=await rpc('hcn_request_director_office',{
        p_org:dualOrg,p_capability:'caregiver',p_reason:'Require caregiver office to cover shifts'
      },toks[2]);
      expect(dualRequestCode,JSON.stringify(dualRequest)).toBe(200);
      const [dualApproval]=await rpc('hcn_decide_director_office_request',{
        p_request_id:(dualRequest as {id:string}).id,p_approve:true,p_note:'I attempt to approve myself'
      },toks[2]);
      expect(dualApproval).toBeGreaterThanOrEqual(400);
      const [legacyBypass]=await rpc('org_owner_self_assign_capability',{
        p_org_id:dualOrg,p_capability:'caregiver'
      },toks[2]);
      expect(legacyBypass).toBeGreaterThanOrEqual(400);
    } finally {
      if(org&&dualOrg){
        sql("DELETE FROM account_management_audit WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM hcn_director_office_requests WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM organization_memberships WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM organization_licenses WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM organizations WHERE id IN ("+q(org)+","+q(dualOrg)+");");
      }
      for(const id of users)await authDeleteUser(id);
    }
  });
});
