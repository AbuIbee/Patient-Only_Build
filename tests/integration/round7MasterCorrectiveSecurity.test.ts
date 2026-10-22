// MASTER CORRECTIVE ENGINEERING ORDER — committed, repeatable
// regression coverage for SEC-01 through SEC-06 and FUNC-01, each
// preserving the EXACT original failure condition an independent
// Codex audit (codex_round7_independent_audit/) reproduced against
// this codebase at commit b7352408, before migration 076's fixes:
//
//   SEC-01  DEFECT-THER-ACCEPT-REVOKE-RACE / DEFECT-THER-RACE-RETAINS-WRITE
//   SEC-02  DEFECT-AMENDMENT-AFTER-REVOCATION / DEFECT-VISIT-START-AFTER-REVOCATION / DEFECT-VISIT-END-AFTER-REVOCATION
//   SEC-03  DEFECT-DIRECT-VERIFIED-CODE-STATUS / DEFECT-DIRECT-PROFESSIONAL-{diagnoses,allergies,vitals}
//   SEC-04  DEFECT-ORDINARY-CAREGIVER-SUPERSEDES-CAREPLAN
//   SEC-05  DEFECT-TASK-AUDIT-IDENTITY-FORGERY
//   SEC-06  DEFECT-CAREGIVER-BILLING-READ
//   FUNC-01 DEFECT-VISIT-NOTES-NOT-REQUIRED
//
// Requires the local Docker Supabase stack (supabase_db_repo et al.)
// running on 127.0.0.1:55321. Run with `npm run test:integration`.
// Creates and fully tears down its own synthetic fixture; never reads
// or writes any pre-existing data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, http, login, rpc, runConcurrentAcceptHoldingLock, sql } from './_runtime';

