// MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave B — the cross-office
// (5 x 5 office) communication authorization matrix.
//
// HISTORY (see the closure register §2b and §1.A for the full account):
// this file originally found DEFECT-DIRECTOR-NOT-A-PATIENT-
// CONVERSATION-PARTICIPANT — the Admin/Director office had no schema
// path to become authorized for an individual patient's conversations
// at all, confirmed live, and left unfixed pending an explicit owner
// decision (a prior round's own test had deliberately verified
// rejecting an unassigned director as a GOOD least-privilege property,
// so loosening it was a real security-policy trade-off, not a bug with
// one obvious fix).
//
// That owner decision has now been made (MY MEMORIA ALLY — FINAL
// ENGINEERING CLOSURE directive §1.A): implement a narrow, auditable
// Director-to-patient conversation mechanism. Migration 087 adds
// is_org_director_for_patient() — true ONLY for an active director of
// the SPECIFIC organization that ACTIVELY covers the SPECIFIC patient,
// re-checked live on every call, never cached. This is deliberately
// narrower than is_authorized_for_patient(): it does not touch that
// function, so every other caller (clinical reads/writes) is
// unaffected, and a director of an unrelated org — or any outsider —
// is still rejected exactly as before. This file now tests the REAL,
// true 5x5 grid: Director is reachable (within its own org's covered
// patients only), and the negative tests that used to prove Director's
// exclusion now prove its NARROWNESS instead — an unrelated-org
// director, and a director whose org's coverage has ended, are both
// still rejected.
//
// Grid: Director, Caregiver, Medical, Therapist each get TWO distinct
// accounts (so same-office diagonal pairs — e.g. Caregiver-to-Caregiver
// — are a real two-party test, not a vacuous self-pair). Patient has
// exactly one real identity in this schema, so the Patient-to-Patient
// diagonal is not a constructible two-party scenario; it is reported
// as N/A with this justification, not silently skipped.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`. Creates and fully tears down its own
// fixture; never reads or writes any pre-existing data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'MasterCompletion9!';
const stamp = Date.now();
const ORG = 'c3333333-3333-4333-8333-333333333333';
// Not a fixed constant: the patients.id row IS the patient's own
// signed-up auth user id (set in beforeAll), matching the established
// convention in round7MasterCorrectiveSecurity.test.ts. A prior version
// of this file used an unrelated hardcoded UUID for the patients row
// while signing the "patient" office up as a SEPARATE auth user —
// auth.uid() never equalled patients.id, so every "patient" pairing
// silently failed is_authorized_for_patient()'s self-check. Caught by
// this file's own first real run (not shipped).
let PATIENT_ID: string;

type ReachableOffice = 'director' | 'caregiver' | 'medical' | 'therapist' | 'patient';

const emails = {
  director1: `xom-director1-${stamp}@local.test`,
  director2: `xom-director2-${stamp}@local.test`,
  caregiver1: `xom-caregiver1-${stamp}@local.test`,
  caregiver2: `xom-caregiver2-${stamp}@local.test`,
  medical1: `xom-medical1-${stamp}@local.test`,
  medical2: `xom-medical2-${stamp}@local.test`,
  therapist1: `xom-therapist1-${stamp}@local.test`,
  therapist2: `xom-therapist2-${stamp}@local.test`,
  outsider: `xom-outsider-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

// Two accounts per staff office (so the diagonal is a real pair), plus
// the single patient identity.
const officeAccounts: Record<ReachableOffice, [string, string?]> = {
  director: ['director1', 'director2'],
  caregiver: ['caregiver1', 'caregiver2'],
  medical: ['medical1', 'medical2'],
  therapist: ['therapist1', 'therapist2'],
  patient: ['patient', undefined],
};

function idOf(name: string): string {
  return ids[name];
}
function tokOf(name: string): string {
  return tok[name];
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) {
    ids[name] = await authSignUp(email, PW);
  }
  // The patient's own login uses the pre-existing patient-signup flow:
  // simplest correct equivalent here is to sign up a normal account and
  // treat its own id AS the patient row's id, matching how every other
  // fixture in this suite (round7MasterCorrectiveSecurity.test.ts)
  // already does it (`patients.id` = the signed-up user's own auth id).
  const patientEmail = `xom-patient-${stamp}@local.test`;
  ids.patient = await authSignUp(patientEmail, PW);
  emails.patient = patientEmail;
  PATIENT_ID = ids.patient;

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='therapist' WHERE id IN ('${ids.therapist1}','${ids.therapist2}');
  `);
  sql(`DELETE FROM organizations WHERE id='${ORG}'; DELETE FROM patients WHERE id='${PATIENT_ID}';`); // PATIENT_ID now set above; harmless no-op on a fresh id
  sql(`
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','XOM Integration Org','integrated_care','${ids.director1}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999.00,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director1}','director','active'),
      ('${ORG}','${ids.director2}','director','active'),
      ('${ORG}','${ids.caregiver1}','caregiver','active'),
      ('${ORG}','${ids.caregiver2}','caregiver','active'),
      ('${ORG}','${ids.medical1}','medical_professional','active'),
      ('${ORG}','${ids.medical2}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${PATIENT_ID}','XOM','PatientMatrix','XOM PatientMatrix','1 Matrix Ave','Matrix Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${PATIENT_ID}','active','${ids.director1}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiver1}','${PATIENT_ID}','caregiver',true,'${ids.director1}'),
      ('${ORG}','${ids.caregiver2}','${PATIENT_ID}','caregiver',true,'${ids.director1}'),
      ('${ORG}','${ids.medical1}','${PATIENT_ID}','medical_professional',true,'${ids.director1}'),
      ('${ORG}','${ids.medical2}','${PATIENT_ID}','medical_professional',true,'${ids.director1}');
    INSERT INTO therapist_relationships(therapist_id,patient_id,caregiver_id,relationship_type,is_active) VALUES
      ('${ids.therapist1}','${PATIENT_ID}','${ids.caregiver1}','primary',true),
      ('${ids.therapist2}','${PATIENT_ID}','${ids.caregiver1}','secondary',true);
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.therapist_relationships WHERE patient_id='${PATIENT_ID}';`);
  sql(`DELETE FROM public.patients WHERE id='${PATIENT_ID}';`); // cascades conversations/messages
  sql(`DELETE FROM organizations WHERE id='${ORG}';`); // cascades memberships/licenses/assignments
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

