// MMA-ENT-CAREGIVER-MASTER-004, D01 (P1) — "Alpha header, Alpha/Beta
// patient cards, no switcher." EnterpriseCaregiverDashboard.tsx
// previously picked orgs.find(o => o.orgRole === 'caregiver') once and
// never again, while getMyStaffPatients() (entirely unscoped by
// organization) fed every list regardless of which org a given
// (org, patient) relationship actually belonged to.
//
// The frontend fix (explicit myOrgs/orgId selection, patients derived
// per-org, deep-link/refresh resolution) is covered by real browser
// verification. This file covers the BACKEND data this session depends
// on: get_my_organizations()/get_my_staff_patients() must correctly
// report two distinct memberships, preserve a patient's two separate
// (org, patient) relationships, and immediately stop returning a
// revoked organization or a revoked patient assignment — the exact
// "revocation of a single organization membership" / "revocation of
// patient assignment" scenarios named in the audit.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'D01Isolation9!';
const stamp = Date.now();
const ORG_A = 'd1aaaaaa-1111-4aaa-8aaa-111111111111';
const ORG_B = 'd1bbbbbb-2222-4bbb-8bbb-222222222222';

const caregiverEmail = `d01iso-caregiver-${stamp}@local.test`;
const ids: Record<string, string> = {};
let caregiverId: string;
let caregiverTok: string;
let patientAId: string;
let patientBId: string;
let sharedPatientId: string;

