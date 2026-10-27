// MMA-P1-CODEX-002 P1-02 -- "A legacy RPC can bypass required closure
// controls." Migration 148 routes end_patient_coverage() through
// close_patient_coverage(). Proves the original Codex reproduction no
// longer succeeds: an active Director calling the legacy RPC can no
// longer produce an 'ended' row with NULL reason/notes/audit/deadline --
// it now carries the full closure record, exactly like the direct path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Codex002P102Fix9!';
const stamp = Date.now();
const ORG = 'f0148801-8801-4801-8801-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `codex002p102-director-${stamp}@local.test`,
  patient: `codex002p102-patient-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','Codex002 P1-02 Org ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${ids.patient}','Codex002','Patient','Codex002 Patient','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES('${ORG}','${ids.patient}','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM covered_patient_memberships WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
    DELETE FROM patients WHERE id='${ids.patient}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-P1-CODEX-002 P1-02 (migration 148) — legacy closure bypass is fixed', () => {
  it('end_patient_coverage() now produces a complete, audited closure record instead of a bare "ended" row', async () => {
    const [status] = await rpc('end_patient_coverage', { p_org_id: ORG, p_patient_id: ids.patient }, tok.director);
    expect(status).toBe(200);

    const row = sql(`SELECT status || '|' || (closure_reason IS NOT NULL) || '|' || (closure_notes IS NOT NULL) || '|' || (scheduled_archival_at IS NOT NULL) FROM covered_patient_memberships WHERE organization_id='${ORG}' AND patient_id='${ids.patient}';`);
    expect(row).toBe('closed|true|true|true');

    const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG}' AND action_type='patient_coverage_closed' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditRow).toBe('patient_coverage_closed');
  });
});
