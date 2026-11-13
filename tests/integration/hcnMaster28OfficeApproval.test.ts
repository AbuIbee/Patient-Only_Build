// Master #28: independent Owner approval must confer only a precisely
// scoped secondary office, without rewriting the primary Director membership.
// All users, orgs, patients and license numbers below are disposable fixtures.
import { describe, it, expect } from 'vitest';
import { authSignUp, authDeleteUser, login, rpc, sql } from './_runtime';
const PW = 'OfficeApproval28!pass';
const stamp = Date.now();
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";

describe('HCN Master #28 — active Director secondary office grants', () => {
  it('independent approval activates only assigned caregiver office; revocation immediately removes it', async () => {
    const users: string[] = [];
    let org = '', dualOrg = '', patient = '', otherPatient = '';
    try {
      const emails = ['owner','director','dual'].map(x => 'm28-' + x + '-' + stamp + '@local.test');
      for (const email of emails) users.push(await authSignUp(email, PW));
      sql("UPDATE profiles SET must_change_password=false,provisioning_status='complete' WHERE id IN ("+users.map(q).join(',')+");");
      org = sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+
        q('M28 Office '+stamp)+",'integrated_care',"+q(users[0])+") RETURNING id;");
      dualOrg = sql("INSERT INTO organizations(name,package_type,created_by) VALUES("+
        q('M28 Dual '+stamp)+",'integrated_care',"+q(users[2])+") RETURNING id;");
      patient = sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) "+
        "VALUES('Synthetic','Test','Synthetic Assigned Patient','1 Fake Avenue','Home') RETURNING id;");
      otherPatient = sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) "+
        "VALUES('Synthetic','Other','Synthetic Unassigned Patient','2 Fake Avenue','Home') RETURNING id;");
      sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number,license_tier_code,specialist_slot_count) VALUES"+
        "("+q(org)+",10,10,399,'active',"+q('M28-OFF-'+stamp)+",'essential',0),"+
        "("+q(dualOrg)+",10,10,399,'active',"+q('M28-DUAL-'+stamp)+",'essential',0);"+
        "INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES"+
        "("+q(org)+","+q(users[1])+",'director','active'),"+
        "("+q(dualOrg)+","+q(users[2])+",'director','active');"+
        "INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES"+
        "("+q(org)+","+q(patient)+",'active',"+q(users[0])+"),"+
        "("+q(org)+","+q(otherPatient)+",'active',"+q(users[0])+");");
      const [ownerToken,directorToken,dualToken] = await Promise.all(emails.map(e=>login(e,PW)));
      const [requestCode,request] = await rpc('hcn_request_director_office',{
        p_org:org,p_capability:'caregiver',p_reason:'Caregiver coverage during staffing gaps',
      },directorToken);
      expect(requestCode,JSON.stringify(request)).toBe(200);
      const requestId=(request as {id:string}).id;
      const [repeatCode,repeat] = await rpc('hcn_request_director_office',{
        p_org:org,p_capability:'caregiver',p_reason:'Caregiver coverage during staffing gaps',
      },directorToken);
      expect(repeatCode).toBe(200);
      expect((repeat as {id:string}).id).toBe(requestId);
      const [beforeOffice, beforeRoles] = await rpc('get_my_organizations',{},directorToken);
      expect(beforeOffice).toBe(200);
      expect((beforeRoles as {org_role:string}[]).map(x=>x.org_role)).toContain('director');
      expect((beforeRoles as {org_role:string}[]).map(x=>x.org_role)).not.toContain('caregiver');
      const [preAssign] = await rpc('assign_staff_to_patient',{
        p_org_id:org,p_user_id:users[1],p_patient_id:patient,p_org_role:'caregiver',
      },directorToken);
      expect(preAssign).toBeGreaterThanOrEqual(400);
      const [selfReview] = await rpc('hcn_decide_director_office_request',{
        p_request_id:requestId,p_approve:true,p_note:'Not permitted to approve own request',
      },directorToken);
      expect(selfReview).toBeGreaterThanOrEqual(400);

      const [decisionCode,decision] = await rpc('hcn_decide_director_office_request',{
        p_request_id:requestId,p_approve:true,
        p_note:'Independent Owner authorizes caregiver office after role check',
      },ownerToken);
      expect(decisionCode,JSON.stringify(decision)).toBe(200);
      expect((decision as {status:string}).status).toBe('approved');
      expect(sql("SELECT count(*) FROM hcn_director_office_grants WHERE "+
        "organization_id="+q(org)+" AND user_id="+q(users[1])+
        " AND capability='caregiver' AND status='active';")).toBe('1');
      // Original membership is never overwritten or duplicated.
      expect(sql("SELECT org_role FROM organization_memberships WHERE "+
        "organization_id="+q(org)+" AND user_id="+q(users[1])+";")).toBe('director');
      const [roleStatus,roleList]=await rpc('get_my_organizations',{},directorToken);
      expect(roleStatus).toBe(200);
      expect((roleList as {org_role:string}[]).map(x=>x.org_role)).toEqual(
        expect.arrayContaining(['director','caregiver'])
      );
      const [assignedCode,assigned] = await rpc('assign_staff_to_patient',{
        p_org_id:org,p_user_id:users[1],p_patient_id:patient,p_org_role:'caregiver',
      },directorToken);
      expect(assignedCode,JSON.stringify(assigned)).toBe(200);
      const [listStatus,staffPatients] = await rpc('get_my_staff_patients',{},directorToken);
      expect(listStatus,JSON.stringify(staffPatients)).toBe(200);
      const caregiverPatients = (staffPatients as {patient_id:string;org_role:string}[])
        .filter(x=>x.org_role==='caregiver' && x.patient_id===patient);
      expect(caregiverPatients).toHaveLength(1);
      expect((staffPatients as {patient_id:string;org_role:string}[])
        .some(x=>x.patient_id===otherPatient && x.org_role==='caregiver')).toBe(false);

      // Approval does not bypass specialist license/credential checks.
      const [specReqCode,specReq] = await rpc('hcn_request_director_office',{
        p_org:org,p_capability:'therapist',p_reason:'Request specialist office for future service',
      },directorToken);
      expect(specReqCode).toBe(200);
      const [invalidSpecialist] = await rpc('hcn_decide_director_office_request',{
        p_request_id:(specReq as {id:string}).id,p_approve:true,
        p_note:'Attempted specialist approval without verified credential',
      },ownerToken);
      expect(invalidSpecialist).toBeGreaterThanOrEqual(400);

      // Revoking just the secondary office removes its own session authority,
      // but leaves the Director's primary office intact.
      const [revokedStatus] = await rpc('hcn_revoke_director_office_grant',{
        p_org:org,p_user:users[1],p_capability:'caregiver',
        p_reason:'Synthetic completed coverage test: revoke access',
      },ownerToken);
      expect(revokedStatus).toBe(200);
      const [afterOffice, afterRoles]=await rpc('get_my_organizations',{},directorToken);
      expect(afterOffice).toBe(200);
      expect((afterRoles as {org_role:string}[]).map(x=>x.org_role)).toContain('director');
      expect((afterRoles as {org_role:string}[]).map(x=>x.org_role)).not.toContain('caregiver');
      const [afterPatients,postRevokePatients] = await rpc('get_my_staff_patients',{},directorToken);
      expect(afterPatients).toBe(200);
      expect((postRevokePatients as {patient_id:string;org_role:string}[])
        .some(x=>x.patient_id===patient && x.org_role==='caregiver')).toBe(false);

      const [dualRequestCode,dualRequest]=await rpc('hcn_request_director_office',{
        p_org:dualOrg,p_capability:'caregiver',p_reason:'Require caregiver office to cover shifts',
      },dualToken);
      expect(dualRequestCode).toBe(200);
      const [dualApproval]=await rpc('hcn_decide_director_office_request',{
        p_request_id:(dualRequest as {id:string}).id,p_approve:true,
        p_note:'Attempted same-person Owner and Director approval',
      },dualToken);
      expect(dualApproval).toBeGreaterThanOrEqual(400);
      const [legacyBypass]=await rpc('org_owner_self_assign_capability',{
        p_org_id:dualOrg,p_capability:'caregiver',
      },dualToken);
      expect(legacyBypass).toBeGreaterThanOrEqual(400);
      expect(sql("SELECT count(*) FROM hcn_director_office_grants WHERE "+
        "organization_id="+q(dualOrg)+";")).toBe('0');
    } finally {
      if(org && dualOrg) {
        sql("DELETE FROM account_management_audit WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM staff_patient_assignments WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM hcn_director_office_grants WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM hcn_director_office_requests WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM covered_patient_memberships WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM organization_memberships WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM organization_licenses WHERE organization_id IN ("+q(org)+","+q(dualOrg)+");"+
          "DELETE FROM organizations WHERE id IN ("+q(org)+","+q(dualOrg)+");");
      }
      if(patient && otherPatient)sql("DELETE FROM patients WHERE id IN ("+q(patient)+","+q(otherPatient)+");");
      for(const id of users)await authDeleteUser(id);
    }
  });
});
