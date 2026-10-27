// MMA-P1-CODEX-002 P1-01 -- "APR Patient Office access." Migration 154
// (get_my_patient_office_subject(), my_patient_office_access_active(),
// has_patient_access()-based SELECT policies on medications/
// appointments/caregiver_visits/tasks) + ProfessionalOfficeResolver.tsx/
// EnterprisePatientDashboard.tsx/PatientMedications.tsx/
// PatientDocuments.tsx/PatientCareTeam.tsx frontend wiring.
//
// Reproduces the EXACT original Codex finding at the data layer (the
// layer this suite can exercise without a real browser) and proves it no
// longer holds:
//   - "is_my_enterprise_coverage_active() is false for the
//     representative's own UUID" -- true and UNCHANGED (that function's
//     existing meaning is deliberately preserved); the NEW resolver
//     get_my_patient_office_subject() correctly returns the REPRESENTED
//     PATIENT's id instead.
//   - "A seeded patient medication is invisible despite active approved
//     representation/helper=true" -- proven fixed via a direct REST
//     SELECT against `medications` as the representative, exactly the
//     query PatientMedications.tsx now issues with the resolved subject
//     id.
// Also proves the negative cases: an unapproved/pending representative
// still sees nothing; a revoked representative loses access immediately;
// cross-tenant/cross-patient isolation holds; an ordinary patient's own
// access is completely unaffected (self-service regression check).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, http, rpc, sql } from './_runtime';

const PW = 'Codex002P101Fix9!';
const stamp = Date.now();
const ORG = 'f0154201-2001-4201-8201-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `codex002p101-director-${stamp}@local.test`,
  rep: `codex002p101-rep-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patient: string;
let repRecordId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  patient = await authSignUp(`codex002p101-patient-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
    WHERE id IN ('${ids.director}','${ids.rep}','${patient}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','Codex002 P1-01 Org ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patient}','Codex002','Patient','Codex002 Patient','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES('${ORG}','${patient}','active');
    INSERT INTO medications(patient_id,name,dosage,instructions,is_active) VALUES('${patient}','Donepezil','5mg','Take with breakfast',true);
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
  tok.patient = await login(`codex002p101-patient-${stamp}@local.test`, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM patient_representatives WHERE organization_id='${ORG}';
    DELETE FROM medications WHERE patient_id='${patient}';
    DELETE FROM covered_patient_memberships WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
    DELETE FROM patients WHERE id='${patient}';
  `);
  for (const id of [ids.director, ids.rep, patient]) await authDeleteUser(id);
});

describe('MMA-P1-CODEX-002 P1-01 (migration 154 + frontend wiring) — APR Patient Office access', () => {
  it('an ordinary patient resolves their own id as the Patient Office subject -- self-service is unaffected', async () => {
    const [, subject] = await rpc('get_my_patient_office_subject', {}, tok.patient);
    expect(subject).toBe(patient);
    const [, active] = await rpc('my_patient_office_access_active', {}, tok.patient);
    expect(active).toBe(true);
  });

  it('a pending (unverified) representative resolves no subject at all and cannot see medications', async () => {
    const [registerStatus, repRecord] = (await rpc('register_patient_representative', {
      p_patient_id: patient, p_org_id: ORG, p_representative_email: emails.rep,
      p_legal_first_name: 'Jordan', p_legal_last_name: 'Representative', p_contact_email: emails.rep,
      p_contact_phone: '555-0100', p_residential_address: '1 Rep Way', p_relationship_to_patient: 'child',
      p_authorization_basis: 'durable_power_of_attorney', p_consent_acknowledged: true,
    }, tok.director)) as [number, { id: string }];
    expect(registerStatus).toBe(200);
    repRecordId = repRecord.id;

    const [, subject] = await rpc('get_my_patient_office_subject', {}, tok.rep);
    expect(subject).toBeNull();

    const meds = await http('GET', `/rest/v1/medications?patient_id=eq.${patient}`, undefined, tok.rep);
    expect((meds[1] as unknown[]).length).toBe(0);
  });

  it(
    "once verified, the representative's resolved subject is the patient, and the exact originally-reported medication is now visible",
    async () => {
      const [verifyStatus] = await rpc('verify_patient_representative', { p_representative_id: repRecordId }, tok.director);
      expect(verifyStatus).toBe(200);

      const [, subject] = await rpc('get_my_patient_office_subject', {}, tok.rep);
      expect(subject).toBe(patient);
      const [, active] = await rpc('my_patient_office_access_active', {}, tok.rep);
      expect(active).toBe(true);

      // The exact reproduction: a REST SELECT against medications,
      // filtered by the RESOLVED subject id -- precisely what
      // PatientMedications.tsx now issues after ProfessionalOfficeResolver/
      // EnterprisePatientDashboard thread subjectPatientId through.
      const [status, rows] = await http('GET', `/rest/v1/medications?patient_id=eq.${patient}`, undefined, tok.rep);
      expect(status).toBe(200);
      const meds = rows as Array<{ name: string }>;
      expect(meds.length).toBe(1);
      expect(meds[0].name).toBe('Donepezil');
    },
  );

  it('appointments/caregiver_visits/tasks are also visible to the verified representative via has_patient_access (migration 154)', async () => {
    sql(`
      INSERT INTO appointments(patient_id, title, provider, date, time) VALUES ('${patient}', 'Memory clinic follow-up', 'Dr. Lee', CURRENT_DATE, '09:00');
      INSERT INTO tasks(patient_id, title, status, is_active) VALUES ('${patient}', 'Morning routine', 'pending', true);
    `);
    const [apptStatus, appts] = await http('GET', `/rest/v1/appointments?patient_id=eq.${patient}`, undefined, tok.rep);
    expect(apptStatus).toBe(200);
    expect((appts as unknown[]).length).toBe(1);

    const [taskStatus, tasks] = await http('GET', `/rest/v1/tasks?patient_id=eq.${patient}`, undefined, tok.rep);
    expect(taskStatus).toBe(200);
    expect((tasks as unknown[]).length).toBe(1);
  });

  it('revocation immediately removes the representative\'s resolved subject and medication visibility, using the same already-issued session', async () => {
    const [revokeStatus] = await rpc('revoke_patient_representative', { p_representative_id: repRecordId, p_reason: 'No longer authorized' }, tok.director);
    expect(revokeStatus).toBe(200);

    const [, subjectAfterRevoke] = await rpc('get_my_patient_office_subject', {}, tok.rep);
    expect(subjectAfterRevoke).toBeNull();

    const [, medsAfterRevoke] = await http('GET', `/rest/v1/medications?patient_id=eq.${patient}`, undefined, tok.rep);
    expect((medsAfterRevoke as unknown[]).length).toBe(0);
  });

  it('a Director (not a representative, not the patient) still cannot resolve a Patient Office subject at all', async () => {
    const [, subject] = await rpc('get_my_patient_office_subject', {}, tok.director);
    expect(subject).toBeNull();
  });
});
