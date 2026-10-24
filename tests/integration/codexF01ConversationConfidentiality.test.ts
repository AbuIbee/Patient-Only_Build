// CODEX F-01 (P0, release-blocking) — "Conversation confidentiality
// and revocation regression." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 120.
//
// Reproduces the exact two defects the report names in
// is_conversation_participant() (migration 104), both via DIRECT REST
// table reads -- the precise bypass Codex identified, since
// get_my_conversations()/send_message() already revalidated correctly
// via migration 087 and would have masked these:
//   1. A participant whose underlying authorization for the patient
//      has since been revoked kept reading an existing conversation's
//      messages forever, because the first OR-branch only checked a
//      historical conversation_participants row, never current
//      authorization.
//   2. ANY current director-for-patient could read a conversation
//      directly, even one they were never added to (never "addressed"
//      as this report's language puts it) -- the second OR-branch had
//      no participant-row requirement at all.
// Also reproduces resolve_follow_up() and the attachment-upload INSERT
// policies never re-validating current participation (also named in
// F-01's "Minimum remediation").
//
// Every assertion here is a real REST/RPC call against RLS -- never a
// mocked permission check -- and a positive control (migration 087's
// actual intended case: a validly-addressed Director participant)
// proves the fix does not regress the feature 087 added.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'CodexF01Fix9!';
const stamp = Date.now();
const ORG = 'f0111111-0101-4f01-8f01-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director1: `f01-director1-${stamp}@local.test`, // addressed: added as an explicit recipient
  director2: `f01-director2-${stamp}@local.test`, // unaddressed: never added, but covers the same patient
  caregiver: `f01-caregiver-${stamp}@local.test`, // revoked mid-test
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let PATIENT_ID: string;
let CONV_ID: string;
let MESSAGE_ID: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `f01-patient-${stamp}@local.test`;
  ids.patient = await authSignUp(patientEmail, PW);
  PATIENT_ID = ids.patient;

  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');`);
  sql(`
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','F01 Confidentiality Org ${stamp}','integrated_care','${ids.director1}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director1}','director','active'),
      ('${ORG}','${ids.director2}','director','active'),
      ('${ORG}','${ids.caregiver}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${PATIENT_ID}','F01','Patient','F01 Patient','1 F01 Ave','F01 Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${PATIENT_ID}','active','${ids.director1}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiver}','${PATIENT_ID}','caregiver',true,'${ids.director1}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
  tok.patient = await login(patientEmail, PW);

  // The patient creates the conversation, explicitly addressing the
  // caregiver AND director1 -- director2 is deliberately never
  // mentioned anywhere, even though they are an equally valid active
  // director of the same org covering the same patient.
  const [, conv] = (await rpc('create_conversation', {
    p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.caregiver, ids.director1], p_subject: `F01 Confidentiality ${stamp}`,
  }, tok.patient)) as [number, { id: string }];
  CONV_ID = conv.id;
  const [, msg] = (await rpc('send_message', {
    p_conversation_id: CONV_ID, p_body: 'Baseline message', p_is_urgent: false, p_reply_to_message_id: null,
  }, tok.caregiver)) as [number, { id: string }];
  MESSAGE_ID = msg.id;
  await rpc('acknowledge_message', {
    p_message_id: MESSAGE_ID, p_follow_up_requested: true, p_follow_up_note: 'needs review', p_follow_up_due_date: null, p_follow_up_assigned_to: null,
  }, tok.caregiver);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM patients WHERE id='${PATIENT_ID}';`); // cascades conversations/messages/acks/attachments
  sql(`DELETE FROM organizations WHERE id='${ORG}';`); // cascades memberships/coverage/assignments
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('CODEX F-01 FIX (migration 120) — conversation confidentiality and revocation', () => {
  it('baseline: an addressed participant (caregiver) reads the conversation and its messages directly via REST', async () => {
    const [, convRows] = await http('GET', `/rest/v1/conversations?id=eq.${CONV_ID}&select=id`, undefined, tok.caregiver);
    expect((convRows as unknown[]).length).toBe(1);
    const [, msgRows] = await http('GET', `/rest/v1/messages?conversation_id=eq.${CONV_ID}&select=id`, undefined, tok.caregiver);
    expect((msgRows as unknown[]).length).toBe(1);
  });

  it('regression guard (migration 087\'s original intended case): an ADDRESSED Director participant, whose only authority is is_org_director_for_patient(), still reads the conversation directly', async () => {
    const [, convRows] = await http('GET', `/rest/v1/conversations?id=eq.${CONV_ID}&select=id`, undefined, tok.director1);
    expect((convRows as unknown[]).length).toBe(1);
    const [, msgRows] = await http('GET', `/rest/v1/messages?conversation_id=eq.${CONV_ID}&select=id`, undefined, tok.director1);
    expect((msgRows as unknown[]).length).toBe(1);
  });

  it('FIX: an UNADDRESSED Director (never added to this conversation, despite covering the same patient) cannot read it directly', async () => {
    const [, convRows] = await http('GET', `/rest/v1/conversations?id=eq.${CONV_ID}&select=id`, undefined, tok.director2);
    expect((convRows as unknown[]).length).toBe(0);
    const [, msgRows] = await http('GET', `/rest/v1/messages?conversation_id=eq.${CONV_ID}&select=id`, undefined, tok.director2);
    expect((msgRows as unknown[]).length).toBe(0);
    const [, participantRows] = await http('GET', `/rest/v1/conversation_participants?conversation_id=eq.${CONV_ID}&select=id`, undefined, tok.director2);
    expect((participantRows as unknown[]).length).toBe(0);
  });

  it('FIX: a participant whose underlying authorization has since been revoked loses direct-REST read access on their very next request', async () => {
    // Pre-revocation baseline already proved above. Revoke now.
    sql(`UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='${ORG}' AND user_id='${ids.caregiver}' AND patient_id='${PATIENT_ID}';`);

    const [, convRows] = await http('GET', `/rest/v1/conversations?id=eq.${CONV_ID}&select=id`, undefined, tok.caregiver);
    expect((convRows as unknown[]).length).toBe(0);
    const [, msgRows] = await http('GET', `/rest/v1/messages?conversation_id=eq.${CONV_ID}&select=id`, undefined, tok.caregiver);
    expect((msgRows as unknown[]).length).toBe(0);

    const [sendStatus] = await rpc('send_message', {
      p_conversation_id: CONV_ID, p_body: 'should be rejected', p_is_urgent: false, p_reply_to_message_id: null,
    }, tok.caregiver);
    expect(sendStatus).toBe(400);
  });

  it('FIX: resolve_follow_up() rejects a revoked participant even though they created and were assigned the follow-up', async () => {
    // caregiver is already revoked from the previous test.
    const [status] = await rpc('resolve_follow_up', { p_message_id: MESSAGE_ID }, tok.caregiver);
    expect(status).toBe(400);
    const stillOpen = sql(`SELECT follow_up_resolved FROM message_acknowledgments WHERE message_id='${MESSAGE_ID}' AND user_id='${ids.caregiver}';`);
    expect(stillOpen).toBe('f');
  });

  it('FIX: a revoked participant cannot upload a new attachment to their own old message', async () => {
    const [status] = await http('POST', '/rest/v1/message_attachments', {
      message_id: MESSAGE_ID, storage_path: `${MESSAGE_ID}/late-upload.txt`, file_name: 'late-upload.txt', uploaded_by: ids.caregiver,
    }, tok.caregiver);
    expect(status).toBe(403);
    const rows = sql(`SELECT count(*) FROM message_attachments WHERE message_id='${MESSAGE_ID}';`);
    expect(rows).toBe('0');
  });
});
