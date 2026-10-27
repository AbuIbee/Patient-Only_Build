// MMA-P1-CODEX-002 P1-05 -- "Exceptional Platform Owner deletion."
// Migration 151: platform_owner_delete_patient_exceptionally(). Proves,
// against real RPC/RLS:
//   1. A trusted Platform Owner (admin, zero organization memberships)
//      can invoke it successfully with a justification.
//   2. An ordinary authenticated user cannot.
//   3. An Organization Owner cannot invoke it solely by virtue of
//      ownership.
//   4. A Director cannot invoke it.
//   5. A missing justification fails.
//   6. An active legal hold blocks the deletion.
//   7. The audit record survives even though the patient row, and its
//      representative/hold history, are gone afterward.
//   8. Cross-tenant effects (every organization that covered the
//      patient) are explicitly recorded.
//   9. A second, repeated request cannot cause additional destruction --
//      it fails cleanly because the patient no longer exists.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Codex002P105Fix9!';
const stamp = Date.now();
const ORG_A = 'f0151901-9901-4901-8901-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_B = 'f0151902-9902-4902-8902-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  admin: `codex002p105-admin-${stamp}@local.test`,
  ordinary: `codex002p105-ordinary-${stamp}@local.test`,
  owner: `codex002p105-owner-${stamp}@local.test`,
  director: `codex002p105-director-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientNoHold: string;
let patientHeld: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  patientNoHold = await authSignUp(`codex002p105-patientA-${stamp}@local.test`, PW);
  patientHeld = await authSignUp(`codex002p105-patientB-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
    WHERE id IN ('${Object.values(ids).join("','")}','${patientNoHold}','${patientHeld}');
    UPDATE profiles SET role='admin' WHERE id='${ids.admin}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','Codex002 P1-05 Org A ${stamp}','integrated_care','${ids.owner}'),
      ('${ORG_B}','Codex002 P1-05 Org B ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',10,10,999,'active'),('${ORG_B}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_B}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${patientNoHold}','Codex002','PatientNoHold','Codex002 PatientNoHold','1 Ave','Facility'),
      ('${patientHeld}','Codex002','PatientHeld','Codex002 PatientHeld','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
      ('${ORG_A}','${patientNoHold}','active'),
      ('${ORG_B}','${patientNoHold}','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
  tok.patientNoHold = await login(`codex002p105-patientA-${stamp}@local.test`, PW);
  tok.patientHeld = await login(`codex002p105-patientB-${stamp}@local.test`, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE target_user_id IN ('${patientNoHold}','${patientHeld}');
    DELETE FROM patient_legal_holds WHERE patient_id IN ('${patientNoHold}','${patientHeld}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}');
    DELETE FROM patients WHERE id IN ('${patientNoHold}','${patientHeld}');
  `);
  for (const id of [...Object.values(ids), patientNoHold, patientHeld]) await authDeleteUser(id);
});

describe('MMA-P1-CODEX-002 P1-05 (migration 151) — exceptional Platform Owner patient deletion', () => {
  it('an ordinary authenticated user cannot invoke exceptional deletion', async () => {
    const [status] = (await rpc('platform_owner_delete_patient_exceptionally', { p_patient_id: patientNoHold, p_justification: 'attempt' }, tok.ordinary)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('an Organization Owner cannot invoke it solely by virtue of ownership', async () => {
    const [status] = (await rpc('platform_owner_delete_patient_exceptionally', { p_patient_id: patientNoHold, p_justification: 'attempt' }, tok.owner)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a Director cannot invoke it', async () => {
    const [status] = (await rpc('platform_owner_delete_patient_exceptionally', { p_patient_id: patientNoHold, p_justification: 'attempt' }, tok.director)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a trusted admin is rejected without a justification', async () => {
    const [status] = (await rpc('platform_owner_delete_patient_exceptionally', { p_patient_id: patientNoHold, p_justification: '' }, tok.admin)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('an active legal hold blocks the deletion', async () => {
    await rpc('place_patient_legal_hold', { p_patient_id: patientHeld, p_reason: 'Pending litigation' }, tok.admin);
    const [status] = (await rpc('platform_owner_delete_patient_exceptionally', { p_patient_id: patientHeld, p_justification: 'Attempt under hold' }, tok.admin)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
    const stillExists = sql(`SELECT count(*) FROM patients WHERE id='${patientHeld}';`);
    expect(stillExists).toBe('1');
  });

  it('a trusted Platform Owner with zero organization memberships succeeds, records cross-tenant effects, and the audit survives the deletion', async () => {
    expect(sql(`SELECT count(*) FROM organization_memberships WHERE user_id='${ids.admin}';`)).toBe('0');

    const [status, result] = (await rpc('platform_owner_delete_patient_exceptionally', {
      p_patient_id: patientNoHold, p_justification: 'Legally mandated erasure request, verified externally',
    }, tok.admin)) as [number, { affected_organizations: string[] }];
    expect(status).toBe(200);
    expect([...result.affected_organizations].sort()).toEqual([ORG_A, ORG_B].sort());

    const patientGone = sql(`SELECT count(*) FROM patients WHERE id='${patientNoHold}';`);
    expect(patientGone).toBe('0');
    const coverageGone = sql(`SELECT count(*) FROM covered_patient_memberships WHERE patient_id='${patientNoHold}';`);
    expect(coverageGone).toBe('0');

    const auditRow = sql(`
      SELECT actor_user_id || '|' || action_type || '|' || reason || '|' || (previous_value->>'id')
      FROM account_management_audit
      WHERE target_user_id='${patientNoHold}' AND action_type='platform_owner_exceptional_patient_deletion'
      ORDER BY created_at DESC LIMIT 1;
    `);
    expect(auditRow).toBe(`${ids.admin}|platform_owner_exceptional_patient_deletion|Legally mandated erasure request, verified externally|${patientNoHold}`);
  });

  it('a repeated request cannot cause additional destruction -- it fails cleanly because the patient no longer exists', async () => {
    const [status] = (await rpc('platform_owner_delete_patient_exceptionally', { p_patient_id: patientNoHold, p_justification: 'Repeat attempt' }, tok.admin)) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);

    const auditCount = sql(`SELECT count(*) FROM account_management_audit WHERE target_user_id='${patientNoHold}' AND action_type='platform_owner_exceptional_patient_deletion';`);
    expect(auditCount).toBe('1');
  });
});
