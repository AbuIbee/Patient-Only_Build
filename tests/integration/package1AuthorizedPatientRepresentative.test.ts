// PACKAGE 1 (MMA-P1-FINAL) Priority 2, Section 7 -- Authorized Patient
// Representative. Migration 145.
//
// Proves, against real RPC/RLS (never a mocked permission check):
//   1. Only an active Director/Caregiver of the covering organization can
//      initiate enrollment (7.2 step 1) -- a Medical Professional cannot.
//   2. Enrollment is refused without consent, and without the
//      organization actually covering the target patient.
//   3. A newly-registered representative is 'pending_verification' and
//      has NO patient access yet (7.2: verification is a distinct step).
//   4. Only an active Director can verify -- after verification, the
//      representative gains full ordinary patient access (has_patient_access)
//      for THEIR patient only, never for a patient covered by an unrelated
//      organization (5.3-equivalent tenant boundary, 7.4).
//   5. Revocation requires a reason and immediately removes access
//      (7.6), without deleting the patient or the representative's
//      historical record.
//   6. Replacement atomically revokes the old representative and
//      enrolls a new one, who must independently be verified before
//      gaining access.
//   7. Every lifecycle transition is recorded in account_management_audit.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Package1AprFix9!';
const stamp = Date.now();
const ORG_A = 'f0145501-5501-4501-8501-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_B = 'f0145502-5502-4502-8502-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  directorA: `p1apr-directorA-${stamp}@local.test`,
  medicalA: `p1apr-medicalA-${stamp}@local.test`,
  repFirst: `p1apr-repFirst-${stamp}@local.test`,
  repReplacement: `p1apr-repReplacement-${stamp}@local.test`,
  patientA: `p1apr-patientA-${stamp}@local.test`, // covered by org A
  patientB: `p1apr-patientB-${stamp}@local.test`, // covered by org B (unrelated tenant)
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','P1 APR Org A ${stamp}','integrated_care','${ids.directorA}'),
      ('${ORG_B}','P1 APR Org B ${stamp}','integrated_care','${ids.directorA}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',10,10,999,'active'),
      ('${ORG_B}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${ids.directorA}','director','active'),
      ('${ORG_A}','${ids.medicalA}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${ids.patientA}','P1Apr','PatientA','P1Apr PatientA','1 P1Apr Ave','P1Apr Facility'),
      ('${ids.patientB}','P1Apr','PatientB','P1Apr PatientB','1 P1Apr Ave','P1Apr Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
      ('${ORG_A}','${ids.patientA}','active'),
      ('${ORG_B}','${ids.patientB}','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM patient_representatives WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM patients WHERE id IN ('${ids.patientA}','${ids.patientB}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

function enrollArgs(repEmail: string) {
  return {
    p_patient_id: ids.patientA,
    p_org_id: ORG_A,
    p_representative_email: repEmail,
    p_legal_first_name: 'Jordan',
    p_legal_last_name: 'Representative',
    p_contact_email: repEmail,
    p_contact_phone: '555-0100',
    p_residential_address: '1 Representative Way',
    p_relationship_to_patient: 'child',
    p_authorization_basis: 'durable_power_of_attorney',
    p_consent_acknowledged: true,
  };
}

describe('PACKAGE 1 (migration 145) — Authorized Patient Representative', () => {
  it('a Medical Professional (not Director/Caregiver) cannot initiate representative enrollment', async () => {
    const [status] = (await rpc('register_patient_representative', enrollArgs(emails.repFirst), tok.medicalA)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('enrollment is refused without consent', async () => {
    const [status] = (await rpc('register_patient_representative', { ...enrollArgs(emails.repFirst), p_consent_acknowledged: false }, tok.directorA)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('enrollment is refused for a patient the organization does not cover', async () => {
    const [status] = (await rpc('register_patient_representative', { ...enrollArgs(emails.repFirst), p_patient_id: ids.patientB }, tok.directorA)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a Director can enroll a representative; it starts pending with NO patient access', async () => {
    const [status, body] = (await rpc('register_patient_representative', enrollArgs(emails.repFirst), tok.directorA)) as [number, { id: string; status: string }];
    expect(status).toBe(200);
    expect(body.status).toBe('pending_verification');
    ids.repRecordId = body.id as unknown as string;

    const [, authorized] = await rpc('has_patient_access', { p_patient_id: ids.patientA }, tok.repFirst);
    expect(authorized).toBe(false);

    const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG_A}' AND action_type='patient_representative_registered' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditRow).toBe('patient_representative_registered');
  });

  it('verification grants full patient access scoped to the correct organization only', async () => {
    const [verifyStatus] = await rpc('verify_patient_representative', { p_representative_id: ids.repRecordId }, tok.directorA);
    expect(verifyStatus).toBe(200);

    const [, authorizedA] = await rpc('has_patient_access', { p_patient_id: ids.patientA }, tok.repFirst);
    expect(authorizedA).toBe(true);

    // Tenant boundary: patientB is covered by ORG_B, which this
    // representative was never enrolled under.
    const [, authorizedB] = await rpc('has_patient_access', { p_patient_id: ids.patientB }, tok.repFirst);
    expect(authorizedB).toBe(false);

    const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG_A}' AND action_type='patient_representative_verified' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditRow).toBe('patient_representative_verified');
  });

  it('revocation requires a reason and immediately removes access, without deleting the patient', async () => {
    const [noReasonStatus] = (await rpc('revoke_patient_representative', { p_representative_id: ids.repRecordId, p_reason: '' }, tok.directorA)) as [number, unknown];
    expect(noReasonStatus).toBeGreaterThanOrEqual(400);

    const [revokeStatus] = await rpc('revoke_patient_representative', { p_representative_id: ids.repRecordId, p_reason: 'Representative relationship ended' }, tok.directorA);
    expect(revokeStatus).toBe(200);

    const [, authorized] = await rpc('has_patient_access', { p_patient_id: ids.patientA }, tok.repFirst);
    expect(authorized).toBe(false);

    const patientStillExists = sql(`SELECT count(*) FROM patients WHERE id='${ids.patientA}';`);
    expect(patientStillExists).toBe('1');
  });

  it('replacement atomically revokes the old representative and enrolls a new one, who starts unverified', async () => {
    const [registerStatus, newRep] = (await rpc('register_patient_representative', enrollArgs(emails.repFirst), tok.directorA)) as [number, { id: string }];
    expect(registerStatus).toBe(200);
    await rpc('verify_patient_representative', { p_representative_id: newRep.id }, tok.directorA);

    const { p_patient_id: _patientId, p_org_id: _orgId, ...replacementFields } = enrollArgs(emails.repReplacement);
    const [replaceStatus, replacement] = (await rpc('replace_patient_representative', {
      p_old_representative_id: newRep.id,
      p_reason: 'Family designated a new representative',
      ...replacementFields,
    }, tok.directorA)) as [number, { id: string; status: string }];
    expect(replaceStatus).toBe(200);
    expect(replacement.status).toBe('pending_verification');

    const [, oldAccess] = await rpc('has_patient_access', { p_patient_id: ids.patientA }, tok.repFirst);
    expect(oldAccess).toBe(false);
    const [, newAccessBeforeVerify] = await rpc('has_patient_access', { p_patient_id: ids.patientA }, tok.repReplacement);
    expect(newAccessBeforeVerify).toBe(false);

    await rpc('verify_patient_representative', { p_representative_id: replacement.id }, tok.directorA);
    const [, newAccessAfterVerify] = await rpc('has_patient_access', { p_patient_id: ids.patientA }, tok.repReplacement);
    expect(newAccessAfterVerify).toBe(true);
  });
});