const PW = 'MasterCorrective9!';
const stamp = Date.now();
const emails = {
  directorA: `r7mc-directorA-${stamp}@local.test`,
  caregiverA: `r7mc-caregiverA-${stamp}@local.test`,
  medicalA: `r7mc-medicalA-${stamp}@local.test`,
  therapistT: `r7mc-therapistT-${stamp}@local.test`,
  patientA: `r7mc-patientA-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const ORG = 'a2222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) {
    ids[name] = await authSignUp(email, PW);
  }
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='therapist' WHERE id='${ids.therapistT}';
  `);
  sql(`DELETE FROM organizations WHERE id='${ORG}';`);
  sql(`
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','R7MC Integration Org','integrated_care','${ids.directorA}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999.00,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.directorA}','director','active'),
      ('${ORG}','${ids.caregiverA}','caregiver','active'),
      ('${ORG}','${ids.medicalA}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${ids.patientA}','R7MC','PatientA','R7MC PatientA','1 Integration Ave','Integration Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${ids.patientA}','active','${ids.directorA}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.caregiverA}','${ids.patientA}','caregiver',true,'${ids.directorA}'),
      ('${ORG}','${ids.medicalA}','${ids.patientA}','medical_professional',true,'${ids.directorA}');
    INSERT INTO tasks(patient_id,title,status,is_active) VALUES('${ids.patientA}','R7MC task','pending',true);
    INSERT INTO caregiver_visits(organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,status) VALUES
      ('${ORG}','${ids.patientA}','${ids.caregiverA}', now() - interval '1 hour', now(), 'scheduled');
    INSERT INTO patient_notes(patient_id,author_id,note,note_type) VALUES('${ids.patientA}','${ids.caregiverA}','R7MC original general note','general');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM public.therapist_relationships WHERE therapist_id='${ids.therapistT}' OR caregiver_id='${ids.caregiverA}';
    DELETE FROM public.pending_therapist_connections WHERE therapist_id='${ids.therapistT}' OR caregiver_id='${ids.caregiverA}';
  `);
  // Cascades to tasks/caregiver_visits/patient_notes/patient_diagnoses/
  // patient_allergies/patient_vitals/patient_care_plans/conversations
  // (all FK patient_id ... ON DELETE CASCADE) -- without this, a
  // hardcoded fixture title (e.g. 'R7MC task') would collide with a
  // leftover row from a prior run's aborted/failed teardown.
  sql(`DELETE FROM public.patients WHERE id='${ids.patientA}';`);
  sql(`DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('SEC-01 — therapist accept/revoke race no longer leaves an active relationship behind a revoked connection', () => {
  it('a revoke that races a concurrent accept deactivates the relationship once the race resolves, and the therapist can no longer write', async () => {
    const [st, invite] = (await rpc(
      'caregiver_invite_therapist',
      { p_patient_id: ids.patientA, p_therapist_email: emails.therapistT },
      tok.caregiverA,
    )) as [number, { id: string }];
    expect(st).toBe(200);

    const race = runConcurrentAcceptHoldingLock(invite.id, ids.therapistT, 3);
    await race.waitForSleep(10000);

    const [revokeStatus] = await rpc(
      'revoke_therapist_connection',
      { p_patient_id: ids.patientA, p_therapist_id: ids.therapistT },
      tok.caregiverA,
    );
    await race.waitForExit();

    const finalState = sql(
      `SELECT p.status||'|'||t.is_active::text FROM public.pending_therapist_connections p JOIN public.therapist_relationships t USING(patient_id,therapist_id) WHERE p.id='${invite.id}';`,
    );
    expect(revokeStatus).toBe(200);
    // Before migration 076: this was 'revoked|true' (DEFECT-THER-ACCEPT-REVOKE-RACE).
    expect(finalState).toBe('revoked|false');

    const [writeStatus] = await http(
      'POST',
      '/rest/v1/patient_notes',
      { patient_id: ids.patientA, author_id: ids.therapistT, note: 'post-race write attempt', note_type: 'therapist_session' },
      tok.therapistT,
    );
    // Before migration 076: this was 201 (DEFECT-THER-RACE-RETAINS-WRITE).
    expect(writeStatus).toBeGreaterThanOrEqual(400);
  }, 20000);
});

describe('SEC-02 — revoked staff cannot amend notes or start/end visits for a patient they no longer hold an active assignment for', () => {
  it('note amendment, visit start, and visit end are all denied once the assignment is deactivated, and resume once restored', async () => {
    const noteId = sql(`SELECT id FROM public.patient_notes WHERE patient_id='${ids.patientA}' AND note='R7MC original general note';`);
    const visitId = sql(
      `SELECT id FROM public.caregiver_visits WHERE patient_id='${ids.patientA}' AND caregiver_id='${ids.caregiverA}' AND status='scheduled' LIMIT 1;`,
    );
    sql(`UPDATE public.staff_patient_assignments SET is_active=false WHERE user_id='${ids.caregiverA}' AND patient_id='${ids.patientA}';`);

    const [amendStatus] = await rpc(
      'record_note_amendment',
      { p_original_note_id: noteId, p_corrected_note: 'amendment after revocation' },
      tok.caregiverA,
    );
    // Before migration 076: this was 200 (DEFECT-AMENDMENT-AFTER-REVOCATION).
    expect(amendStatus).toBeGreaterThanOrEqual(400);

    const [startStatus] = await rpc('start_caregiver_visit', { p_visit_id: visitId }, tok.caregiverA);
    // Before migration 076: this was 200 (DEFECT-VISIT-START-AFTER-REVOCATION).
    expect(startStatus).toBeGreaterThanOrEqual(400);

    sql(`UPDATE public.staff_patient_assignments SET is_active=true WHERE user_id='${ids.caregiverA}' AND patient_id='${ids.patientA}';`);
    const [resumedStartStatus] = await rpc('start_caregiver_visit', { p_visit_id: visitId }, tok.caregiverA);
    expect(resumedStartStatus).toBe(200);

    sql(`UPDATE public.staff_patient_assignments SET is_active=false WHERE user_id='${ids.caregiverA}' AND patient_id='${ids.patientA}';`);
    const [endStatus] = await rpc('end_caregiver_visit', { p_visit_id: visitId, p_visit_notes: 'end after revocation' }, tok.caregiverA);
    // Before migration 076: this was 200 (DEFECT-VISIT-END-AFTER-REVOCATION).
    expect(endStatus).toBeGreaterThanOrEqual(400);
    sql(`UPDATE public.staff_patient_assignments SET is_active=true WHERE user_id='${ids.caregiverA}' AND patient_id='${ids.patientA}';`);
  }, 20000);
});

describe('FUNC-01 — a visit cannot be completed without real visit notes', () => {
  it('rejects empty/whitespace-only notes and accepts real ones', async () => {
    const visitId = sql(
      `SELECT id FROM public.caregiver_visits WHERE patient_id='${ids.patientA}' AND caregiver_id='${ids.caregiverA}' AND status='in_progress' LIMIT 1;`,
    );
    const [emptyStatus] = await rpc('end_caregiver_visit', { p_visit_id: visitId, p_visit_notes: '   ' }, tok.caregiverA);
    // Before migration 076: visit_notes could be NULL and the visit still completed (DEFECT-VISIT-NOTES-NOT-REQUIRED).
    expect(emptyStatus).toBeGreaterThanOrEqual(400);
    const [realStatus] = await rpc('end_caregiver_visit', { p_visit_id: visitId, p_visit_notes: 'Real visit notes recorded' }, tok.caregiverA);
    expect(realStatus).toBe(200);
  });
});

describe('SEC-03 — provenance-tier claims are enforced at the table/column level, not only inside the RPC', () => {
  it('denies a direct patients.code_status write to a verified tier by a non-professional', async () => {
    const [patchStatus] = await http(
      'PATCH',
      `/rest/v1/patients?id=eq.${ids.patientA}`,
      { code_status: 'dnr', code_status_source: 'verified_source' },
      tok.patientA,
    );
    const forged = sql(`SELECT code_status||'|'||code_status_source FROM public.patients WHERE id='${ids.patientA}';`);
    // Before migration 076: patchStatus 200, forged 'dnr|verified_source' (DEFECT-DIRECT-VERIFIED-CODE-STATUS).
    expect(patchStatus).toBeGreaterThanOrEqual(400);
    expect(forged).toBe('unknown|unknown');
  });

  it.each(['patient_diagnoses', 'patient_allergies', 'patient_vitals'])(
    'denies a direct %s insert claiming a professional-tier source from an ordinary caregiver',
    async (table) => {
      const payloads: Record<string, Record<string, unknown>> = {
        patient_diagnoses: { patient_id: ids.patientA, condition_name: 'forged', source: 'professional_observation', author_id: ids.caregiverA },
        patient_allergies: { patient_id: ids.patientA, allergen: 'forged', source: 'verified_source', author_id: ids.caregiverA },
        patient_vitals: { patient_id: ids.patientA, pulse_bpm: 70, source: 'professional_observation', author_id: ids.caregiverA },
      };
      const [status] = await http('POST', `/rest/v1/${table}`, payloads[table], tok.caregiverA);
      // Before migration 076: this was 201, 1 persisted row (DEFECT-DIRECT-PROFESSIONAL-<table>).
      expect(status).toBeGreaterThanOrEqual(400);
    },
  );

  it('still allows the SAME professional-tier claim through the RPC from an actual medical professional', async () => {
    const [status] = await rpc('record_patient_vitals', { p_patient_id: ids.patientA, p_pulse_bpm: 72, p_source: 'professional_observation' }, tok.medicalA);
    expect(status).toBe(200);
  });
});

describe('SEC-04 — only professional staff may author or supersede a care plan', () => {
  it('denies an ordinary caregiver and allows a medical professional', async () => {
    const [ordinaryStatus] = await rpc('record_patient_care_plan', { p_patient_id: ids.patientA, p_goals: 'forged care plan' }, tok.caregiverA);
    // Before migration 076: this was 200 (DEFECT-ORDINARY-CAREGIVER-SUPERSEDES-CAREPLAN).
    expect(ordinaryStatus).toBeGreaterThanOrEqual(400);
    const [proStatus] = await rpc('record_patient_care_plan', { p_patient_id: ids.patientA, p_goals: 'legitimate care plan' }, tok.medicalA);
    expect(proStatus).toBe(200);
  });
});

describe('SEC-05 — task status_updated_by cannot be forged to another user', () => {
  it('overrides any client-supplied actor with the real caller', async () => {
    const taskId = sql(`SELECT id FROM public.tasks WHERE patient_id='${ids.patientA}' AND title='R7MC task';`);
    const [patchStatus] = await http('PATCH', `/rest/v1/tasks?id=eq.${taskId}`, { status: 'completed', status_updated_by: ids.directorA }, tok.caregiverA);
    const actor = sql(`SELECT status_updated_by FROM public.tasks WHERE id='${taskId}';`);
    expect(patchStatus).toBe(200);
    // Before migration 076: actor could be forged to directorA's id (DEFECT-TASK-AUDIT-IDENTITY-FORGERY).
    expect(actor).toBe(ids.caregiverA);
  });
});

describe('FUNC-03 — inbox classification reflects a real open follow-up, not merely unread state', () => {
  it('a conversation with every message read but an unresolved follow-up request is classified as needing a response, not routine', async () => {
    const [convStatus, conv] = (await rpc(
      'create_conversation',
      { p_patient_id: ids.patientA, p_recipient_user_ids: [ids.medicalA], p_subject: 'FUNC-03/04 test' },
      tok.caregiverA,
    )) as [number, { id: string }];
    expect(convStatus).toBe(200);

    await rpc('send_message', { p_conversation_id: conv.id, p_body: 'historical-needle message', p_is_urgent: false, p_reply_to_message_id: null, p_message_type: 'message' }, tok.caregiverA);
    await rpc('send_message', { p_conversation_id: conv.id, p_body: 'latest message, no needle here', p_is_urgent: false, p_reply_to_message_id: null, p_message_type: 'message' }, tok.caregiverA);

    const needleMessageId = sql(`SELECT id FROM public.messages WHERE conversation_id='${conv.id}' AND body='historical-needle message';`);
    const latestMessageId = sql(`SELECT id FROM public.messages WHERE conversation_id='${conv.id}' AND body='latest message, no needle here';`);
    await rpc('mark_message_read', { p_message_id: needleMessageId }, tok.medicalA);
    await rpc('mark_message_read', { p_message_id: latestMessageId }, tok.medicalA);
    await rpc('acknowledge_message', { p_message_id: needleMessageId, p_follow_up_requested: true, p_follow_up_note: 'please confirm' }, tok.medicalA);

    const [listStatus, list] = (await rpc('get_my_conversations', { p_patient_id: null }, tok.medicalA)) as [
      number,
      Array<{ conversation_id: string; unread_count: number; has_open_follow_up: boolean }>,
    ];
    expect(listStatus).toBe(200);
    const row = list.find((r) => r.conversation_id === conv.id);
    expect(row).toBeDefined();
    // Before migration 077: has_open_follow_up did not exist; the UI
    // used unread_count > 0 as its proxy, which is 0 here (everything
    // read) and so wrongly fell into "Routine" (UI-INBOX-READ-FOLLOWUP-MISCLASSIFIED).
    expect(Number(row!.unread_count)).toBe(0);
    expect(row!.has_open_follow_up).toBe(true);
  });
});

describe('FUNC-04 — searching finds a match anywhere in a conversation’s message history, not only its latest message', () => {
  it('search_my_conversations finds a conversation by an older, non-latest message', async () => {
    const convId = sql(`SELECT conversation_id FROM public.messages WHERE body='historical-needle message' LIMIT 1;`);
    const [status, matches] = (await rpc('search_my_conversations', { p_search_term: 'historical-needle' }, tok.medicalA)) as [
      number,
      Array<{ conversation_id: string }>,
    ];
    expect(status).toBe(200);
    // Before migration 077: no such RPC existed; the client-side filter
    // only checked the latest message body and found nothing (UI-C06-HISTORICAL-SEARCH-MISSING).
    expect(matches.map((m) => m.conversation_id)).toContain(convId);
  });
});

describe('MASTER CORRECTIVE 2 — SEC-03 follow-up: verified_source is gated identically to professional_observation, in the RPCs themselves (not only table RLS)', () => {
  it.each([
    ['record_patient_diagnosis', { p_condition_name: 'forged verified' }, 'patient_diagnoses'],
    ['record_patient_allergy', { p_allergen: 'forged verified' }, 'patient_allergies'],
    ['record_patient_vitals', { p_pulse_bpm: 71 }, 'patient_vitals'],
  ] as const)('%s denies an ordinary caregiver claiming verified_source, and persists nothing', async (rpcName, extraArgs, table) => {
    const [status, body] = (await rpc(rpcName, { ...extraArgs, p_patient_id: ids.patientA, p_source: 'verified_source' }, tok.caregiverA)) as [number, { id?: string }];
    // Before migration 079: these RPCs only checked p_source ===
    // 'professional_observation', never 'verified_source' — status
    // 200, persisted (SEC03-RPC-record_patient_diagnosis/allergy/vitals).
    expect(status).toBeGreaterThanOrEqual(400);
    if (body?.id) {
      const count = sql(`SELECT count(*) FROM public.${table} WHERE id='${body.id}';`);
      expect(count).toBe('0');
    }
  });

  it('a direct patients.communication_needs_source write to verified_source by the patient themself is denied', async () => {
    const [status] = await http('PATCH', `/rest/v1/patients?id=eq.${ids.patientA}`, { communication_needs_source: 'verified_source' }, tok.patientA);
    // Before migration 079: the trigger only checked 'professional_observation', never 'verified_source' (DEFECT SEC03-COMM-VERIFIED).
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('content already attributed to a professional source cannot be silently overwritten by a non-professional who leaves the source column untouched', async () => {
    const [proStatus] = await rpc('record_communication_needs', { p_patient_id: ids.patientA, p_communication_needs: 'legitimate professional note', p_source: 'professional_observation' }, tok.medicalA);
    expect(proStatus).toBe(200);

    const [patchStatus] = await http('PATCH', `/rest/v1/patients?id=eq.${ids.patientA}`, { communication_needs: 'forged replacement text' }, tok.patientA);
    const state = sql(`SELECT communication_needs||'|'||communication_needs_source FROM public.patients WHERE id='${ids.patientA}';`);
    // Before migration 079: the trigger only re-validated when the
    // SOURCE column itself changed — a content-only PATCH slipped
    // through and the forged text displayed with a stale, false
    // 'professional_observation' attribution (DEFECT SEC03-UNCHANGED-SOURCE-CONTENT).
    expect(patchStatus).toBeGreaterThanOrEqual(400);
    expect(state).toBe('legitimate professional note|professional_observation');
  });
});

describe('MASTER CORRECTIVE 2 — FUNC-04 follow-up: revoked membership loses future conversation search/list access', () => {
  it('a caregiver whose assignment was revoked no longer sees or can search a patient\'s conversation', async () => {
    const [convStatus, conv] = (await rpc(
      'create_conversation',
      { p_patient_id: ids.patientA, p_recipient_user_ids: [ids.medicalA], p_subject: 'MC2 FUNC-04 revoked test' },
      tok.caregiverA,
    )) as [number, { id: string }];
    expect(convStatus).toBe(200);
    await rpc('send_message', { p_conversation_id: conv.id, p_body: 'revocation-needle message', p_is_urgent: false, p_reply_to_message_id: null, p_message_type: 'message' }, tok.caregiverA);

    sql(`UPDATE public.staff_patient_assignments SET is_active=false WHERE user_id='${ids.caregiverA}' AND patient_id='${ids.patientA}';`);

    const [searchStatus, searchResults] = (await rpc('search_my_conversations', { p_search_term: 'revocation-needle' }, tok.caregiverA)) as [number, Array<{ conversation_id: string }>];
    const [listStatus, listResults] = (await rpc('get_my_conversations', { p_patient_id: ids.patientA }, tok.caregiverA)) as [number, unknown[]];
    // Before migration 079: both still returned the conversation after
    // revocation — conversation_participants rows are never cleaned up
    // on revocation, and neither RPC re-checked current authorization
    // (DEFECT FUNC04-REVOKED-SEARCH / FUNC04-REVOKED-LIST).
    expect(searchStatus).toBe(200);
    expect(searchResults.find((r) => r.conversation_id === conv.id)).toBeUndefined();
    expect(listStatus).toBe(200);
    expect(listResults).toEqual([]);

    sql(`UPDATE public.staff_patient_assignments SET is_active=true WHERE user_id='${ids.caregiverA}' AND patient_id='${ids.patientA}';`);
    const [resumedStatus, resumedResults] = (await rpc('search_my_conversations', { p_search_term: 'revocation-needle' }, tok.caregiverA)) as [number, Array<{ conversation_id: string }>];
    expect(resumedStatus).toBe(200);
    expect(resumedResults.find((r) => r.conversation_id === conv.id)).toBeDefined();
  });
});

describe('SEC-06 — organization billing terms are director-only; operational coverage status stays available to any member', () => {
  it('denies an ordinary caregiver direct read, allows a director, and keeps the narrow RPC working for the caregiver', async () => {
    const [caregiverReadStatus, caregiverReadBody] = await http('GET', `/rest/v1/organization_licenses?organization_id=eq.${ORG}`, undefined, tok.caregiverA);
    // Before migration 076: this returned 200 with the full license row including annual_license_fee (DEFECT-CAREGIVER-BILLING-READ).
    expect(caregiverReadStatus).toBe(200);
    expect(caregiverReadBody).toEqual([]);

    const [directorReadStatus, directorReadBody] = (await http('GET', `/rest/v1/organization_licenses?organization_id=eq.${ORG}`, undefined, tok.directorA)) as [number, Array<{ annual_license_fee: number }>];
    expect(directorReadStatus).toBe(200);
    expect(directorReadBody).toHaveLength(1);
    expect(Number(directorReadBody[0].annual_license_fee)).toBe(9999);

    const [coverageStatus, coverageBody] = (await rpc('get_organization_coverage_status', { p_org_id: ORG }, tok.caregiverA)) as [number, Array<{ status: string }>];
    expect(coverageStatus).toBe(200);
    expect(coverageBody[0]?.status).toBe('active');
  });
});

describe('OWNER CORRECTION — Enterprise caregivers are operational users, not organization founders by default', () => {
  it('an existing Enterprise caregiver cannot self-create a second organization via create_organization()', async () => {
    const [status, body] = (await rpc('create_organization', { p_name: 'Rogue Org', p_package_type: 'integrated_care' }, tok.caregiverA)) as [number, { message?: string }];
    // Before migration 080: create_organization() had no restriction
    // beyond basic authentication — any authenticated caller, including
    // one already actively staffing an existing organization, could
    // found an unrelated second one.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('already an active member');
  });

  // MASTER ENTERPRISE IDENTITY DIRECTIVE §7 — superseded this round:
  // create_organization() no longer activates an organization at all
  // (migration 083 closed that self-approval bootstrap — "the applicant
  // must not become Director merely because they initiated an
  // organization registration"). A brand-new user calling it now gets a
  // PENDING Director application, never an active organization or
  // membership — asserted explicitly below, not just a 200 status,
  // since a passing status alone would have silently hidden exactly
  // this behavior change (confirmed live: the previous version of this
  // test only checked status===200 and tried to clean up body.id as an
  // organizations row, which no longer exists — it would have passed
  // while asserting nothing true about the new behavior).
  it('a brand-new account submitting create_organization() gets a PENDING application, never an active organization (self-approval bootstrap closed)', async () => {
    const email = `r7mc-brandnew-${stamp}@local.test`;
    const id = await authSignUp(email, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
    const token = await login(email, PW);
    const [status, body] = (await rpc('create_organization', { p_name: 'Brand New Pending Org', p_package_type: 'integrated_care' }, token)) as [number, { id?: string; status?: string; requested_office?: string; platform_owner_approval_required?: boolean }];
    expect(status).toBe(200);
    expect(body.status).toBe('pending_review');
    expect(body.requested_office).toBe('director');
    expect(body.platform_owner_approval_required).toBe(true);

    const orgCount = sql(`SELECT count(*) FROM public.organizations WHERE name='Brand New Pending Org';`);
    expect(orgCount).toBe('0');
    const membershipCount = sql(`SELECT count(*) FROM public.organization_memberships WHERE user_id='${id}';`);
    expect(membershipCount).toBe('0');

    if (body.id) sql(`DELETE FROM public.professional_application_events WHERE application_id='${body.id}'; DELETE FROM public.professional_applications WHERE id='${body.id}';`);
    await authDeleteUser(id);
  });

  it('Platform Owner approval of that same application creates the organization and activates the Director — the ONLY path to activation', async () => {
    const email = `r7mc-brandnew2-${stamp}@local.test`;
    const id = await authSignUp(email, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
    const token = await login(email, PW);
    const [, app] = (await rpc('create_organization', { p_name: 'Brand New Approved Org', p_package_type: 'integrated_care' }, token)) as [number, { id: string }];

    // SEC-15-1: the applicant themselves is never the Platform Owner —
    // confirmed rejected before the real owner acts.
    const [selfApproveStatus] = await rpc('platform_owner_approve_director_application', { p_application_id: app.id }, token);
    expect(selfApproveStatus).toBeGreaterThanOrEqual(400);

    const ownerEmail = `r7mc-owner-${stamp}@local.test`;
    const ownerId = await authSignUp(ownerEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete', role='admin' WHERE id='${ownerId}';`);
    const ownerToken = await login(ownerEmail, PW);

    const [ownerStatus, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: app.id }, ownerToken)) as [number, { id?: string; name?: string }];
    expect(ownerStatus).toBe(200);
    expect(org.name).toBe('Brand New Approved Org');

    const membership = sql(`SELECT org_role, status FROM public.organization_memberships WHERE user_id='${id}' AND organization_id='${org.id}';`);
    expect(membership).toBe('director|active');

    if (org.id) sql(`DELETE FROM public.organization_memberships WHERE organization_id='${org.id}'; DELETE FROM public.organization_licenses WHERE organization_id='${org.id}'; DELETE FROM public.professional_application_events WHERE application_id='${app.id}'; DELETE FROM public.professional_applications WHERE id='${app.id}'; DELETE FROM public.organizations WHERE id='${org.id}';`);
    await authDeleteUser(id);
    await authDeleteUser(ownerId);
  });
});

// MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave A, account-governance
// lifecycle case 8 ("suspension/revocation of an active professional").
// remove_org_member() (migration 035) already revoked an active staff
// member's membership and deactivated their patient assignments, but
// predated migration 083's account_management_audit table and so left
// no audit row behind — every OTHER account-governance action this
// engagement built was audited; this one was not. Migration 084 closes
// that gap without changing remove_org_member's signature or
// authorization check.
describe('CLOSURE REGISTER — remove_org_member() now writes an auditable account_management_audit row (migration 084)', () => {
  it('a director revoking an active staff member is recorded in account_management_audit with before/after state and the director as actor', async () => {
    const staffEmail = `r7mc-removable-${stamp}@local.test`;
    const staffId = await authSignUp(staffEmail, PW);
    sql(`
      UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${staffId}';
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${staffId}','caregiver','active');
    `);

    const [status, body] = (await rpc('remove_org_member', { p_org_id: ORG, p_user_id: staffId }, tok.directorA)) as [number, boolean];
    expect(status).toBe(200);
    expect(body).toBe(true);

    const membership = sql(`SELECT status FROM public.organization_memberships WHERE organization_id='${ORG}' AND user_id='${staffId}';`);
    expect(membership).toBe('revoked');

    const audit = sql(`SELECT action_type, actor_user_id, previous_value->>'status', new_value->>'status' FROM public.account_management_audit WHERE target_user_id='${staffId}' AND organization_id='${ORG}' ORDER BY created_at DESC LIMIT 1;`);
    expect(audit).toBe(`staff_member_removed|${ids.directorA}|active|revoked`);

    // Negative: a non-director (an ordinary caregiver) cannot revoke staff,
    // and no audit row is written for a rejected attempt.
    const secondStaffEmail = `r7mc-removable2-${stamp}@local.test`;
    const secondStaffId = await authSignUp(secondStaffEmail, PW);
    sql(`
      UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${secondStaffId}';
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${secondStaffId}','caregiver','active');
    `);
    const [rejectedStatus] = await rpc('remove_org_member', { p_org_id: ORG, p_user_id: secondStaffId }, tok.caregiverA);
    expect(rejectedStatus).toBeGreaterThanOrEqual(400);
    const stillActive = sql(`SELECT status FROM public.organization_memberships WHERE organization_id='${ORG}' AND user_id='${secondStaffId}';`);
    expect(stillActive).toBe('active');
    const noAudit = sql(`SELECT count(*) FROM public.account_management_audit WHERE target_user_id='${secondStaffId}';`);
    expect(noAudit).toBe('0');

    sql(`
      DELETE FROM public.account_management_audit WHERE target_user_id IN ('${staffId}','${secondStaffId}');
      DELETE FROM public.organization_memberships WHERE user_id IN ('${staffId}','${secondStaffId}');
    `);
    await authDeleteUser(staffId);
    await authDeleteUser(secondStaffId);
  });
});

