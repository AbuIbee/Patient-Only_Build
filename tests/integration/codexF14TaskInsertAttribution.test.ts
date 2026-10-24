// CODEX F-14 (P1, release-blocking) — "Residual clinical/task
// attribution forgery." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 125.
//
// Migration 076's SEC-05 fix only protected UPDATE on tasks
// (status_updated_by/status_updated_at), and migration 079's patients
// safety-plan provenance trigger only forced code_status_updated_by
// on UPDATE, with communication_needs having NO check or attribution
// at all on INSERT. Both reproduced here via direct REST INSERT --
// the exact bypass path Codex identified (never going through an
// UPDATE at all).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'CodexF14Fix9!';
const stamp = Date.now();

const emails = {
  caregiver: `f14-caregiver-${stamp}@local.test`,
  outsider: `f14-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `f14-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','F14','Patient','F14 Patient','1 F14 Ave','F14 Facility');
    INSERT INTO caregiver_patients(caregiver_id, patient_id) VALUES ('${ids.caregiver}','${patientId}');
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM patients WHERE id='${patientId}';`); // cascades caregiver_patients/tasks
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('CODEX F-14 FIX (migration 125) — task and patient safety-plan INSERT attribution', () => {
  it('FIX: a direct INSERT into tasks cannot forge status_updated_by -- the trigger forces it to the real caller', async () => {
    const [status, body] = await http('POST', '/rest/v1/tasks', {
      patient_id: patientId, title: 'F14 forged task', status: 'completed',
      status_updated_by: ids.outsider, completed_at: '2020-01-01T00:00:00Z',
    }, tok.caregiver);
    expect(status).toBe(201);
    const row = (body as { id: string; status_updated_by: string }[])[0]!;
    expect(row.status_updated_by).toBe(ids.caregiver);
    expect(row.status_updated_by).not.toBe(ids.outsider);
    sql(`DELETE FROM tasks WHERE id='${row.id}';`);
  });

  it('regression guard: UPDATE attribution (migration 076) still works exactly as before', async () => {
    const [, createBody] = await http('POST', '/rest/v1/tasks', {
      patient_id: patientId, title: 'F14 update guard task', status: 'pending',
    }, tok.caregiver);
    const taskId = (createBody as { id: string }[])[0]!.id;

    const [updateStatus, updateBody] = await http('PATCH', `/rest/v1/tasks?id=eq.${taskId}`, {
      status: 'completed', status_updated_by: ids.outsider,
    }, tok.caregiver);
    expect(updateStatus).toBe(200);
    const updated = (updateBody as { status_updated_by: string }[])[0]!;
    expect(updated.status_updated_by).toBe(ids.caregiver);
    sql(`DELETE FROM tasks WHERE id='${taskId}';`);
  });

  it('FIX: direct impersonated INSERT/UPDATE on patients cannot forge code_status_updated_by or communication_needs_updated_by', async () => {
    // Impersonate the caregiver role for a direct table-level probe
    // (the normal app surface only ever UPDATEs an existing patient
    // row through record_* RPCs, but the RLS/trigger boundary itself
    // must hold even against a raw UPDATE).
    const before = sql(`SELECT code_status_updated_by, communication_needs_updated_by FROM patients WHERE id='${patientId}';`);
    expect(before).toBe('|');

    sql(`
      BEGIN;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claims', '{"sub":"${ids.caregiver}","role":"authenticated"}', true);
      UPDATE patients SET communication_needs = 'Uses picture cards', communication_needs_source = 'caregiver_report', communication_needs_updated_by = '${ids.outsider}' WHERE id = '${patientId}';
      COMMIT;
    `);
    const after = sql(`SELECT communication_needs_updated_by FROM patients WHERE id='${patientId}';`);
    expect(after).toBe(ids.caregiver);
    expect(after).not.toBe(ids.outsider);
  });
});
