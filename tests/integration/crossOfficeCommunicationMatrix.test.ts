// MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave B — the cross-office
// (5 x 5 office) communication authorization matrix.
//
// CONFIRMED FINDING while building this matrix (DEFECT-DIRECTOR-NOT-A-
// PATIENT-CONVERSATION-PARTICIPANT, see the closure register): the
// Admin/Director office has NO schema-level path to become authorized
// for an individual patient's conversations at all.
// staff_patient_assignments_org_role_check restricts that table's
// org_role to ('caregiver','therapist','medical_professional') —
// 'director' is not a legal value, and assign_staff_to_patient() enforces
// the identical restriction in the RPC itself. is_authorized_for_patient()
// (migration 040) grants access only via self / caregiver_patients /
// staff_patient_assignments / therapist_relationships — there is no
// organization_memberships-based branch, so a director is never
// authorized for a specific patient purely by virtue of directing the
// org that covers them. This is confirmed live below (negative test),
// and it means W09's shipped "Message supervisor" feature
// (EnterpriseCaregiverDashboard.tsx messageSupervisor()) silently fails
// server-side for every real director, not just the already-disclosed
// "caregiver has zero assigned patients" edge case — the historical
// traceability CSV's W09/N11 PASS evidence only confirmed the button
// renders and calls createConversation(), never that a real send with
// a real director recipient succeeds. This is NOT fixed unilaterally
// here: a prior round's own adversarial test (C02, in
// 28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv) deliberately verified
// and praised "the org DIRECTOR was correctly rejected as a
// recipient... confirming least-privilege" as a GOOD security property.
// Reversing that to make W09 functional would be a real security-policy
// trade-off (loosen least-privilege for this one escalation path vs.
// leave the feature non-functional vs. redesign it outside the
// patient-scoped conversation system) — an owner decision, not a
// defect with one obvious correct fix. See closure register §4 item 6.
//
// So this test matrix is honest about what the schema actually
// supports: a true 4x4 grid across the 4 offices that DO have a real
// per-patient authorization path (Caregiver, Medical, Therapist,
// Patient), each tested in both directions including same-office
// diagonal pairs, PLUS explicit negative coverage proving Director is
// excluded in every direction and that admitting the matrix does not
// also admit an org-unrelated outsider regardless of claimed office.
//
// Grid: Caregiver, Medical, Therapist each get TWO distinct accounts
// (so same-office diagonal pairs — e.g. Caregiver-to-Caregiver — are a
// real two-party test, not a vacuous self-pair). Patient has exactly
// one real identity in this schema, so the Patient-to-Patient diagonal
// is not a constructible two-party scenario; it is reported as N/A with
// this justification, not silently skipped.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`. Creates and fully tears down its own
// fixture; never reads or writes any pre-existing data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

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

type ReachableOffice = 'caregiver' | 'medical' | 'therapist' | 'patient';

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
// the single patient identity. 'director' is intentionally NOT part of
// the matrix grid — see the file header: it has no schema path to
// per-patient authorization, and is covered by its own negative test
// instead of a fabricated matrix cell.
const officeAccounts: Record<ReachableOffice, [string, string?]> = {
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

const REACHABLE_OFFICES: ReachableOffice[] = ['caregiver', 'medical', 'therapist', 'patient'];

describe('Wave B — cross-office communication authorization matrix (4x4 of the 5 named offices; Director is schema-unreachable, see negative tests below)', () => {
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

        // The recipient can read it back; a conversation with their name
        // was really created, not merely a 200 with no actual recipient.
        const [readStatus, readBody] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tokOf(recipientName))) as [number, Array<{ conversation_id: string }>];
        expect(readStatus).toBe(200);
        expect(readBody.some((c) => c.conversation_id === body.id)).toBe(true);
      });
    }
  }

  it('records all 16 reachable-office-pair outcomes (15 executed, 1 structurally N/A) for the closure register', () => {
    expect(results.length).toBeGreaterThanOrEqual(15);
  });
});

describe('Wave B — negative: Director (the 5th office) has no schema path to patient-conversation participation', () => {
  it('an active org director cannot be added as a conversation recipient for a patient they are not individually assigned to (least-privilege preserved — see DEFECT-DIRECTOR-NOT-A-PATIENT-CONVERSATION-PARTICIPANT in the closure register)', async () => {
    const [status, body] = (await rpc(
      'create_conversation',
      { p_patient_id: PATIENT_ID, p_recipient_user_ids: [ids.director1], p_subject: 'XOM director recipient probe' },
      tok.caregiver1,
    )) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('not authorized');
  });

  it('that same director cannot read the conversation either (never added as a participant)', async () => {
    const [status, body] = (await rpc('get_my_conversations', { p_patient_id: PATIENT_ID }, tok.director1)) as [number, unknown[]];
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('the director cannot self-authorize by directly INSERTing into staff_patient_assignments with org_role=director either (table CHECK constraint, not merely RPC-level)', async () => {
    expect(() => sql(`INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${ORG}','${ids.director1}','${PATIENT_ID}','director',true,'${ids.director1}');`)).toThrow();
  });
});

describe('Wave B — negative: an account unauthorized for this patient is rejected in every direction, regardless of its own office/role', () => {
  it('the outsider cannot be added as a recipient by any of the 4 reachable offices', async () => {
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
