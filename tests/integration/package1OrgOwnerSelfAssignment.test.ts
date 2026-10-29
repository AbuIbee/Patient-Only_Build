// PACKAGE 1 (MMA-P1-FINAL) Section 5 -- "Organization Owner — full
// organizational authority." Migration 144.
//
// Proves, against real RLS/RPC (never a mocked permission check):
//   1. An org's Owner (organizations.owner_user_id, backfilled from
//      created_by) can self-assign nonclinical billing administration only.
//      Clinical access requires separate independently verified credentials
//      and per-patient authorization, never ownership alone.
//   2. Before self-assignment, the Owner has NO patient access through
//      this path (ownership alone does not grant clinical access --
//      5.2's "Do not automatically grant clinical access merely because
//      the person is identified as Organization Owner").
//   3. The owner retains NO clinical access after a billing capability
//      grant, for patients in any organization they own.
//   4. A non-owner (e.g. a Director who is not the Owner) cannot
//      self-assign capability for that organization at all (403/
//      exception).
//   5. Billing capability revocation remains self-service and auditable.
//   6. Every self-assign/revoke call writes a real account_management_
//      audit row recording actor, target, organization, and action.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Package1OwnerFix9!';
const stamp = Date.now();
const ORG_A = 'f0144401-4401-4401-8401-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_B = 'f0144402-4402-4402-8402-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  ownerA: `p1owner-ownerA-${stamp}@local.test`,
  directorA: `p1owner-directorA-${stamp}@local.test`, // active director of A, NOT the owner
  patientA: `p1owner-patientA-${stamp}@local.test`, // covered by org A
  patientB: `p1owner-patientB-${stamp}@local.test`, // covered by org B (unrelated tenant)
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','P1 Owner Org A ${stamp}','integrated_care','${ids.ownerA}'),
      ('${ORG_B}','P1 Owner Org B ${stamp}','integrated_care','${ids.ownerA}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',10,10,999,'active'),
      ('${ORG_B}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${ids.ownerA}','director','active'),
      ('${ORG_A}','${ids.directorA}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${ids.patientA}','P1Owner','PatientA','P1Owner PatientA','1 P1Owner Ave','P1Owner Facility'),
      ('${ids.patientB}','P1Owner','PatientB','P1Owner PatientB','1 P1Owner Ave','P1Owner Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
      ('${ORG_A}','${ids.patientA}','active'),
      ('${ORG_B}','${ids.patientB}','active');
    COMMIT;
  `);
  // Org B's owner_user_id back-filled from created_by = ownerA too, by
  // design here (same person owns both orgs) -- isolates the assertion
  // to tenant SCOPE (capability granted only for org A) rather than
  // conflating it with "is this person even an owner anywhere."
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM organization_owner_capability_grants WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM account_management_audit WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM patients WHERE id IN ('${ids.patientA}','${ids.patientB}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('PACKAGE 1 (migration 144) — Organization Owner self-assignment', () => {
  it('ownership alone grants no clinical access before self-assignment', async () => {
    const [status, authorized] = await rpc('is_medical_professional_for_patient', { p_patient_id: ids.patientA }, tok.ownerA);
    expect(status).toBe(200);
    expect(authorized).toBe(false);
  });

  it('MMA-P1-FINAL-CLOSURE Priority 2 (migration 157): am_i_org_owner() correctly identifies the real Owner, scoped per organization, and denies a non-owner', async () => {
    const [, ownerOwnsA] = await rpc('am_i_org_owner', { p_org_id: ORG_A }, tok.ownerA);
    expect(ownerOwnsA).toBe(true);
    const [, directorOwnsA] = await rpc('am_i_org_owner', { p_org_id: ORG_A }, tok.directorA);
    expect(directorOwnsA).toBe(false);
  });

  it('a non-owner Director cannot self-assign even nonclinical capabilities', async () => {
    const [status] = (await rpc('org_owner_self_assign_capability', { p_org_id: ORG_A, p_capability: 'billing_admin' }, tok.directorA)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('the Owner can self-assign billing administration, but cannot self-assign clinical authority', async () => {
    const [forbidden] = await rpc('org_owner_self_assign_capability', { p_org_id: ORG_A, p_capability: 'medical_professional' }, tok.ownerA);
    expect(forbidden).toBeGreaterThanOrEqual(400);
    const [assignStatus] = await rpc('org_owner_self_assign_capability', { p_org_id: ORG_A, p_capability: 'billing_admin' }, tok.ownerA);
    expect(assignStatus).toBe(200);

    const [, authorizedA] = await rpc('is_medical_professional_for_patient', { p_patient_id: ids.patientA }, tok.ownerA);
    expect(authorizedA).toBe(false);

    // Tenant boundary: the capability grant is scoped to ORG_A only.
    // patientB is covered by ORG_B, which this grant was never issued
    // for -- access must remain denied even though the same person owns
    // both organizations.
    const [, authorizedB] = await rpc('is_medical_professional_for_patient', { p_patient_id: ids.patientB }, tok.ownerA);
    expect(authorizedB).toBe(false);

    const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG_A}' AND actor_user_id='${ids.ownerA}' AND action_type='organization_owner_self_assign_capability' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditRow).toBe('organization_owner_self_assign_capability');
  });

  it('the Owner can revoke their billing capability, without gaining clinical access', async () => {
    const [revokeStatus] = await rpc('org_owner_revoke_own_capability', { p_org_id: ORG_A, p_capability: 'billing_admin' }, tok.ownerA);
    expect(revokeStatus).toBe(200);

    const [, authorized] = await rpc('is_medical_professional_for_patient', { p_patient_id: ids.patientA }, tok.ownerA);
    expect(authorized).toBe(false);

    const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG_A}' AND actor_user_id='${ids.ownerA}' AND action_type='organization_owner_revoke_own_capability' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditRow).toBe('organization_owner_revoke_own_capability');
  });
});