// MASTER ENTERPRISE COMPLETION DIRECTIVE, Wave B — full RPC authorization
// audit. DEFECT-ANON-EXECUTE-GRANT (CONFIRMED, fixed by migration 085):
// every SECURITY DEFINER function in this schema granted EXECUTE to the
// `anon` role directly (a separate grant from `PUBLIC`, which the
// REVOKE-FROM-PUBLIC pattern every migration already used never
// touched), so a genuinely unauthenticated request (apikey=anon,
// Authorization=anon, no real user session) could reach every RPC's
// own body at all. No exploitable data exposure resulted (every
// function's own authorization logic depends on auth.uid(), which is
// NULL for such a caller and fails every equality/lookup check closed),
// but the intended "cannot even call this" boundary never existed.
// Migration 085 revokes anon's EXECUTE grant project-wide and sets
// ALTER DEFAULT PRIVILEGES so the gap cannot silently recur on a future
// migration that repeats the same (shown-insufficient) pattern.
describe('CLOSURE REGISTER — anon (unauthenticated) callers are rejected at the database privilege layer, not merely by in-function logic (migration 085)', () => {
  it('a request bearing only the anon key, with no user session, is denied permission before reaching the function body', async () => {
    const [orgsStatus, orgsBody] = (await rpc('get_my_organizations', {}, ANON)) as [number, { code?: string }];
    expect(orgsStatus).toBe(401);
    expect(orgsBody.code).toBe('42501');

    const [adminStatus, adminBody] = (await rpc('admin_set_role', { p_user_id: ids.caregiverA, p_role: 'admin' }, ANON)) as [number, { code?: string }];
    expect(adminStatus).toBe(401);
    expect(adminBody.code).toBe('42501');

    const [removeStatus] = (await rpc('remove_org_member', { p_org_id: ORG, p_user_id: ids.caregiverA }, ANON)) as [number, { code?: string }];
    expect(removeStatus).toBe(401);

    // Regression guard: a real, logged-in caller is completely unaffected
    // by the anon revoke (different database role, untouched grant).
    const [realStatus, realBody] = (await rpc('get_my_organizations', {}, tok.directorA)) as [number, unknown[]];
    expect(realStatus).toBe(200);
    expect(Array.isArray(realBody)).toBe(true);
  });
});