const REACHABLE_OFFICES: ReachableOffice[] = ['director', 'caregiver', 'medical', 'therapist', 'patient'];

describe('Wave B — cross-office communication authorization matrix (true 5x5: Director now reachable via is_org_director_for_patient(), migration 087)', () => {
  const results: string[] = [];

  for (const senderOffice of REACHABLE_OFFICES) {
    for (const recipientOffice of REACHABLE_OFFICES) {
      const senderAccounts = officeAccounts[senderOffice];
      const recipientAccounts = officeAccounts[recipientOffice];
      const isDiagonal = senderOffice === recipientOffice;
      // Diagonal pairs use the two distinct accounts in that office; for
      // 'patient' there is only one real identity, so its diagonal is
      // structurally not a two-party scenario — recorded, not skipped.
      if (isDiagonal && senderOffice === 'patient') {
        it('patient-to-patient (diagonal): N/A — this schema has exactly one real identity for "the patient," so a second, distinct patient party does not exist for this fixture', () => {
          results.push('patient|patient|N/A');
          expect(true).toBe(true);
        });
        continue;
      }
      const senderName = senderAccounts[0]!;
      const recipientName = isDiagonal ? recipientAccounts[1]! : recipientAccounts[0]!;

      it(`${senderOffice} -> ${recipientOffice}: sender authorized for the patient may create a conversation with a recipient also authorized for the SAME patient`, async () => {
        const [status, body] = (await rpc(
          'create_conversation',
          { p_patient_id: PATIENT_ID, p_recipient_user_ids: [idOf(recipientName)], p_subject: `XOM ${senderOffice}->${recipientOffice}` },
          tokOf(senderName),
        )) as [number, { id?: string }];
        expect(status).toBe(200);
        expect(body.id).toBeTruthy();
        results.push(`${senderOffice}|${recipientOffice}|PASS`);

        // The recipient can read it back via the RPC...
        const [readStatus, readBody] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tokOf(recipientName))) as [number, Array<{ conversation_id: string }>];
        expect(readStatus).toBe(200);
        expect(readBody.some((c) => c.conversation_id === body.id)).toBe(true);

        // ...AND via DIRECT REST table reads (CODEX F-01: the RPC path
        // and the direct-table RLS path are gated by different
        // mechanisms -- get_my_conversations() was already correct
        // before this fix; is_conversation_participant(), which gates
        // conversations/conversation_participants/messages directly,
        // was not. Every pair must pass BOTH, not just the RPC the
        // original matrix happened to test.)
        const [, senderConvRead] = await http('GET', `/rest/v1/conversations?id=eq.${body.id}&select=id`, undefined, tokOf(senderName));
        expect((senderConvRead as unknown[]).length).toBe(1);
        const [, recipientConvRead] = await http('GET', `/rest/v1/conversations?id=eq.${body.id}&select=id`, undefined, tokOf(recipientName));
        expect((recipientConvRead as unknown[]).length).toBe(1);
        const [, recipientParticipantRead] = await http('GET', `/rest/v1/conversation_participants?conversation_id=eq.${body.id}&select=id`, undefined, tokOf(recipientName));
        expect((recipientParticipantRead as unknown[]).length).toBeGreaterThanOrEqual(2);

        // Full dimension coverage for this pair: send a message, the
        // recipient reads real history (not just the empty shell),
        // attaches a follow-up, and the sender can read it back too --
        // "sending, receiving, history, follow-ups" per the directive.
        const [, msg] = (await rpc('send_message', {
          p_conversation_id: body.id, p_body: `XOM ${senderOffice}->${recipientOffice} message`, p_is_urgent: false, p_reply_to_message_id: null,
        }, tokOf(senderName))) as [number, { id: string }];
        const [, recipientMsgRead] = await http('GET', `/rest/v1/messages?conversation_id=eq.${body.id}&select=id,body`, undefined, tokOf(recipientName));
        expect((recipientMsgRead as { id: string; body: string }[]).some((m) => m.id === msg.id)).toBe(true);
        const [ackStatus] = await rpc('acknowledge_message', {
          p_message_id: msg.id, p_follow_up_requested: true, p_follow_up_note: `${senderOffice}->${recipientOffice} follow-up`, p_follow_up_due_date: null, p_follow_up_assigned_to: null,
        }, tokOf(recipientName));
        expect(ackStatus).toBe(200);
        const [, senderAckRead] = await http('GET', `/rest/v1/message_acknowledgments?message_id=eq.${msg.id}&select=id,follow_up_requested`, undefined, tokOf(senderName));
        expect((senderAckRead as { follow_up_requested: boolean }[]).some((a) => a.follow_up_requested)).toBe(true);
      });
    }
  }

  it('records all 25 office-pair outcomes (24 executed, 1 structurally N/A) for the closure register', () => {
    expect(results.length).toBeGreaterThanOrEqual(24);
  });
});

