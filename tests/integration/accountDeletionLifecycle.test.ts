// MASTER ENTERPRISE COMPLETION DIRECTIVE §1.B — Account deletion and
// lifecycle. Tests the REQUEST / VALIDATION / STATUS-TRACKING / REVIEW
// workflow and the SAFE, REVERSIBLE deactivation migration 088 adds.
// No real-user deletion occurs anywhere in this file; every account
// used is a disposable fixture created and torn down by this file
// itself, and the workflow under test never deletes auth.users,
// profiles, or any clinical record — only revokes memberships.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'AccountDeletion9!';
const stamp = Date.now();
const ORG = 'ad111111-1111-4111-8111-111111111111';
const PATIENT_ID_PLACEHOLDER = 'ad222222-2222-4222-8222-222222222222';

const emails = {
  owner: `adl-owner-${stamp}@local.test`,
  staffA: `adl-staffA-${stamp}@local.test`,
  staffB: `adl-staffB-${stamp}@local.test`,
  outsider: `adl-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) {
    ids[name] = await authSignUp(email, PW);
  }
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
    DELETE FROM organizations WHERE id='${ORG}';
    DELETE FROM patients WHERE id='${PATIENT_ID_PLACEHOLDER}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','ADL Integration Org','integrated_care','${ids.staffA}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.staffA}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${PATIENT_ID_PLACEHOLDER}','ADL','Patient','ADL Patient','1 ADL Ave','ADL Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${PATIENT_ID_PLACEHOLDER}','active','${ids.staffA}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${ORG}','${ids.staffA}','${PATIENT_ID_PLACEHOLDER}','caregiver',true,'${ids.staffA}');
    INSERT INTO patient_notes(patient_id,author_id,note,note_type) VALUES('${PATIENT_ID_PLACEHOLDER}','${ids.staffA}','ADL authored note — must survive deactivation','general');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM public.account_deletion_requests WHERE target_user_id IN ('${ids.staffA}','${ids.staffB}');
    DELETE FROM public.account_management_audit WHERE target_user_id IN ('${ids.staffA}','${ids.staffB}');
    DELETE FROM public.patients WHERE id='${PATIENT_ID_PLACEHOLDER}';
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('Account deletion request lifecycle (migration 088)', () => {
  it('a user can request deletion of their OWN account only — the RPC has no parameter naming another target (structural prevention of cross-tenant/unauthorized deletion)', async () => {
    const [status, body] = (await rpc('request_account_deletion', { p_reason: 'No longer need the account' }, tok.staffA)) as [number, { target_user_id: string; status: string }];
    expect(status).toBe(200);
    expect(body.target_user_id).toBe(ids.staffA);
    expect(body.status).toBe('requested');
  });

  it('duplicate requests are rejected while one is still open', async () => {
    const [status, body] = (await rpc('request_account_deletion', { p_reason: 'again' }, tok.staffA)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('already exists');
  });

  it('privilege escalation: an ordinary user (not the Platform Owner) cannot review ANY deletion request, including their own', async () => {
    const mine = (await rpc('get_my_account_deletion_requests', {}, tok.staffA))[1] as Array<{ id: string }>;
    const [status, body] = (await rpc('platform_owner_review_account_deletion', { p_request_id: mine[0].id, p_approve: true, p_notes: 'self-approved' }, tok.staffA)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('Only the Platform Owner');
  });

  it('an unrelated account cannot see this request in its own "my requests" list', async () => {
    const [status, body] = (await rpc('get_my_account_deletion_requests', {}, tok.outsider)) as [number, unknown[]];
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('a non-owner cannot list the pending-review queue either', async () => {
    const [status, body] = (await rpc('get_pending_account_deletion_requests', {}, tok.staffA)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('Only the Platform Owner');
  });

  it('the Platform Owner approval SAFELY DEACTIVATES the account: every active membership/assignment is revoked, but the auth identity and authored clinical records are NOT deleted', async () => {
    const mine = (await rpc('get_my_account_deletion_requests', {}, tok.staffA))[1] as Array<{ id: string }>;
    const requestId = mine[0].id;

    const [status, body] = (await rpc('platform_owner_review_account_deletion', { p_request_id: requestId, p_approve: true, p_notes: 'Approved — safe deactivation' }, tok.owner)) as [number, { status: string }];
    expect(status).toBe(200);
    expect(body.status).toBe('completed');

    const membershipStatus = sql(`SELECT status FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.staffA}';`);
    expect(membershipStatus).toBe('revoked');
    const assignmentActive = sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.staffA}' AND patient_id='${PATIENT_ID_PLACEHOLDER}';`);
    expect(assignmentActive).toBe('f');

    // The account itself and its authored content survive untouched.
    const profileExists = sql(`SELECT count(*) FROM profiles WHERE id='${ids.staffA}';`);
    expect(profileExists).toBe('1');
    const noteStillThere = sql(`SELECT note FROM patient_notes WHERE patient_id='${PATIENT_ID_PLACEHOLDER}' AND author_id='${ids.staffA}';`);
    expect(noteStillThere).toBe('ADL authored note — must survive deactivation');

    // The audit trail records both the membership revocation and the
    // overall completion, with the Platform Owner as actor.
    const auditCount = sql(`SELECT count(*) FROM account_management_audit WHERE target_user_id='${ids.staffA}' AND actor_user_id='${ids.owner}';`);
    expect(Number(auditCount)).toBeGreaterThanOrEqual(2);
  });

  it('deactivated/revoked account access: the now-deactivated staffA can no longer read the organization\'s staff patients (functionally suspended, not merely a flag)', async () => {
    const [status, body] = (await rpc('get_my_staff_patients', {}, tok.staffA)) as [number, unknown[]];
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('a request that has already been decided cannot be decided again (no re-approval / re-denial)', async () => {
    const [, mineAfter] = (await rpc('get_my_account_deletion_requests', {}, tok.staffA)) as [number, Array<{ id: string }>];
    const [status, body] = (await rpc('platform_owner_review_account_deletion', { p_request_id: mineAfter[0].id, p_approve: false, p_notes: 'too late' }, tok.owner)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('already been decided');
  });

  it('cancellation works only while a request is still open, and only by its own requester', async () => {
    const [requestStatus, request] = (await rpc('request_account_deletion', { p_reason: 'testing cancel' }, tok.staffB)) as [number, { id: string }];
    expect(requestStatus).toBe(200);

    const [wrongUserStatus, wrongUserBody] = (await rpc('cancel_account_deletion_request', { p_request_id: request.id }, tok.outsider)) as [number, { message?: string }];
    expect(wrongUserStatus).toBeGreaterThanOrEqual(400);
    expect(wrongUserBody.message).toContain('Only the requester');

    const [cancelStatus, cancelled] = (await rpc('cancel_account_deletion_request', { p_request_id: request.id }, tok.staffB)) as [number, { status: string }];
    expect(cancelStatus).toBe(200);
    expect(cancelled.status).toBe('cancelled');

    const [recancelStatus, recancelBody] = (await rpc('cancel_account_deletion_request', { p_request_id: request.id }, tok.staffB)) as [number, { message?: string }];
    expect(recancelStatus).toBeGreaterThanOrEqual(400);
    expect(recancelBody.message).toContain('already been decided');
  });

  // Codex MMA-CODEX-08 — "old invitations cannot recreate prohibited
  // access" after closure. CONFIRMED GAP (fixed, migration 098):
  // approval previously revoked only ACTIVE memberships; a pending
  // 'invited' row (not yet accepted) was left untouched, so the
  // account could still accept it later and regain access despite
  // deletion having been approved.
  it('migration 098: approving a deletion request also cancels every pending invitation, not only active memberships, so none can be stale-accepted afterward', async () => {
    const SECOND_ORG = 'ad333333-3333-4333-8333-333333333333';
    sql(`
      DELETE FROM organizations WHERE id='${SECOND_ORG}';
      BEGIN;
      INSERT INTO organizations(id,name,package_type,created_by) VALUES('${SECOND_ORG}','ADL Second Org','integrated_care','${ids.owner}');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${SECOND_ORG}','${ids.staffB}','caregiver','invited');
      COMMIT;
    `);

    const [requestStatus, request] = (await rpc('request_account_deletion', { p_reason: 'testing stale invite' }, tok.staffB)) as [number, { id: string }];
    expect(requestStatus).toBe(200);

    const [approveStatus, approveBody] = (await rpc('platform_owner_review_account_deletion', { p_request_id: request.id, p_approve: true, p_notes: 'Approved' }, tok.owner)) as [number, { status: string }];
    expect(approveStatus).toBe(200);
    expect(approveBody.status).toBe('completed');

    const invitedMembershipStatus = sql(`SELECT status FROM organization_memberships WHERE organization_id='${SECOND_ORG}' AND user_id='${ids.staffB}';`);
    expect(invitedMembershipStatus).toBe('declined');

    // The stale invitation can no longer be accepted at all.
    const membershipId = sql(`SELECT id FROM organization_memberships WHERE organization_id='${SECOND_ORG}' AND user_id='${ids.staffB}';`);
    const [acceptStatus, acceptBody] = (await rpc('respond_to_org_invite', { p_membership_id: membershipId, p_accept: true }, tok.staffB)) as [number, { message?: string }];
    expect(acceptStatus).toBeGreaterThanOrEqual(400);
    expect(acceptBody.message).toContain('No pending invitation exists');

    const auditType = sql(`SELECT action_type FROM account_management_audit WHERE target_user_id='${ids.staffB}' AND action_type='account_deletion_approved_invitation_cancelled';`);
    expect(auditType).toBe('account_deletion_approved_invitation_cancelled');

    sql(`DELETE FROM public.account_management_audit WHERE organization_id='${SECOND_ORG}'; DELETE FROM organizations WHERE id='${SECOND_ORG}';`);
  });
});
