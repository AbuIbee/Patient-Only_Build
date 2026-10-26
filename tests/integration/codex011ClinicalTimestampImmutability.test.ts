// MMA-CODEX-011 finding 011-02 (F-14/P02/P10, P1) — independent audit
// reproduced: an ordinary Medical professional inserting a clinical
// record with their own real author_id/source but created_at
// 2000-01-01 persisted the forged date; a subsequent select returned
// it. Migration 139 makes created_at (and, where present, updated_at)
// server-owned via a BEFORE INSERT OR UPDATE trigger on every clinical
// table migration 070/072 created, regardless of whether the write goes
// through the RPC or direct REST.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'Codex011Timestamp9!';
const stamp = Date.now();
const ORG = 'f0888888-8888-4888-8888-888888888888';
const FORGED_DATE = '2000-01-01T00:00:00.000Z';

const emails = {
  director: `codex011ts-director-${stamp}@local.test`,
  medical: `codex011ts-medical-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `codex011ts-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','Codex011 Timestamp Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.medical}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','Codex011Ts','Patient','Codex011 Ts Patient','1 Codex Ave','Codex Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.medical}','${patientId}','medical_professional',true,'${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('MMA-CODEX-011 011-02 (F-14/P02/P10, P1) — clinical record created_at/updated_at are server-owned (migration 139)', () => {
  it('a direct REST insert into patient_vitals with a forged created_at is overwritten with the real server time', async () => {
    const before = Date.now();
    const [status, row] = (await http('POST', '/rest/v1/patient_vitals', {
      patient_id: patientId, pulse_bpm: 70, source: 'professional_observation', author_id: ids.medical, created_at: FORGED_DATE,
    }, tok.medical)) as [number, { id: string; created_at: string }[]];
    expect(status).toBe(201);
    const createdAt = new Date(row[0].created_at).getTime();
    expect(createdAt).not.toBe(new Date(FORGED_DATE).getTime());
    expect(Math.abs(createdAt - before)).toBeLessThan(10_000);
    sql(`DELETE FROM patient_vitals WHERE id='${row[0].id}';`);
  });

  it('a direct REST insert into patient_diagnoses with a forged created_at is overwritten with the real server time, while diagnosed_date (a legitimate clinical date) is preserved', async () => {
    const before = Date.now();
    const [status, row] = (await http('POST', '/rest/v1/patient_diagnoses', {
      patient_id: patientId, condition_name: 'Codex011 probe condition', source: 'professional_observation', author_id: ids.medical,
      created_at: FORGED_DATE, diagnosed_date: '2010-05-15',
    }, tok.medical)) as [number, { id: string; created_at: string; diagnosed_date: string }[]];
    expect(status).toBe(201);
    const createdAt = new Date(row[0].created_at).getTime();
    expect(createdAt).not.toBe(new Date(FORGED_DATE).getTime());
    expect(Math.abs(createdAt - before)).toBeLessThan(10_000);
    expect(row[0].diagnosed_date).toBe('2010-05-15'); // a real clinically-observed date, not touched by this fix
    sql(`DELETE FROM patient_diagnoses WHERE id='${row[0].id}';`);
  });

  it('a direct REST update attempting to backdate created_at (and forge updated_at) on patient_therapy_goals is silently reverted to the real values', async () => {
    const [createStatus, created] = (await http('POST', '/rest/v1/patient_therapy_goals', {
      patient_id: patientId, objective: 'Codex011 probe goal', author_id: ids.medical,
    }, tok.medical)) as [number, { id: string; created_at: string }[]];
    expect(createStatus).toBe(201);
    const goalId = created[0].id;
    const originalCreatedAt = created[0].created_at;

    const [patchStatus, patched] = (await http('PATCH', `/rest/v1/patient_therapy_goals?id=eq.${goalId}`, {
      progress_notes: 'probe edit', created_at: FORGED_DATE, updated_at: FORGED_DATE,
    }, tok.medical)) as [number, { created_at: string; updated_at: string; progress_notes: string }[]];
    expect(patchStatus).toBe(200);
    expect(patched[0].progress_notes).toBe('probe edit'); // the legitimate edit still applies
    expect(patched[0].created_at).toBe(originalCreatedAt); // created_at never moves on UPDATE
    expect(new Date(patched[0].updated_at).getTime()).not.toBe(new Date(FORGED_DATE).getTime()); // updated_at is server time, not caller-supplied

    sql(`DELETE FROM patient_therapy_goals WHERE id='${goalId}';`);
  });
});
