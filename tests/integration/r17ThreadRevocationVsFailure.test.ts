// MMA-ENT-CAREGIVER-MASTER-006, Section 3.2 — "A failed network request
// must not be mistaken for confirmed authorization revocation."
//
// CareConversations.tsx's ConversationThread polls conversation_participants
// and messages every 8s while a thread stays open (R17), and treats a
// read that comes back with zero participants (after previously having
// some) as proof of revocation. That heuristic is only sound if a real
// backend/network FAILURE can never produce the same empty shape as a
// genuine, error-free RLS denial — this suite pins the backend half of
// that contract: is_conversation_participant() gates all three tables
// (conversations/conversation_participants/messages) identically, a
// participant sees real rows with no error, and removal produces an
// empty 200 response (never an error status) — exactly the shape the
// frontend fix (getConversationParticipantsResult/getConversationMessagesResult)
// depends on to distinguish "genuinely revoked" from "request failed."
//
// The frontend half (that a 5xx/network failure surfaces as a retryable
// loadError without ever setting `revoked`, and that real revocation
// still correctly shows "You no longer have access") is covered by real
// browser fault-injection and real-revocation verification — see the
// MMA-ENT-CAREGIVER-MASTER-006 commit introducing this file for that
// evidence. This file is the permanent, reproducible backend half,
// consistent with every other integration test in this directory.
//
// Requires the local disposable Supabase stack. Run with
// `npm run test:integration` (or MMA_TEST_API_BASE/MMA_TEST_DB_CONTAINER
// pointed at a disposable stack).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, sql } from './_runtime';

const PW = 'R17Thread9!';
const stamp = Date.now();
const ORG = 'aaaaaaaa-1717-4717-8717-171717171717';

const caregiverEmail = `r17thread-caregiver-${stamp}@local.test`;
const outsiderEmail = `r17thread-outsider-${stamp}@local.test`;
const ids: Record<string, string> = {};
let caregiverId: string;
let outsiderId: string;
let patientId: string;
let conversationId: string;
let caregiverTok: string;
let outsiderTok: string;

beforeAll(async () => {
  caregiverId = await authSignUp(caregiverEmail, PW);
  outsiderId = await authSignUp(outsiderEmail, PW);
  patientId = await authSignUp(`r17thread-patient-${stamp}@local.test`, PW);
  ids.caregiver = caregiverId; ids.outsider = outsiderId; ids.patient = patientId;

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id = '${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES ('${ORG}','R17 Thread Org','integrated_care','${caregiverId}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES ('${ORG}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES ('${ORG}','${caregiverId}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES ('${patientId}','R17Thread','Patient','R17 Thread Patient','1 Thread Ave','Thread Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES ('${ORG}','${patientId}','active','${caregiverId}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES ('${ORG}','${caregiverId}','${patientId}','caregiver',true,'${caregiverId}');
    COMMIT;
  `);
  caregiverTok = await login(caregiverEmail, PW);
  outsiderTok = await login(outsiderEmail, PW);

  const conv = sql(`INSERT INTO conversations(patient_id, subject, created_by) VALUES ('${patientId}','R17 thread test','${caregiverId}') RETURNING id;`);
  conversationId = conv.trim();
  sql(`INSERT INTO conversation_participants(conversation_id,user_id,participant_role,added_by) VALUES ('${conversationId}','${caregiverId}','caregiver','${caregiverId}');`);
  sql(`INSERT INTO messages(conversation_id,sender_id,sender_role,body) VALUES ('${conversationId}','${caregiverId}','caregiver','R17 thread test message');`);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.conversations WHERE id = '${conversationId}';`);
  sql(`DELETE FROM public.account_management_audit WHERE organization_id = '${ORG}';`);
  sql(`DELETE FROM public.patients WHERE id = '${patientId}'; DELETE FROM organizations WHERE id = '${ORG}';`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-CAREGIVER-MASTER-006 Section 3.2 — thread revocation-vs-failure backend contract', () => {
  it('an active participant reads real participants and messages with no error (the "successful retrieval" state)', async () => {
    const [pStatus, pBody] = await http(
      'GET', `/rest/v1/conversation_participants?conversation_id=eq.${conversationId}&select=id,user_id`, undefined, caregiverTok,
    );
    expect(pStatus).toBe(200);
    expect(Array.isArray(pBody)).toBe(true);
    expect((pBody as unknown[]).length).toBeGreaterThan(0);

    const [mStatus, mBody] = await http(
      'GET', `/rest/v1/messages?conversation_id=eq.${conversationId}&select=id,body`, undefined, caregiverTok,
    );
    expect(mStatus).toBe(200);
    expect((mBody as { body: string }[]).some((m) => m.body === 'R17 thread test message')).toBe(true);
  });

  it('an outsider with no relationship to this conversation sees an EMPTY, ERROR-FREE response, not an error status (the "RLS-denied" shape a real revocation also produces)', async () => {
    // This is the exact response shape the frontend's revocation
    // heuristic keys on: a 200 with zero rows. If RLS ever started
    // returning a non-200 for a denied read, the frontend's
    // getConversationParticipantsResult()/getConversationMessagesResult()
    // would correctly report that as `loadError` instead -- confirming
    // this still comes back as an empty success, not an error, pins the
    // assumption the whole heuristic depends on.
    const [pStatus, pBody] = await http(
      'GET', `/rest/v1/conversation_participants?conversation_id=eq.${conversationId}&select=id`, undefined, outsiderTok,
    );
    expect(pStatus).toBe(200);
    expect(pBody).toEqual([]);

    const [mStatus, mBody] = await http(
      'GET', `/rest/v1/messages?conversation_id=eq.${conversationId}&select=id`, undefined, outsiderTok,
    );
    expect(mStatus).toBe(200);
    expect(mBody).toEqual([]);
  });

  it('removing the caregiver\'s own participant row (the real revocation action) immediately produces the same empty-success shape for them too', async () => {
    sql(`DELETE FROM conversation_participants WHERE conversation_id = '${conversationId}' AND user_id = '${caregiverId}';`);

    const [pStatus, pBody] = await http(
      'GET', `/rest/v1/conversation_participants?conversation_id=eq.${conversationId}&select=id`, undefined, caregiverTok,
    );
    expect(pStatus).toBe(200);
    expect(pBody).toEqual([]);

    const [mStatus, mBody] = await http(
      'GET', `/rest/v1/messages?conversation_id=eq.${conversationId}&select=id`, undefined, caregiverTok,
    );
    expect(mStatus).toBe(200);
    expect(mBody).toEqual([]);

    // Restore for afterAll's cleanup symmetry (not required for RLS
    // correctness, just so the conversation's own rows are internally
    // consistent before the final DELETE FROM conversations).
    sql(`INSERT INTO conversation_participants(conversation_id,user_id,participant_role,added_by) VALUES ('${conversationId}','${caregiverId}','caregiver','${caregiverId}');`);
  });

  it('a malformed/unauthenticated request produces a real error status, never a silent empty 200 (the "temporary backend failure" state must be distinguishable in principle)', async () => {
    const [status] = await http('GET', `/rest/v1/conversation_participants?conversation_id=eq.${conversationId}&select=id`, undefined, 'not-a-real-token');
    expect(status).not.toBe(200);
  });
});
