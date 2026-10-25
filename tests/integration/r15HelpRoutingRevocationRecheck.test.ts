// MMA-ENT-CAREGIVER-MASTER-004 — security regression recheck requested
// for migration 133 (R15 HELP routing): "Verify intended responder
// roles, active organization membership, patient assignment,
// eligibility, revocation and coverage. Do not assume every active
// staff assignment is automatically an authorized HELP recipient."
//
// record_help_activation() resolves responders from
// staff_patient_assignments.is_active=true -- the SAME signal
// is_authorized_for_patient() (migration 040), the app's one
// authoritative "is this user currently authorized for this patient"
// check, already uses everywhere else. This file proves, through the
// REAL production RPCs (not a direct SQL flip, which the existing R15
// suite already covers), that both ways a staff member stops being an
// authorized responder -- an org director removing them entirely
// (remove_org_member) and a director unassigning them from just this
// one patient (unassign_staff_from_patient) -- correctly cascade to
// exclude them from HELP routing on the very next activation. Isolated
// fixture/teardown, separate from round7MasterCorrectiveSecurity.test.ts,
// specifically because this test permanently revokes a membership and
// must not destabilize that file's large shared fixture.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'R15Recheck9!';
const stamp = Date.now();
const ORG = 'c1555555-5555-4555-8555-555555555555';

const emails = {
  director: `r15rc-director-${stamp}@local.test`,
  caregiverA: `r15rc-caregiverA-${stamp}@local.test`,
  caregiverB: `r15rc-caregiverB-${stamp}@local.test`,
  therapistT: `r15rc-therapistT-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;
let patientTok: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `r15rc-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM public.account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','R15 Recheck Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.caregiverA}','caregiver','active'),
      ('${ORG}','${ids.caregiverB}','caregiver','active'),
      ('${ORG}','${ids.therapistT}','therapist','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','R15Recheck','Patient','R15Recheck Patient','1 Recheck Ave','Recheck Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiverA}','${patientId}','caregiver',true,'${ids.director}'),
      ('${ORG}','${ids.caregiverB}','${patientId}','caregiver',true,'${ids.director}'),
      ('${ORG}','${ids.therapistT}','${patientId}','therapist',true,'${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
  patientTok = await login(patientEmail, PW);
}, 30000);

afterAll(async () => {
  // account_management_audit rows (migration 084's own audit trail for
  // remove_org_member) deliberately have no ON DELETE CASCADE from
  // organizations -- audit history is meant to outlive the org it
  // describes. Harmless, intentional FK; this synthetic fixture's own
  // rows are removed explicitly before the org itself.
  sql(`DELETE FROM public.account_management_audit WHERE organization_id='${ORG}'; DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('MMA-ENT-CAREGIVER-MASTER-004 — R15/migration 133 security recheck: revocation cascades to HELP routing through the real RPCs', () => {
  it('baseline: all three active staff (caregiver + therapist org_roles) are routed', async () => {
    const [status, help] = (await rpc('record_help_activation', { p_phone_dialed: '911' }, patientTok)) as [
      number, { id: string; caregiver_count_at_time: number },
    ];
    expect(status).toBe(200);
    expect(help.caregiver_count_at_time).toBe(3);
    sql(`DELETE FROM help_activations WHERE id='${help.id}';`);
  });

  it('unassign_staff_from_patient (the real director RPC, not a direct SQL flip) immediately excludes that one staff member from routing, leaving the other two', async () => {
    const [unassignStatus] = await rpc('unassign_staff_from_patient', { p_org_id: ORG, p_user_id: ids.caregiverB, p_patient_id: patientId }, tok.director) as [number, unknown];
    expect(unassignStatus).toBe(200);

    const [status, help] = (await rpc('record_help_activation', { p_phone_dialed: '911' }, patientTok)) as [
      number, { id: string; caregiver_count_at_time: number },
    ];
    expect(status).toBe(200);
    expect(help.caregiver_count_at_time).toBe(2);
    sql(`DELETE FROM help_activations WHERE id='${help.id}';`);
  });

  it('remove_org_member (the real director RPC that revokes the WHOLE membership) also immediately excludes that staff member from routing', async () => {
    const [removeStatus] = await rpc('remove_org_member', { p_org_id: ORG, p_user_id: ids.therapistT }, tok.director) as [number, unknown];
    expect(removeStatus).toBe(200);

    // Confirm the cascade this fix depends on actually happened.
    expect(sql(`SELECT is_active FROM staff_patient_assignments WHERE user_id='${ids.therapistT}' AND patient_id='${patientId}';`)).toBe('f');

    const [status, help] = (await rpc('record_help_activation', { p_phone_dialed: '911' }, patientTok)) as [
      number, { id: string; caregiver_count_at_time: number },
    ];
    expect(status).toBe(200);
    // Only caregiverA remains (caregiverB unassigned in the previous test, therapistT just removed).
    expect(help.caregiver_count_at_time).toBe(1);
    sql(`DELETE FROM help_activations WHERE id='${help.id}';`);
  });

  it('a revoked staff member cannot read the HELP conversation even if routing had somehow still included them (defense in depth)', async () => {
    // therapistT's org membership is fully revoked at this point. Even a
    // direct attempt to read conversations for this patient must come
    // back empty under their own (still-valid JWT, now-unauthorized) session.
    const [status, rows] = (await rpc('get_my_conversations', { p_patient_id: patientId }, tok.therapistT)) as [number, unknown[]];
    expect(status).toBe(200);
    expect(rows).toEqual([]);
  });
});
