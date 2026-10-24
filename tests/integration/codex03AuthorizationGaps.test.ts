// Codex MMA-CODEX-03 — "current authorization." Two gaps found by a
// dedicated full audit of every effective authorization pathway (the
// finding's own explicit ask) and closed by migration 104.
//
// Gap 1 (serious): platform_owner_correct_office_classification()
// updated only organization_memberships.org_role/status -- every real
// clinical gate (is_professional_staff_for_patient/has_patient_access/
// is_authorized_for_patient) reads staff_patient_assignments.is_active,
// which this RPC never touched. A platform-owner-revoked or
// -reclassified user retained full clinical authority on every patient
// they were already assigned to.
//
// Gap 2 (correctness/availability): migration 087 extended send_message/
// get_my_conversations/search_my_conversations/get_patient_care_circle
// with an is_org_director_for_patient() OR-branch, but never touched
// is_conversation_participant() itself -- the function the direct-table
// RLS SELECT policies on conversations/conversation_participants/
// messages all gate through. A director-only-authorized participant
// saw the conversation in their list but an EMPTY participant/message
// read when opening it.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'Codex03Gap9!';
const stamp = Date.now();
const ORG = 'c0777777-7777-4777-8777-777777777777';

const emails = {
  owner: `c03-owner-${stamp}@local.test`,
  director: `c03-director-${stamp}@local.test`,
  medical: `c03-medical-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `c03-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
    DELETE FROM account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','C03 Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.medical}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','C03','Patient','C03 Patient','1 C03 Ave','C03 Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.medical}','${patientId}','medical_professional',true,'${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM public.patients WHERE id='${patientId}';
    DELETE FROM account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('Codex MMA-CODEX-03 gap 1 — platform_owner_correct_office_classification() now deactivates stale staff_patient_assignments (migration 104)', () => {
  it('revoking a membership through THIS RPC (not remove_org_member) also deactivates their existing patient assignments', async () => {
    // Confirm the medical professional genuinely has an active
    // assignment -- the exact state the real clinical gates
    // (is_professional_staff_for_patient() et al, all auth.uid()-scoped
    // so not directly callable from a raw psql probe) key off -- before
    // the correction, so a live defect would otherwise leave this open.
    const before = sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';`);
    expect(before).toBe('t');

    const [status] = await rpc('platform_owner_correct_office_classification', {
      p_user_id: ids.medical, p_organization_id: ORG, p_new_org_role: 'medical_professional', p_new_status: 'revoked', p_reason: 'test revocation',
    }, tok.owner);
    expect(status).toBe(200);

    const assignmentActive = sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';`);
    expect(assignmentActive).toBe('f');
    expect(sql(`SELECT count(*) FROM account_management_audit WHERE target_user_id='${ids.medical}' AND action_type='office_classification_corrected_assignments_deactivated';`)).toBe('1');
  });

  it('reclassifying to a DIFFERENT office while remaining active also deactivates the stale-role assignment', async () => {
    sql(`
      UPDATE organization_memberships SET status='active', org_role='medical_professional' WHERE organization_id='${ORG}' AND user_id='${ids.medical}';
      UPDATE staff_patient_assignments SET is_active=true WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';
    `);
    const [status] = await rpc('platform_owner_correct_office_classification', {
      p_user_id: ids.medical, p_organization_id: ORG, p_new_org_role: 'caregiver', p_new_status: 'active', p_reason: 'test reclassification',
    }, tok.owner);
    expect(status).toBe(200);
    const assignmentActive = sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';`);
    expect(assignmentActive).toBe('f');
  });

  it('a no-op correction (same role, same active status) does NOT spuriously deactivate anything', async () => {
    sql(`
      UPDATE organization_memberships SET status='active', org_role='medical_professional' WHERE organization_id='${ORG}' AND user_id='${ids.medical}';
      UPDATE staff_patient_assignments SET org_role='medical_professional', is_active=true WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';
    `);
    const [status] = await rpc('platform_owner_correct_office_classification', {
      p_user_id: ids.medical, p_organization_id: ORG, p_new_org_role: 'medical_professional', p_new_status: 'active', p_reason: 'test no-op',
    }, tok.owner);
    expect(status).toBe(200);
    const assignmentActive = sql(`SELECT is_active FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';`);
    expect(assignmentActive).toBe('t');
  });
});

describe('Codex MMA-CODEX-03 gap 2 — a director-only-authorized participant can now actually read a conversation they are in (migration 104, corrected by migration 120)', () => {
  // SUPERSEDED, 2026-10-24: this test previously asserted that a
  // director with NO conversation_participants row at all (recipient
  // was the patient only) could still read the conversation purely via
  // is_org_director_for_patient() -- i.e. it encoded "unaddressed
  // Director access" as the REQUIRED behavior. The independent Codex
  // audit (MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding
  // F-01, P0) correctly identified this as the actual security defect:
  // migration 104's is_conversation_participant() granted direct-table
  // read access to ANY current director-for-patient with no
  // requirement that they were ever added (addressed) to that specific
  // conversation. Migration 120 restores the requirement that an
  // explicit participant row must exist, while still recognizing
  // is_org_director_for_patient() as a valid CURRENT-authorization
  // check for that row once it exists -- so this describe block is
  // rewritten below to prove gap 2's real, legitimate complaint (an
  // ADDRESSED director saw an empty participant/message list) stays
  // fixed, while an unaddressed one is now correctly rejected, not
  // granted.
  it('an ADDRESSED director participant (added as an explicit recipient, authorized only via is_org_director_for_patient) sees real participants and messages, not an empty table-RLS-filtered result', async () => {
    sql(`UPDATE staff_patient_assignments SET is_active=true WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';`);

    // The director IS an explicit recipient this time -- the actual
    // scenario migration 087 was built for (a director validly added
    // to a conversation, whose only authorization is directorship).
    const [createStatus, conv] = (await rpc('create_conversation', {
      p_patient_id: patientId, p_recipient_user_ids: [patientId, ids.director], p_subject: 'C03 gap-2 probe (addressed)',
    }, tok.medical)) as [number, { id: string }];
    expect(createStatus).toBe(200);
    await rpc('send_message', { p_conversation_id: conv.id, p_body: 'director should be able to read this', p_is_urgent: false, p_reply_to_message_id: null }, tok.medical);

    expect(sql(`SELECT count(*) FROM conversation_participants WHERE conversation_id='${conv.id}' AND user_id='${ids.director}';`)).toBe('1');

    const participants = await http('GET', `/rest/v1/conversation_participants?conversation_id=eq.${conv.id}`, undefined, tok.director) as [number, unknown[]];
    expect(participants[0]).toBe(200);
    expect((participants[1] as unknown[]).length).toBeGreaterThanOrEqual(1);

    const messages = await http('GET', `/rest/v1/messages?conversation_id=eq.${conv.id}`, undefined, tok.director) as [number, unknown[]];
    expect(messages[0]).toBe(200);
    expect((messages[1] as unknown[]).length).toBeGreaterThanOrEqual(1);

    sql(`DELETE FROM conversation_participants WHERE conversation_id='${conv.id}'; DELETE FROM conversations WHERE id='${conv.id}';`);
  });

  it('CODEX F-01 FIX: an UNADDRESSED director (never added as a participant, recipient was the patient only) cannot read the conversation directly, despite covering the same patient', async () => {
    sql(`UPDATE staff_patient_assignments SET is_active=true WHERE organization_id='${ORG}' AND user_id='${ids.medical}' AND patient_id='${patientId}';`);

    const [createStatus, conv] = (await rpc('create_conversation', {
      p_patient_id: patientId, p_recipient_user_ids: [patientId], p_subject: 'C03 gap-2 probe (unaddressed)',
    }, tok.medical)) as [number, { id: string }];
    expect(createStatus).toBe(200);
    await rpc('send_message', { p_conversation_id: conv.id, p_body: 'director should NOT be able to read this', p_is_urgent: false, p_reply_to_message_id: null }, tok.medical);

    expect(sql(`SELECT count(*) FROM conversation_participants WHERE conversation_id='${conv.id}' AND user_id='${ids.director}';`)).toBe('0');

    const participants = await http('GET', `/rest/v1/conversation_participants?conversation_id=eq.${conv.id}`, undefined, tok.director) as [number, unknown[]];
    expect(participants[0]).toBe(200);
    expect((participants[1] as unknown[]).length).toBe(0);

    const messages = await http('GET', `/rest/v1/messages?conversation_id=eq.${conv.id}`, undefined, tok.director) as [number, unknown[]];
    expect(messages[0]).toBe(200);
    expect((messages[1] as unknown[]).length).toBe(0);

    sql(`DELETE FROM conversation_participants WHERE conversation_id='${conv.id}'; DELETE FROM conversations WHERE id='${conv.id}';`);
  });
});
