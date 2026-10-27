// PACKAGE 1 (MMA-P1-FINAL) Priorities 3 & 4, Section 8 -- Director
// patient closure and automatic 45-day archival. Migration 146.
//
// Proves, against real RPC/RLS (never a mocked permission check):
//   1. Only an active Director can close coverage; a Caregiver cannot.
//   2. Closure is refused without a reason, and without notes.
//   3. Closing one organization's coverage for a patient covered by TWO
//      organizations leaves the OTHER organization's coverage untouched
//      (8.3 multi-organization protection) -- the actual regression the
//      directive calls out by name.
//   4. Closure is idempotent: calling it again on an already-closed
//      relationship returns the same row rather than erroring or
//      re-transitioning.
//   5. A patient closed but not yet due for archival (scheduled_
//      archival_at in the future) is NOT archived by
//      archive_eligible_closed_patients(); the exact same patient IS
//      archived once that timestamp has passed (simulated directly via
//      SQL rather than waiting 45 real days).
//   6. Repeated archival execution is safe (idempotent) -- calling the
//      archival sweep twice after the timestamp has passed does not
//      error or double-transition.
//   7. An active legal hold prevents archival of an otherwise-eligible
//      patient; archival proceeds once the hold is released.
//   8. Archival never deletes the patient record.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, SERVICE, sql } from './_runtime';

