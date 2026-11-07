// HCN-MASTER-REMEDIATION-20261101, Phase C -- sixteen-policy reconciliation,
// positive-path functional proof.
//
// The owner-supplied classification (see audit-output/HCN_MASTER_REMEDIATION_20261101/
// 03_SIXTEEN_POLICY_MATRIX.md) found A-P01/A-P02 ("Assigned staff can submit
// check-ins for their patients" / "Caller must be the check-in's own
// patient, linked caregiver, or") REDUNDANT in the HISTORICAL/production
// catalog: "the retained older restrictive own-patient/linked-caregiver
// INSERT rule dominates... staff-only check-ins are not enabled by these
// additions." Investigating why against this repository's own fresh-
// baseline schema (not the production catalog, which this session has no
// access to and is not authorized to touch) found the explanation: a
// SECOND restrictive INSERT policy on the same table -- "Free-tier
// accounts cannot submit new care partner check-ins" -- had no staff
// branch at all prior to this engagement's Phase A fix (migration
// 20261101091000). PostgreSQL ANDs every applicable restrictive policy
// together; a staff member could satisfy A-P01/A-P02's own staff branch
// and still be rejected outright by the free-tier guard's lack of one --
// exactly PR4-S01's own original defect description ("multiple
// restrictive INSERT policies can coexist... correcting only one
// restrictive policy does not restore access if another still rejects
// it"), independently re-derived and already fixed by this engagement's
// own Phase A work for an unrelated reason (free-tier/paid-entitlement
// gating), before this classification was supplied.
//
// This suite proves the POSITIVE case end-to-end, not just that no
// exception is raised: a real, currently-authorized enterprise staff
// member can actually submit a check-in and create/update a Care Partner
// note (A-P01/A-P02/A-P03/A-P04), closing the loop on PR4-S01's own
// stated goal ("permit appropriately authorized enterprise caregiver
// submission") -- which the historical classification found NOT actually
// enabled, in addition to the already-separately-proven negative cases
// (Phase B: revoked membership, inactive assignment, etc., all correctly
// denied).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'HcnP0Sixteen9!';
const stamp = Date.now();
const ORG = 'f0c00001-0001-4001-8001-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `hcnp0sixteen-director-${stamp}@local.test`,
  caregiver: `hcnp0sixteen-caregiver-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  patientId = await authSignUp(`hcnp0sixteen-patient-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
      WHERE id IN ('${ids.director}','${ids.caregiver}','${patientId}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','HCN P0 Sixteen Org ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.caregiver}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','HcnP0Sixteen','Patient','HcnP0Sixteen Patient','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiver}','${patientId}','caregiver',true,'${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM care_partner_checkins WHERE patient_id='${patientId}';
    DELETE FROM care_partner_notes WHERE patient_id='${patientId}';
    DELETE FROM staff_patient_assignments WHERE organization_id='${ORG}';
    DELETE FROM covered_patient_memberships WHERE organization_id='${ORG}';
    DELETE FROM organization_memberships WHERE organization_id='${ORG}';
    DELETE FROM organization_licenses WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
    DELETE FROM patients WHERE id='${patientId}';
  `);
  for (const id of [ids.director, ids.caregiver, patientId]) await authDeleteUser(id);
});

describe('HCN-MASTER-REMEDIATION-20261101 Phase C -- A-P01/A-P02/A-P03/A-P04 actually enable enterprise staff submission (positive proof)', () => {
  it('A-P01/A-P02: a currently-authorized enterprise caregiver CAN submit a check-in for their assigned patient', async () => {
    const [status] = (await http('POST', '/rest/v1/care_partner_checkins', {
      patient_id: patientId, submitted_by: ids.caregiver, fn_comments: 'HCN P0 Sixteen positive proof',
    }, tok.caregiver)) as [number, unknown];
    expect(status).toBe(201);
    const count = sql(`SELECT count(*) FROM care_partner_checkins WHERE patient_id='${patientId}' AND submitted_by='${ids.caregiver}';`);
    expect(count).toBe('1');
  });

  it('A-P03/A-P04: a currently-authorized enterprise caregiver CAN create and update a Care Partner note', async () => {
    const [createStatus] = (await http('POST', '/rest/v1/care_partner_notes', {
      patient_id: patientId, category: 'A', note: 'HCN P0 Sixteen positive proof note', updated_by: ids.caregiver,
    }, tok.caregiver)) as [number, unknown];
    expect(createStatus).toBe(201);

    const [updateStatus] = (await http('PATCH', `/rest/v1/care_partner_notes?patient_id=eq.${patientId}&category=eq.A`, {
      note: 'HCN P0 Sixteen positive proof note (updated)',
    }, tok.caregiver)) as [number, unknown];
    expect(updateStatus).toBe(200);

    const note = sql(`SELECT note FROM care_partner_notes WHERE patient_id='${patientId}' AND category='A';`);
    expect(note).toBe('HCN P0 Sixteen positive proof note (updated)');
  });

  it('once membership is revoked (assignment left active), the SAME caregiver can no longer submit a check-in -- Phase B\'s fix applies to the INSERT path too, not just SELECT', async () => {
    sql(`UPDATE organization_memberships SET status='revoked', updated_at=now() WHERE organization_id='${ORG}' AND user_id='${ids.caregiver}';`);
    try {
      const [status] = (await http('POST', '/rest/v1/care_partner_checkins', {
        patient_id: patientId, submitted_by: ids.caregiver, fn_comments: 'should be rejected',
      }, tok.caregiver)) as [number, unknown];
      expect(status).toBeGreaterThanOrEqual(400);
      const count = sql(`SELECT count(*) FROM care_partner_checkins WHERE patient_id='${patientId}' AND fn_comments='should be rejected';`);
      expect(count).toBe('0');
    } finally {
      sql(`UPDATE organization_memberships SET status='active', updated_at=now() WHERE organization_id='${ORG}' AND user_id='${ids.caregiver}';`);
    }
  });
});
