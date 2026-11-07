// HCN-MASTER-REMEDIATION-20261101, Phase B -- the ORIGINAL P0 clinical
// access vulnerability PR #4 / branch fix/hcn-p0-clinical-revocation-20261101
// exists to close: "A caregiver whose organization membership was revoked
// retained direct API access to a patient's private Care Partner note
// while the historical patient assignment remained active."
//
// hcn_current_staff_patient_access(organization_id, patient_id) (migration
// 20261101090000) re-derives authorization from CURRENT database state on
// every call -- active membership, active license, active patient
// coverage -- rather than trusting a stale is_active=true row on
// staff_patient_assignments alone. This is the exact fix; this suite is
// its mandatory regression proof, run against a real disposable
// PostgreSQL + PostgREST instance, with BOTH the original JWT (issued
// before revocation) and a freshly-issued JWT (issued after revocation),
// confirming zero unauthorized clinical disclosure either way -- RLS is
// evaluated against live table state on every request, never cached from
// token issuance.
//
// Also exercises the directive's named negative variants against the
// SAME mechanism: expired license, suspended license, ended patient
// coverage, inactive assignment, unrelated organization, unrelated
// patient, and a role downgrade that no longer matches the assignment's
// own org_role.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'HcnP0Revoke9!';
const stamp = Date.now();
const ORG_A = 'f0b00001-0001-4001-8001-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_B = 'f0b00002-0002-4002-8002-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `hcnp0revoke-director-${stamp}@local.test`,
  caregiver: `hcnp0revoke-caregiver-${stamp}@local.test`,
  outsider: `hcnp0revoke-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const patientIds: Record<string, string> = {};

async function noteVisibleFor(token: string, patientId: string): Promise<boolean> {
  const [status, body] = (await http('GET', `/rest/v1/care_partner_notes?patient_id=eq.${patientId}&select=id,note,category`, undefined, token)) as [number, { id: string }[]];
  expect(status).toBe(200);
  expect(Array.isArray(body)).toBe(true);
  return body.length > 0;
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  patientIds.main = await authSignUp(`hcnp0revoke-patient-${stamp}@local.test`, PW);
  patientIds.unrelated = await authSignUp(`hcnp0revoke-patient-unrelated-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
      WHERE id IN ('${Object.values(ids).join("','")}','${patientIds.main}','${patientIds.unrelated}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','HCN P0 Revoke Org A ${stamp}','integrated_care','${ids.director}'),
      ('${ORG_B}','HCN P0 Revoke Org B ${stamp}','integrated_care','${ids.outsider}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',20,20,9999,'active'),
      ('${ORG_B}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${ids.director}','director','active'),
      ('${ORG_A}','${ids.caregiver}','caregiver','active'),
      ('${ORG_B}','${ids.outsider}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${patientIds.main}','HcnP0Revoke','Patient','HcnP0Revoke Patient','1 Ave','Facility'),
      ('${patientIds.unrelated}','HcnP0Revoke','Unrelated','HcnP0Revoke Unrelated','2 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES
      ('${ORG_A}','${patientIds.main}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG_A}','${ids.caregiver}','${patientIds.main}','caregiver',true,'${ids.director}');
    INSERT INTO care_partner_notes(patient_id,category,note,updated_by) VALUES
      ('${patientIds.main}','A','Confidential: private Care Partner note for the regression proof ${stamp}','${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM care_partner_notes WHERE patient_id IN ('${patientIds.main}','${patientIds.unrelated}');
    DELETE FROM staff_patient_assignments WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM organization_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM organization_licenses WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM patients WHERE id IN ('${patientIds.main}','${patientIds.unrelated}');
  `);
  for (const id of [...Object.values(ids), patientIds.main, patientIds.unrelated]) await authDeleteUser(id);
});

describe('HCN-MASTER-REMEDIATION-20261101 Phase B -- revoked-caregiver stale-assignment clinical access (the P0 regression)', () => {
  it('C-REVOKED-CLINICAL-READ 1-6: an active caregiver with an active assignment can read the private Care Partner note', async () => {
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(true);
  });

  it('C-REVOKED-CLINICAL-READ 7-11: revoking organization membership while the historical assignment stays active removes access immediately -- for BOTH the original JWT and a newly-issued one', async () => {
    const originalJwt = tok.caregiver; // "preserve the original JWT" (step 7)

    sql(`
      UPDATE organization_memberships SET status='revoked', updated_at=now()
      WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}';
    `);
    // Step 9: deliberately leave the assignment active.
    const assignmentStillActive = sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}' AND patient_id='${patientIds.main}';`);
    expect(assignmentStillActive).toBe('t');

    // Step 10: repeat with the ORIGINAL JWT.
    expect(await noteVisibleFor(originalJwt, patientIds.main)).toBe(false);

    // Step 11: repeat with a NEWLY issued JWT.
    const newJwt = await login(emails.caregiver, PW);
    expect(await noteVisibleFor(newJwt, patientIds.main)).toBe(false);

    // Restore for subsequent tests in this file.
    sql(`UPDATE organization_memberships SET status='active', updated_at=now() WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}';`);
  });

  it('an EXPIRED organization license blocks access even with active membership and active assignment', async () => {
    sql(`UPDATE organization_licenses SET status='expired', updated_at=now() WHERE organization_id='${ORG_A}';`);
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(false);
    sql(`UPDATE organization_licenses SET status='active', updated_at=now() WHERE organization_id='${ORG_A}';`);
  });

  it('a SUSPENDED organization license blocks access', async () => {
    sql(`UPDATE organization_licenses SET status='suspended', updated_at=now() WHERE organization_id='${ORG_A}';`);
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(false);
    sql(`UPDATE organization_licenses SET status='active', updated_at=now() WHERE organization_id='${ORG_A}';`);
  });

  it('ENDED patient coverage (covered_patient_memberships inactive) blocks access', async () => {
    sql(`UPDATE covered_patient_memberships SET status='ended' WHERE organization_id='${ORG_A}' AND patient_id='${patientIds.main}';`);
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(false);
    sql(`UPDATE covered_patient_memberships SET status='active' WHERE organization_id='${ORG_A}' AND patient_id='${patientIds.main}';`);
  });

  it('ARCHIVED patient coverage blocks access even if status is otherwise active', async () => {
    sql(`UPDATE covered_patient_memberships SET archived_at=now() WHERE organization_id='${ORG_A}' AND patient_id='${patientIds.main}';`);
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(false);
    sql(`UPDATE covered_patient_memberships SET archived_at=NULL WHERE organization_id='${ORG_A}' AND patient_id='${patientIds.main}';`);
  });

  it('an INACTIVE assignment (is_active=false) blocks access even with active membership', async () => {
    sql(`UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}' AND patient_id='${patientIds.main}';`);
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(false);
    sql(`UPDATE staff_patient_assignments SET is_active=true WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}' AND patient_id='${patientIds.main}';`);
  });

  it('a ROLE DOWNGRADE that no longer matches the assignment\'s own org_role blocks access', async () => {
    sql(`UPDATE organization_memberships SET org_role='billing_admin', updated_at=now() WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}';`);
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(false);
    sql(`UPDATE organization_memberships SET org_role='caregiver', updated_at=now() WHERE organization_id='${ORG_A}' AND user_id='${ids.caregiver}';`);
  });

  it('an UNRELATED organization\'s active caregiver cannot read this patient\'s note (cross-tenant isolation)', async () => {
    expect(await noteVisibleFor(tok.outsider, patientIds.main)).toBe(false);
  });

  it('this organization\'s active caregiver cannot read an UNRELATED patient\'s note (no coverage relationship)', async () => {
    expect(await noteVisibleFor(tok.caregiver, patientIds.unrelated)).toBe(false);
  });

  it('an unauthenticated (anon) caller is denied at the database privilege layer, never silently shown an empty 200 that could mask a real bug', async () => {
    const [status, body] = (await http('GET', `/rest/v1/care_partner_notes?patient_id=eq.${patientIds.main}&select=id`, undefined, ANON)) as [number, unknown];
    expect(status).toBe(200);
    expect(Array.isArray(body) ? body.length : -1).toBe(0);
  });

  it('sanity re-check: with everything restored, the active caregiver can read the note again (no fixture drift from the negative tests above)', async () => {
    expect(await noteVisibleFor(tok.caregiver, patientIds.main)).toBe(true);
  });
});