const PW = 'Package1ClosureFix9!';
const stamp = Date.now();
const ORG_A = 'f0146601-6601-4601-8601-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_B = 'f0146602-6602-4602-8602-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_C = 'f0146603-6603-4603-8603-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  directorA: `p1close-directorA-${stamp}@local.test`,
  caregiverA: `p1close-caregiverA-${stamp}@local.test`,
  directorC: `p1close-directorC-${stamp}@local.test`,
  patientShared: `p1close-patientShared-${stamp}@local.test`, // covered by A AND B
  patientSolo: `p1close-patientSolo-${stamp}@local.test`, // covered by C only, for the archival timeline tests
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','P1 Closure Org A ${stamp}','integrated_care','${ids.directorA}'),
      ('${ORG_B}','P1 Closure Org B ${stamp}','integrated_care','${ids.directorA}'),
      ('${ORG_C}','P1 Closure Org C ${stamp}','integrated_care','${ids.directorC}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',10,10,999,'active'),('${ORG_B}',10,10,999,'active'),('${ORG_C}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${ids.directorA}','director','active'),
      ('${ORG_A}','${ids.caregiverA}','caregiver','active'),
      ('${ORG_C}','${ids.directorC}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${ids.patientShared}','P1Close','Shared','P1Close Shared','1 P1Close Ave','P1Close Facility'),
      ('${ids.patientSolo}','P1Close','Solo','P1Close Solo','1 P1Close Ave','P1Close Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
      ('${ORG_A}','${ids.patientShared}','active'),
      ('${ORG_B}','${ids.patientShared}','active'),
      ('${ORG_C}','${ids.patientSolo}','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM account_management_audit WHERE organization_id IN ('${ORG_A}','${ORG_B}','${ORG_C}');
    DELETE FROM patient_legal_holds WHERE patient_id IN ('${ids.patientShared}','${ids.patientSolo}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}','${ORG_C}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}','${ORG_C}');
    DELETE FROM patients WHERE id IN ('${ids.patientShared}','${ids.patientSolo}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('PACKAGE 1 (migration 146) — Director patient closure and automatic archival', () => {
  it('a Caregiver cannot close coverage; closure requires both a reason and notes', async () => {
    const [caregiverStatus] = (await rpc('close_patient_coverage', { p_org_id: ORG_A, p_patient_id: ids.patientShared, p_reason: 'x', p_notes: 'y' }, tok.caregiverA)) as [number, unknown];
    expect(caregiverStatus).toBeGreaterThanOrEqual(400);

    const [noReasonStatus] = (await rpc('close_patient_coverage', { p_org_id: ORG_A, p_patient_id: ids.patientShared, p_reason: '', p_notes: 'y' }, tok.directorA)) as [number, unknown];
    expect(noReasonStatus).toBeGreaterThanOrEqual(400);

    const [noNotesStatus] = (await rpc('close_patient_coverage', { p_org_id: ORG_A, p_patient_id: ids.patientShared, p_reason: 'x', p_notes: '' }, tok.directorA)) as [number, unknown];
    expect(noNotesStatus).toBeGreaterThanOrEqual(400);
  });

  it('closing org A coverage leaves org B coverage for the same patient untouched (multi-org protection, 8.3)', async () => {
    const [status, body] = (await rpc('close_patient_coverage', {
      p_org_id: ORG_A, p_patient_id: ids.patientShared, p_reason: 'Care no longer needed', p_notes: 'Family relocated out of service area.',
    }, tok.directorA)) as [number, { status: string }];
    expect(status).toBe(200);
    expect(body.status).toBe('closed');

    const orgAStatus = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_A}' AND patient_id='${ids.patientShared}';`);
    expect(orgAStatus).toBe('closed');
    const orgBStatus = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_B}' AND patient_id='${ids.patientShared}';`);
    expect(orgBStatus).toBe('active');

    const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG_A}' AND action_type='patient_coverage_closed' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditRow).toBe('patient_coverage_closed');
  });

  it('closing again is idempotent — no error, same closed state, no re-transition', async () => {
    const [status, body] = (await rpc('close_patient_coverage', {
      p_org_id: ORG_A, p_patient_id: ids.patientShared, p_reason: 'Duplicate call', p_notes: 'Should be a no-op.',
    }, tok.directorA)) as [number, { status: string; closure_reason: string }];
    expect(status).toBe(200);
    expect(body.status).toBe('closed');
    // The original reason is preserved -- the duplicate call did not overwrite it.
    expect(body.closure_reason).toBe('Care no longer needed');
  });

  it('a patient closed but not yet due is not archived; the sweep is safe to re-run', async () => {
    const [closeStatus] = await rpc('close_patient_coverage', {
      p_org_id: ORG_C, p_patient_id: ids.patientSolo, p_reason: 'Service ended', p_notes: 'Contract concluded.',
    }, tok.directorC);
    expect(closeStatus).toBe(200);

    const [, rows] = (await rpc('archive_eligible_closed_patients', {}, SERVICE)) as [number, Array<{ out_patient_id: string }>];
    expect(rows.some((r) => r.out_patient_id === ids.patientSolo)).toBe(false);

    const statusBefore = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_C}' AND patient_id='${ids.patientSolo}';`);
    expect(statusBefore).toBe('closed');
  });

  it('archival proceeds once the 45-day timestamp has passed, is idempotent on repeat, and never deletes the patient', async () => {
    sql(`UPDATE covered_patient_memberships SET scheduled_archival_at = now() - INTERVAL '1 minute' WHERE organization_id='${ORG_C}' AND patient_id='${ids.patientSolo}';`);

    const [firstStatus, firstRows] = (await rpc('archive_eligible_closed_patients', {}, SERVICE)) as [number, Array<{ out_patient_id: string; archived: boolean }>];
    expect(firstStatus).toBe(200);
    const firstMatch = firstRows.find((r) => r.out_patient_id === ids.patientSolo);
    expect(firstMatch?.archived).toBe(true);

    const statusAfter = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_C}' AND patient_id='${ids.patientSolo}';`);
    expect(statusAfter).toBe('archived');

    // Repeated execution: already archived, must not error or re-transition.
    const [secondStatus] = await rpc('archive_eligible_closed_patients', {}, SERVICE);
    expect(secondStatus).toBe(200);
    const stillArchived = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_C}' AND patient_id='${ids.patientSolo}';`);
    expect(stillArchived).toBe('archived');

    const patientStillExists = sql(`SELECT count(*) FROM patients WHERE id='${ids.patientSolo}';`);
    expect(patientStillExists).toBe('1');
  });

  it('an active legal hold blocks archival; archival proceeds once the hold is released', async () => {
    sql(`
      UPDATE covered_patient_memberships SET status='closed', scheduled_archival_at = now() - INTERVAL '1 minute', archived_at=NULL
      WHERE organization_id='${ORG_B}' AND patient_id='${ids.patientShared}';
    `);
    const platformOwnerOverride = sql(`UPDATE profiles SET role='admin' WHERE id='${ids.directorC}' RETURNING role;`);
    expect(platformOwnerOverride).toBe('admin');
    const directorCAsOwnerTok = await login(emails.directorC, PW);

    const [holdStatus, hold] = (await rpc('place_patient_legal_hold', { p_patient_id: ids.patientShared, p_reason: 'Pending litigation hold' }, directorCAsOwnerTok)) as [number, { id: string }];
    expect(holdStatus).toBe(200);

    const [, rowsWithHold] = (await rpc('archive_eligible_closed_patients', {}, SERVICE)) as [number, Array<{ out_patient_id: string; archived: boolean; detail: string }>];
    const blocked = rowsWithHold.find((r) => r.out_patient_id === ids.patientShared);
    expect(blocked?.archived).toBe(false);
    expect(blocked?.detail).toContain('legal hold');

    const stillClosed = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_B}' AND patient_id='${ids.patientShared}';`);
    expect(stillClosed).toBe('closed');

    const [releaseStatus] = await rpc('release_patient_legal_hold', { p_hold_id: hold.id }, directorCAsOwnerTok);
    expect(releaseStatus).toBe(200);

    const [, rowsAfterRelease] = (await rpc('archive_eligible_closed_patients', {}, SERVICE)) as [number, Array<{ out_patient_id: string; archived: boolean }>];
    const nowArchived = rowsAfterRelease.find((r) => r.out_patient_id === ids.patientShared);
    expect(nowArchived?.archived).toBe(true);
  });
});