beforeAll(async () => {
  caregiverId = await authSignUp(caregiverEmail, PW);
  patientAId = await authSignUp(`d01iso-patientA-${stamp}@local.test`, PW);
  patientBId = await authSignUp(`d01iso-patientB-${stamp}@local.test`, PW);
  sharedPatientId = await authSignUp(`d01iso-shared-${stamp}@local.test`, PW);
  ids.caregiver = caregiverId; ids.patientA = patientAId; ids.patientB = patientBId; ids.shared = sharedPatientId;

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','D01 Isolation Org A','integrated_care','${caregiverId}'),
      ('${ORG_B}','D01 Isolation Org B','integrated_care','${caregiverId}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',20,20,9999,'active'),('${ORG_B}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${caregiverId}','caregiver','active'),
      ('${ORG_B}','${caregiverId}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${patientAId}','D01IsoA','Patient','D01 Iso A Patient','1 A Ave','A Facility'),
      ('${patientBId}','D01IsoB','Patient','D01 Iso B Patient','1 B Ave','B Facility'),
      ('${sharedPatientId}','D01IsoShared','Patient','D01 Iso Shared Patient','1 Shared Ave','Shared Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES
      ('${ORG_A}','${patientAId}','active','${caregiverId}'),
      ('${ORG_B}','${patientBId}','active','${caregiverId}'),
      ('${ORG_A}','${sharedPatientId}','active','${caregiverId}'),
      ('${ORG_B}','${sharedPatientId}','active','${caregiverId}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG_A}','${caregiverId}','${patientAId}','caregiver',true,'${caregiverId}'),
      ('${ORG_B}','${caregiverId}','${patientBId}','caregiver',true,'${caregiverId}'),
      ('${ORG_A}','${caregiverId}','${sharedPatientId}','caregiver',true,'${caregiverId}'),
      ('${ORG_B}','${caregiverId}','${sharedPatientId}','caregiver',true,'${caregiverId}');
    COMMIT;
  `);
  caregiverTok = await login(caregiverEmail, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.account_management_audit WHERE organization_id IN ('${ORG_A}','${ORG_B}');`);
  sql(`DELETE FROM public.patients WHERE id IN ('${patientAId}','${patientBId}','${sharedPatientId}'); DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-CAREGIVER-MASTER-004 D01 (P1) — organization isolation backend data', () => {
  it('get_my_organizations() reports both distinct active caregiver memberships', async () => {
    const [status, orgs] = (await rpc('get_my_organizations', {}, caregiverTok)) as [number, { organization_id: string; org_role: string }[]];
    expect(status).toBe(200);
    const orgIds = orgs.filter((o) => o.org_role === 'caregiver').map((o) => o.organization_id);
    expect(orgIds).toContain(ORG_A);
    expect(orgIds).toContain(ORG_B);
  });

  it('get_my_staff_patients() preserves the shared patient as TWO distinct (org, patient) rows, each with its own organization_id', async () => {
    const [status, rows] = (await rpc('get_my_staff_patients', {}, caregiverTok)) as [number, { organization_id: string; patient_id: string }[]];
    expect(status).toBe(200);
    const sharedRows = rows.filter((r) => r.patient_id === sharedPatientId);
    expect(sharedRows).toHaveLength(2);
    expect(sharedRows.map((r) => r.organization_id).sort()).toEqual([ORG_A, ORG_B].sort());

    // Org-only patients appear exactly once, under the correct org.
    expect(rows.filter((r) => r.patient_id === patientAId)).toEqual([expect.objectContaining({ organization_id: ORG_A, patient_id: patientAId })]);
    expect(rows.filter((r) => r.patient_id === patientBId)).toEqual([expect.objectContaining({ organization_id: ORG_B, patient_id: patientBId })]);
  });

  it('revoking the Org B membership (remove_org_member, the real director path) immediately drops Org B from both RPCs, leaving Org A and the shared patient\'s Org A relationship intact', async () => {
    // Need a director to call remove_org_member -- promote a throwaway director in Org B.
    const directorEmail = `d01iso-director-${stamp}@local.test`;
    const directorId = await authSignUp(directorEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}'; INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES ('${ORG_B}','${directorId}','director','active');`);
    const directorTok = await login(directorEmail, PW);

    try {
      const [removeStatus] = await rpc('remove_org_member', { p_org_id: ORG_B, p_user_id: caregiverId }, directorTok) as [number, unknown];
      expect(removeStatus).toBe(200);

      const [, orgsAfter] = (await rpc('get_my_organizations', {}, caregiverTok)) as [number, { organization_id: string; org_role: string }[]];
      const activeCaregiverOrgIds = orgsAfter.filter((o) => o.org_role === 'caregiver').map((o) => o.organization_id);
      expect(activeCaregiverOrgIds).not.toContain(ORG_B);
      expect(activeCaregiverOrgIds).toContain(ORG_A);

      const [, patientsAfter] = (await rpc('get_my_staff_patients', {}, caregiverTok)) as [number, { organization_id: string; patient_id: string }[]];
      expect(patientsAfter.some((r) => r.organization_id === ORG_B)).toBe(false);
      // The shared patient's Org A relationship survives Org B's revocation untouched.
      expect(patientsAfter.some((r) => r.organization_id === ORG_A && r.patient_id === sharedPatientId)).toBe(true);
      expect(patientsAfter.some((r) => r.patient_id === patientBId)).toBe(false);
    } finally {
      sql(`DELETE FROM public.account_management_audit WHERE organization_id='${ORG_B}'; DELETE FROM organization_memberships WHERE organization_id='${ORG_B}' AND user_id='${directorId}';`);
      await authDeleteUser(directorId);
      // Restore Org B membership for any subsequent test in this file.
      sql(`INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES ('${ORG_B}','${caregiverId}','caregiver','active') ON CONFLICT DO NOTHING;`);
      sql(`UPDATE organization_memberships SET status='active' WHERE organization_id='${ORG_B}' AND user_id='${caregiverId}';`);
      sql(`UPDATE staff_patient_assignments SET is_active=true WHERE organization_id='${ORG_B}' AND user_id='${caregiverId}';`);
    }
  });

  it('an entirely unrelated caregiver (no membership in either org) reading get_my_staff_patients() sees none of this fixture\'s patients -- RLS scopes by the CALLER\'s own auth.uid(), never leaking across caregivers', async () => {
    const outsiderEmail = `d01iso-outsider-${stamp}@local.test`;
    const outsiderId = await authSignUp(outsiderEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${outsiderId}';`);
    const outsiderTok = await login(outsiderEmail, PW);
    try {
      const [status, rows] = (await rpc('get_my_staff_patients', {}, outsiderTok)) as [number, { patient_id: string }[]];
      expect(status).toBe(200);
      const leakedIds = rows.map((r) => r.patient_id).filter((id) => [patientAId, patientBId, sharedPatientId].includes(id));
      expect(leakedIds).toEqual([]);
    } finally {
      await authDeleteUser(outsiderId);
    }
  });
});