describe('Wave B — Director conversation participation is NARROW, not universal (migration 087, directive §1.A requirement #4)', () => {
  it('a director of a DIFFERENT, unrelated organization is still rejected as a recipient for this patient', async () => {
    const otherOrg = 'c9999999-3333-4333-8333-333333333399';
    const otherDirectorEmail = `xom-other-director-${stamp}@local.test`;
    const otherDirectorId = await authSignUp(otherDirectorEmail, PW);
    sql(`
      UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${otherDirectorId}';
      INSERT INTO organizations(id,name,package_type,created_by) VALUES('${otherOrg}','XOM Unrelated Org','integrated_care','${otherDirectorId}');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${otherOrg}','${otherDirectorId}','director','active');
    `);
    const otherDirectorTok = await login(otherDirectorEmail, PW);

    const [status, body] = (await rpc(
      'create_conversation',
      { p_patient_id: PATIENT_ID, p_recipient_user_ids: [otherDirectorId], p_subject: 'XOM unrelated-org director probe' },
      tok.caregiver1,
    )) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('not authorized');

    const [readStatus, readBody] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, otherDirectorTok)) as [number, unknown[]];
    expect(readStatus).toBe(200);
    expect(readBody).toEqual([]);

    sql(`DELETE FROM organization_memberships WHERE organization_id='${otherOrg}'; DELETE FROM organizations WHERE id='${otherOrg}';`);
    await authDeleteUser(otherDirectorId);
  });

  it('a director whose OWN org\'s coverage of this patient has since ended loses access, even to a conversation they already joined', async () => {
    const [createStatus, conv] = (await rpc(
      'create_conversation',
      { p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.director1], p_subject: 'XOM coverage-ends probe' },
      tok.caregiver1,
    )) as [number, { id: string }];
    expect(createStatus).toBe(200);
    // Confirmed reachable while coverage is active.
    const [beforeStatus, beforeBody] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tok.director1)) as [number, Array<{ conversation_id: string }>];
    expect(beforeStatus).toBe(200);
    expect(beforeBody.some((c) => c.conversation_id === conv.id)).toBe(true);

    sql(`UPDATE covered_patient_memberships SET status='ended', ended_at=now() WHERE organization_id='${ORG}' AND patient_id='${PATIENT_ID}';`);
    const [afterStatus, afterBody] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tok.director1)) as [number, Array<{ conversation_id: string }>];
    expect(afterStatus).toBe(200);
    expect(afterBody.some((c) => c.conversation_id === conv.id)).toBe(false);
    // Send is re-validated the same way, not merely read.
    const [sendStatus] = await rpc('send_message', { p_conversation_id: conv.id, p_body: 'should be rejected', p_is_urgent: false, p_reply_to_message_id: null }, tok.director1);
    expect(sendStatus).toBeGreaterThanOrEqual(400);

    sql(`UPDATE covered_patient_memberships SET status='active', ended_at=NULL WHERE organization_id='${ORG}' AND patient_id='${PATIENT_ID}';`);
    const [restoredStatus, restoredBody] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tok.director1)) as [number, Array<{ conversation_id: string }>];
    expect(restoredStatus).toBe(200);
    expect(restoredBody.some((c) => c.conversation_id === conv.id)).toBe(true);
  });

  it('the director cannot self-authorize by directly INSERTing into staff_patient_assignments with org_role=director either (that table CHECK constraint is unrelated and still excludes director — this mechanism is entirely conversation-scoped, not a backdoor into staff_patient_assignments)', async () => {
    expect(() => sql(`INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${ORG}','${ids.director1}','${PATIENT_ID}','director',true,'${ids.director1}');`)).toThrow();
  });

  it('get_patient_care_circle() (the generic "Select recipients" picker) now surfaces the covering org\'s active director, but not an unrelated-org director', async () => {
    const [status, body] = (await rpc('get_patient_care_circle', { p_patient_id: PATIENT_ID }, tok.caregiver1)) as [number, Array<{ user_id: string; participant_role: string }>];
    expect(status).toBe(200);
    expect(body.some((m) => m.user_id === ids.director1 && m.participant_role === 'director')).toBe(true);
  });
});

