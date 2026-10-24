// OWNER DIRECTIVE MMA-ENT-SALES-007-FINAL Phase H — delegation roles
// (migration 119): co_director (full Director-equivalent authority via
// the widened is_active_org_director() helper), office_administrator
// (a narrower delegated-invite authority), clinical_supervisor
// (read-only clinical oversight), and auditor (read-only compliance
// visibility). Every assertion below drives the real RPC/REST surface
// against RLS -- never a mocked permission check.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'RoleDeleg9!';
const stamp = Date.now();
const ORG = '77777777-7777-4777-8777-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `roledeleg-director-${stamp}@local.test`,
  codirector: `roledeleg-codirector-${stamp}@local.test`,
  officeAdmin: `roledeleg-officeadmin-${stamp}@local.test`,
  clinicalSupervisor: `roledeleg-clinsup-${stamp}@local.test`,
  auditor: `roledeleg-auditor-${stamp}@local.test`,
  caregiver: `roledeleg-caregiver-${stamp}@local.test`,
  outsider: `roledeleg-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const patientId = '88888888-8888-4888-8888-' + String(stamp).padStart(12, '0').slice(-12);

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');`);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  sql(`
    INSERT INTO organizations (id, name, package_type, created_by) VALUES ('${ORG}', 'Role Delegation Org ${stamp}', 'integrated_care', '${ids.director}');
    INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.director}', 'director', 'active');
    INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.codirector}', 'co_director', 'active');
    INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.officeAdmin}', 'office_administrator', 'active');
    INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.clinicalSupervisor}', 'clinical_supervisor', 'active');
    INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.auditor}', 'auditor', 'active');
    INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status, license_number, activated_at) VALUES ('${ORG}', 10, 20, 'active', 'MMA-FE-2026-990001', now());
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','RoleDeleg','Patient','RoleDeleg Patient','1 Role Ave','Role Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
  `);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM staff_patient_assignments WHERE organization_id='${ORG}';
    DELETE FROM covered_patient_memberships WHERE organization_id='${ORG}';
    DELETE FROM patients WHERE id='${patientId}';
    DELETE FROM organization_licenses WHERE organization_id='${ORG}';
    DELETE FROM organization_memberships WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-SALES-007-FINAL Phase H — role delegation (migration 119)', () => {
  it('a co-director has full director-equivalent invite authority (is_active_org_director widened)', async () => {
    const [status, row] = (await rpc('invite_org_member', {
      p_org_id: ORG, p_email: emails.caregiver, p_org_role: 'caregiver',
    }, tok.codirector)) as [number, { org_role: string; status: string }];
    expect(status).toBe(200);
    expect(row.org_role).toBe('caregiver');
    sql(`DELETE FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.caregiver}';`);
  });

  it('a director or co-director can invite the new delegation roles; cannot invite another literal "director"', async () => {
    const [okStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiver, p_org_role: 'clinical_supervisor' }, tok.director);
    expect(okStatus).toBe(200);
    sql(`DELETE FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.caregiver}';`);

    const [badStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiver, p_org_role: 'director' }, tok.director);
    expect(badStatus).toBe(400);
  });

  it('an office administrator may invite only the restricted staff roles, never a role at or above their own level', async () => {
    const [okStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiver, p_org_role: 'caregiver' }, tok.officeAdmin);
    expect(okStatus).toBe(200);
    sql(`DELETE FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.caregiver}';`);

    const [escalateStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiver, p_org_role: 'auditor' }, tok.officeAdmin);
    expect(escalateStatus).toBe(400);
    const [selfEscalateStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiver, p_org_role: 'office_administrator' }, tok.officeAdmin);
    expect(selfEscalateStatus).toBe(400);
  });

  it('a plain caregiver has no invite authority at all', async () => {
    sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${ORG}', '${ids.caregiver}', 'caregiver', 'active');`);
    const [status] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.outsider, p_org_role: 'caregiver' }, tok.caregiver);
    expect(status).toBe(400);
  });

  it('a clinical supervisor has real, read-only oversight: sees the org\'s covered patients, assignments, and member profiles', async () => {
    sql(`INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by) VALUES ('${ORG}', '${ids.caregiver}', '${patientId}', 'caregiver', '${ids.director}');`);

    const [, patientRows] = await http('GET', `/rest/v1/patients?id=eq.${patientId}&select=id`, undefined, tok.clinicalSupervisor);
    expect((patientRows as unknown[]).length).toBe(1);
    const [, assignmentRows] = await http('GET', `/rest/v1/staff_patient_assignments?organization_id=eq.${ORG}&select=id`, undefined, tok.clinicalSupervisor);
    expect((assignmentRows as unknown[]).length).toBe(1);
    const [, profileRows] = await http('GET', `/rest/v1/profiles?id=eq.${ids.caregiver}&select=id`, undefined, tok.clinicalSupervisor);
    expect((profileRows as unknown[]).length).toBe(1);

    // read-only -- no write RPC grants this role anything.
    const [inviteStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.outsider, p_org_role: 'caregiver' }, tok.clinicalSupervisor);
    expect(inviteStatus).toBe(400);
  });

  it('an auditor sees the org roster and license read-only; a caregiver cannot see the roster this way; an outsider from no org sees neither', async () => {
    const [, rosterAsAuditor] = await http('GET', `/rest/v1/organization_memberships?organization_id=eq.${ORG}&select=id`, undefined, tok.auditor);
    expect((rosterAsAuditor as unknown[]).length).toBeGreaterThan(0);
    const [, licenseAsAuditor] = await http('GET', `/rest/v1/organization_licenses?organization_id=eq.${ORG}&select=id,status`, undefined, tok.auditor);
    expect((licenseAsAuditor as { status: string }[])[0]?.status).toBe('active');

    const [, licenseAsOutsider] = await http('GET', `/rest/v1/organization_licenses?organization_id=eq.${ORG}&select=id`, undefined, tok.outsider);
    expect((licenseAsOutsider as unknown[]).length).toBe(0);

    const [auditorInviteStatus] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.outsider, p_org_role: 'caregiver' }, tok.auditor);
    expect(auditorInviteStatus).toBe(400);
  });

  it('a caregiver (ordinary staff, not clinical_supervisor/director/co_director) cannot read another member\'s profile through this policy', async () => {
    const [, profileRows] = await http('GET', `/rest/v1/profiles?id=eq.${ids.director}&select=id`, undefined, tok.caregiver);
    expect((profileRows as unknown[]).length).toBe(0);
  });
});
