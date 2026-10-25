// MMA-ENT-CAREGIVER-MASTER-003, D08 (P1) — independent runtime audit
// finding: the incident form only ever had patient/type/description;
// severity always defaulted to low (file_incident_report()'s own
// p_severity parameter already existed but the UI never offered it,
// so this specifically verifies the parameter itself still works end
// to end); there was no way to record a backdated occurrence time; and
// no attachment mechanism existed for an incident at all.
//
// Migration 136 adds p_occurred_at (optional, rejects a future
// timestamp) and incident_attachments (private Storage + metadata
// table, RLS mirroring incident_reports' own three SELECT policies).
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'D08Incident9!';
const stamp = Date.now();
const ORG = 'f0999999-9999-4999-8999-999999999999';

const emails = {
  caregiver: `d08-caregiver-${stamp}@local.test`,
  director: `d08-director-${stamp}@local.test`,
  outsider: `d08-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `d08-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','D08 Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.caregiver}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','D08','Patient','D08 Patient','1 D08 Ave','D08 Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiver}','${patientId}','caregiver',true,'${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('MMA-ENT-CAREGIVER-MASTER-003 D08 (P1) — incident severity and occurred_at (migration 136)', () => {
  it('a selected severity and a real past occurred_at are both persisted, not defaulted away', async () => {
    const pastTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
    const [status, report] = (await rpc('file_incident_report', {
      p_org_id: ORG, p_patient_id: patientId, p_incident_type: 'fall', p_description: 'Found on floor near bed',
      p_severity: 'critical', p_occurred_at: pastTime,
    }, tok.caregiver)) as [number, { id: string; severity: string; occurred_at: string; supervisor_notified_at: string | null }];
    expect(status).toBe(200);
    expect(report.severity).toBe('critical');
    expect(new Date(report.occurred_at).getTime()).toBe(new Date(pastTime).getTime());
    expect(report.supervisor_notified_at).not.toBeNull(); // critical still auto-escalates, unchanged
    sql(`DELETE FROM incident_reports WHERE id='${report.id}';`);
  });

  it('omitting occurred_at still defaults to now(), exactly as before this parameter existed', async () => {
    const before = Date.now();
    const [status, report] = (await rpc('file_incident_report', {
      p_org_id: ORG, p_patient_id: patientId, p_incident_type: 'other', p_description: 'Default time check', p_severity: 'low',
    }, tok.caregiver)) as [number, { id: string; occurred_at: string }];
    expect(status).toBe(200);
    expect(new Date(report.occurred_at).getTime() - before).toBeLessThan(10_000);
    sql(`DELETE FROM incident_reports WHERE id='${report.id}';`);
  });

  it('a future occurred_at is rejected -- an incident cannot be reported as occurring before it happened', async () => {
    const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const [status, body] = (await rpc('file_incident_report', {
      p_org_id: ORG, p_patient_id: patientId, p_incident_type: 'other', p_description: 'Future time check',
      p_occurred_at: futureTime,
    }, tok.caregiver)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('cannot be reported as occurring in the future');
  });
});

describe('MMA-ENT-CAREGIVER-MASTER-003 D08 (P1) — incident attachments (migration 136)', () => {
  let incidentId: string;

  beforeAll(async () => {
    const [, report] = (await rpc('file_incident_report', {
      p_org_id: ORG, p_patient_id: patientId, p_incident_type: 'injury', p_description: 'Attachment fixture incident', p_severity: 'moderate',
    }, tok.caregiver)) as [number, { id: string }];
    incidentId = report.id;
  });

  afterAll(async () => { sql(`DELETE FROM incident_reports WHERE id='${incidentId}';`); });

  it('the reporter can register an attachment on their own incident', async () => {
    const [status] = await http('POST', '/rest/v1/incident_attachments', {
      incident_id: incidentId, storage_path: `${incidentId}/1_photo.jpg`, file_name: 'photo.jpg', uploaded_by: ids.caregiver,
    }, tok.caregiver) as [number, unknown];
    expect(status).toBe(201);
    expect(sql(`SELECT count(*) FROM incident_attachments WHERE incident_id='${incidentId}';`)).toBe('1');
  });

  it('an active director in the same org can read the attachment', async () => {
    const [status, body] = await http('GET', `/rest/v1/incident_attachments?incident_id=eq.${incidentId}`, undefined, tok.director) as [number, unknown[]];
    expect(status).toBe(200);
    expect((body as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('an entirely unrelated account cannot read or attach anything', async () => {
    const [readStatus, readBody] = await http('GET', `/rest/v1/incident_attachments?incident_id=eq.${incidentId}`, undefined, tok.outsider) as [number, unknown[]];
    expect(readStatus).toBe(200);
    expect(readBody).toEqual([]); // RLS silently returns zero rows, not an error, for a non-authorized SELECT

    const [insStatus] = await http('POST', '/rest/v1/incident_attachments', {
      incident_id: incidentId, storage_path: `${incidentId}/2_outsider.jpg`, file_name: 'outsider.jpg', uploaded_by: ids.outsider,
    }, tok.outsider) as [number, unknown];
    expect(insStatus).toBeGreaterThanOrEqual(400);
  });

  it('a different staff member (not the reporter) cannot attach a file to this incident', async () => {
    const [status] = await http('POST', '/rest/v1/incident_attachments', {
      incident_id: incidentId, storage_path: `${incidentId}/3_director.jpg`, file_name: 'director.jpg', uploaded_by: ids.director,
    }, tok.director) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
