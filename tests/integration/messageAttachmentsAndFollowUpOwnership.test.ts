// Codex MMA-CODEX-11 — "complete missing messaging features." Migration
// 102 adds message_attachments (private Storage, RLS-governed, re-
// checked live so a removed participant loses access on their very next
// request) and follow-up due-date/assignable ownership on
// message_acknowledgments. This file exercises both at the RPC/RLS
// level directly against the real local stack.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'AttachOwn9!';
const stamp = Date.now();
const ORG = 'c0666666-6666-4666-8666-666666666666';

const emails = {
  caregiver: `mao-caregiver-${stamp}@local.test`,
  medical: `mao-medical-${stamp}@local.test`,
  outsider: `mao-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;
let conversationId: string;
let messageId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `mao-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','MAO Org','integrated_care','${ids.caregiver}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.caregiver}','caregiver','active'),
      ('${ORG}','${ids.medical}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','MAO','Patient','MAO Patient','1 MAO Ave','MAO Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.caregiver}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiver}','${patientId}','caregiver',true,'${ids.caregiver}'),
      ('${ORG}','${ids.medical}','${patientId}','medical_professional',true,'${ids.caregiver}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  const [, conv] = (await rpc('create_conversation', {
    p_patient_id: patientId, p_recipient_user_ids: [ids.medical], p_subject: 'MAO attachment/follow-up test',
  }, tok.caregiver)) as [number, { id: string }];
  conversationId = conv.id;
  const [, msg] = (await rpc('send_message', {
    p_conversation_id: conversationId, p_body: 'See attached', p_is_urgent: false, p_reply_to_message_id: null,
  }, tok.caregiver)) as [number, { id: string }];
  messageId = msg.id;
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

describe('Codex MMA-CODEX-11 — message_attachments authorization (migration 102)', () => {
  it('the message sender can register an attachment on their own message', async () => {
    const [insStatus] = await http('POST', '/rest/v1/message_attachments', { message_id: messageId, storage_path: `${messageId}/1_test.pdf`, file_name: 'test.pdf', uploaded_by: ids.caregiver }, tok.caregiver) as [number, unknown];
    expect(insStatus).toBe(201);
    expect(sql(`SELECT count(*) FROM message_attachments WHERE message_id='${messageId}';`)).toBe('1');
  });

  it('a different conversation participant (not the sender) cannot attach a file to that message', async () => {
    const [status] = await http('POST', '/rest/v1/message_attachments', { message_id: messageId, storage_path: `${messageId}/2_test.pdf`, file_name: 'test2.pdf', uploaded_by: ids.medical }, tok.medical) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('an outsider (not a conversation participant at all) cannot read or attach anything', async () => {
    const [readStatus, readBody] = await http('GET', `/rest/v1/message_attachments?message_id=eq.${messageId}`, undefined, tok.outsider) as [number, unknown[]];
    expect(readStatus).toBe(200);
    expect(readBody).toEqual([]); // RLS silently returns zero rows, not an error, for a non-participant SELECT
    const [insStatus] = await http('POST', '/rest/v1/message_attachments', { message_id: messageId, storage_path: `${messageId}/3_test.pdf`, file_name: 'test3.pdf', uploaded_by: ids.outsider }, tok.outsider) as [number, unknown];
    expect(insStatus).toBeGreaterThanOrEqual(400);
  });

  it('removing a participant immediately cuts off their read access to the conversation\'s attachments (revalidation on revocation)', async () => {
    const beforeRemoval = await http('GET', `/rest/v1/message_attachments?message_id=eq.${messageId}`, undefined, tok.medical) as [number, unknown[]];
    expect(beforeRemoval[0]).toBe(200);
    expect((beforeRemoval[1] as unknown[]).length).toBeGreaterThanOrEqual(1);

    const [removeStatus] = await rpc('remove_conversation_participant', { p_conversation_id: conversationId, p_user_id: ids.medical }, tok.caregiver);
    expect(removeStatus).toBe(200);

    const afterRemoval = await http('GET', `/rest/v1/message_attachments?message_id=eq.${messageId}`, undefined, tok.medical) as [number, unknown[]];
    expect(afterRemoval[0]).toBe(200);
    expect(afterRemoval[1]).toEqual([]);

    // Restore for subsequent tests.
    await rpc('add_conversation_participant', { p_conversation_id: conversationId, p_user_id: ids.medical }, tok.caregiver);
  });
});

describe('MMA-ENT-CAREGIVER-MASTER-003 R14 (P1) — attachment downloads cannot outlive revocation (migration 132)', () => {
  // The reproduced defect: createSignedUrl() only checks storage.objects
  // RLS at the moment the URL is minted; the resulting token then keeps
  // working regardless of later revocation. Migration 132's fix is to
  // remove the ability to mint one AT ALL — the only remaining read path
  // is the download-message-attachment Edge Function, which re-queries
  // message_attachments (and therefore is_conversation_participant())
  // fresh on every single call. This proves the storage-level closure;
  // the Edge Function's own live-recheck is exercised by the "removing a
  // participant immediately cuts off..." case above, since both paths
  // share the identical message_attachments RLS policy.
  it('a current, authorized participant still cannot mint a direct signed URL for a message attachment object', async () => {
    const storagePath = `${messageId}/1_test.pdf`; // registered by the first test in this file
    const [status] = await http(
      'POST',
      `/storage/v1/object/sign/conversation-attachments/${storagePath}`,
      { expiresIn: 3600 },
      tok.caregiver,
    ) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a current, authorized participant cannot directly download the object either', async () => {
    const storagePath = `${messageId}/1_test.pdf`;
    const [status] = await http('GET', `/storage/v1/object/authenticated/conversation-attachments/${storagePath}`, undefined, tok.caregiver) as [number, unknown];
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('Codex MMA-CODEX-11 — follow-up due date and assignable ownership (migration 102)', () => {
  it('acknowledging with a due date and an assignee who IS a live conversation participant succeeds', async () => {
    const [status, row] = (await rpc('acknowledge_message', {
      p_message_id: messageId, p_follow_up_requested: true, p_follow_up_note: 'please confirm dosage',
      p_follow_up_due_date: '2026-12-01', p_follow_up_assigned_to: ids.medical,
    }, tok.caregiver)) as [number, { follow_up_due_date: string; follow_up_assigned_to: string }];
    expect(status).toBe(200);
    expect(row.follow_up_due_date).toBe('2026-12-01');
    expect(row.follow_up_assigned_to).toBe(ids.medical);
  });

  it('assigning a follow-up to someone who is NOT a participant in this conversation is rejected', async () => {
    const [status, body] = (await rpc('acknowledge_message', {
      p_message_id: messageId, p_follow_up_requested: true, p_follow_up_note: 'test',
      p_follow_up_due_date: '2026-12-01', p_follow_up_assigned_to: ids.outsider,
    }, tok.caregiver)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('same conversation');
  });

  it('the ASSIGNED owner (not just the original acknowledger) can resolve the follow-up', async () => {
    // tok.caregiver created the ack row and assigned it to ids.medical
    // (previous test in this block). ids.medical never acknowledged
    // this message themselves, yet should still be able to resolve it.
    const [status] = await rpc('resolve_follow_up', { p_message_id: messageId }, tok.medical);
    expect(status).toBe(200);
    const resolved = sql(`SELECT follow_up_resolved FROM message_acknowledgments WHERE message_id='${messageId}' AND user_id='${ids.caregiver}';`);
    expect(resolved).toBe('t');
  });
});