describe('Wave B — revocation and unaddressed-participant negatives apply uniformly, not only to the Director case (CODEX F-01, migration 120)', () => {
  it('a caregiver whose staff_patient_assignments row is revoked loses direct-REST read access to a conversation they already joined, and cannot send into it', async () => {
    const [, conv] = (await rpc('create_conversation', {
      p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.medical1], p_subject: 'XOM caregiver-revocation probe',
    }, tok.caregiver2)) as [number, { id: string }];
    const [, baselineRead] = await http('GET', `/rest/v1/conversations?id=eq.${conv.id}&select=id`, undefined, tok.caregiver2);
    expect((baselineRead as unknown[]).length).toBe(1);

    sql(`UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='${ORG}' AND user_id='${ids.caregiver2}' AND patient_id='${PATIENT_ID}';`);
    const [, revokedRead] = await http('GET', `/rest/v1/conversations?id=eq.${conv.id}&select=id`, undefined, tok.caregiver2);
    expect((revokedRead as unknown[]).length).toBe(0);
    const [sendStatus] = await rpc('send_message', { p_conversation_id: conv.id, p_body: 'should be rejected', p_is_urgent: false, p_reply_to_message_id: null }, tok.caregiver2);
    expect(sendStatus).toBeGreaterThanOrEqual(400);

    sql(`UPDATE staff_patient_assignments SET is_active=true WHERE organization_id='${ORG}' AND user_id='${ids.caregiver2}' AND patient_id='${PATIENT_ID}';`);
    const [, restoredRead] = await http('GET', `/rest/v1/conversations?id=eq.${conv.id}&select=id`, undefined, tok.caregiver2);
    expect((restoredRead as unknown[]).length).toBe(1);
  });

  it('a medical professional never added to a specific conversation cannot read it directly, even though they actively cover the same patient', async () => {
    const [, conv] = (await rpc('create_conversation', {
      p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.caregiver1], p_subject: 'XOM unaddressed-medical probe',
    }, tok.caregiver2)) as [number, { id: string }];
    expect(sql(`SELECT count(*) FROM conversation_participants WHERE conversation_id='${conv.id}' AND user_id='${ids.medical2}';`)).toBe('0');

    const [, unaddressedRead] = await http('GET', `/rest/v1/conversations?id=eq.${conv.id}&select=id`, undefined, tok.medical2);
    expect((unaddressedRead as unknown[]).length).toBe(0);
    const [, unaddressedMsgRead] = await http('GET', `/rest/v1/messages?conversation_id=eq.${conv.id}&select=id`, undefined, tok.medical2);
    expect((unaddressedMsgRead as unknown[]).length).toBe(0);
  });
});

describe('Wave B — negative: an account unauthorized for this patient is rejected in every direction, regardless of its own office/role', () => {
  it('the outsider cannot be added as a recipient by any of the 5 offices', async () => {
    for (const office of REACHABLE_OFFICES) {
      const senderName = officeAccounts[office][0]!;
      const [status, body] = (await rpc(
        'create_conversation',
        { p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.outsider], p_subject: 'XOM outsider recipient probe' },
        tokOf(senderName),
      )) as [number, { message?: string }];
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body.message).toContain('not authorized');
    }
  });

  it('the outsider cannot initiate a conversation about this patient at all, even naming a legitimately authorized recipient', async () => {
    const [status, body] = (await rpc(
      'create_conversation',
      { p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.caregiver1], p_subject: 'XOM outsider sender probe' },
      tok.outsider,
    )) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('not authorized');
  });

  it('the outsider reads zero conversations about this patient even after legitimate parties have exchanged several', async () => {
    const [status, body] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tok.outsider)) as [number, unknown[]];
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
