import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

type Actor = { id: string; token: string };
type Message = { id: string; sender_id: string; body: string };

const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

async function invoke<T>(actor: Actor, name: string, args: object = {}): Promise<T> {
  const [status, payload] = await rpc(name, args, actor.token);
  expect(status, name + ': ' + JSON.stringify(payload)).toBe(200);
  return payload as T;
}

async function exchange(
  conversation: string, sender: Actor, recipients: Actor[], content: string, replyTo?: string,
) {
  const message = await invoke<{ id: string }>(sender, 'send_message', {
    p_conversation_id: conversation, p_body: content, p_is_urgent: false,
    p_reply_to_message_id: replyTo ?? null,
  });
  for (const recipient of recipients) {
    const [status, rows] = await http('GET',
      '/rest/v1/messages?id=eq.' + message.id + '&select=id,sender_id,body', undefined, recipient.token);
    expect(status).toBe(200);
    expect(rows as Message[]).toEqual([{ id: message.id, sender_id: sender.id, body: content }]);
  }
  return message.id;
}

it('rehearses a fictional agency in role order, with specialist handoffs after the core passes', async () => {
  const run = randomUUID();
  const org = randomUUID();
  const password = randomBytes(24).toString('hex') + 'Aa1!';
  const users: string[] = [];
  let patient: Actor | undefined;

  async function signInAs(role: string): Promise<Actor> {
    const email = 'agency-' + role + '-' + run + '@local.test';
    const id = await authSignUp(email, password);
    users.push(id);
    sql('UPDATE profiles SET must_change_password=false, provisioning_status=\'complete\' WHERE id=' + quote(id));
    return { id, token: await login(email, password) };
  }

  try {
    const owner = await signInAs('owner');
    const director = await signInAs('director');
    const caregiver = await signInAs('caregiver');
    const unassigned = await signInAs('unassigned');
    patient = await signInAs('patient');

    // Disposable fixture only. These rows model successful onboarding and email
    // activation. The test below exercises the app's authenticated care workflow.
    sql(`
      INSERT INTO organizations(id,name,package_type,created_by,owner_user_id)
        VALUES('${org}','Fictional Agency ${run}','integrated_care','${owner.id}','${owner.id}');
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,
        annual_license_fee,status,license_number,license_tier_code,specialist_slot_count)
        VALUES('${org}',10,10,399,'active','ROLEPLAY-${run}','essential',0);
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
        ('${org}','${director.id}','director','active'),
        ('${org}','${caregiver.id}','caregiver','active'),
        ('${org}','${unassigned.id}','caregiver','active');
      INSERT INTO patients(id,first_name,last_name,preferred_name,address,location)
        VALUES('${patient.id}','Synthetic','Roleplay','Synthetic Roleplay','1 Test Avenue','Home');
      INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by)
        VALUES('${org}','${patient.id}','active','${director.id}');
    `);

    expect(await invoke(owner, 'hcn_list_my_owned_organizations')).toEqual(
      expect.arrayContaining([expect.objectContaining({ organization_id: org })]),
    );
    expect(await invoke(director, 'get_my_organizations')).toEqual(
      expect.arrayContaining([expect.objectContaining({ organization_id: org, org_role: 'director' })]),
    );
    await invoke(owner, 'hcn_assign_caregiver_to_patient', {
      p_org_id: org, p_caregiver_id: caregiver.id, p_patient_id: patient.id,
    });
    expect(await invoke(caregiver, 'get_my_staff_patients')).toEqual(
      expect.arrayContaining([expect.objectContaining({ patient_id: patient.id })]),
    );
    expect(await invoke(unassigned, 'get_my_staff_patients')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ patient_id: patient.id })]),
    );

    const [moodStatus, wellness] = await http('POST', '/rest/v1/mood_entries', {
      patient_id: patient.id, organization_id: org, entry_source: 'patient_reported', mood: 'calm', intensity: 4,
      note: 'Fictional patient: I felt calm after breakfast. ' + run, recorded_by: 'pending_server_attribution',
    }, patient.token);
    expect(moodStatus, JSON.stringify(wellness)).toBe(201);
    const [entry] = wellness as { id: string; note: string; author_user_id: string }[];
    expect(entry.author_user_id).toBe(patient.id);
    const moodPath = '/rest/v1/mood_entries?id=eq.' + entry.id + '&select=id,note';
    expect(await http('GET', moodPath, undefined, caregiver.token)).toEqual([200, [{ id: entry.id, note: entry.note }]]);
    expect(await http('GET', moodPath, undefined, unassigned.token)).toEqual([200, []]);

    const core = await invoke<{ id: string }>(patient, 'create_conversation', {
      p_patient_id: patient.id, p_recipient_user_ids: [caregiver.id, director.id], p_subject: 'Fictional daily handoff ' + run,
    });
    const update = await exchange(core.id, patient, [caregiver, director], entry.note);
    const note = await exchange(core.id, caregiver, [patient, director],
      'Fictional caregiver: I saw your update and will check in at the next visit. ' + run, update);
    await exchange(core.id, director, [caregiver, patient],
      'Fictional director: I received the handoff and confirmed the scheduled follow-up. ' + run, note);
    expect(await http('GET', '/rest/v1/messages?conversation_id=eq.' + core.id + '&select=id',
      undefined, unassigned.token)).toEqual([200, []]);

    const now = Date.now();
    const visit = await invoke<{ id: string }>(director, 'hcn_director_schedule_assigned_visit', {
      p_org_id: org, p_patient_id: patient.id, p_caregiver_id: caregiver.id,
      p_scheduled_start: new Date(now).toISOString(), p_scheduled_end: new Date(now + 3_600_000).toISOString(),
    });
    const [beforeReview] = await rpc('start_caregiver_visit', { p_visit_id: visit.id }, caregiver.token);
    expect(beforeReview).toBeGreaterThanOrEqual(400);
    await invoke(caregiver, 'hcn_acknowledge_previsit', {
      p_visit_id: visit.id, p_sections: ['patient_updates', 'care_plan', 'medications', 'healthcare_contacts', 'handoffs'],
      p_attestation: 'I reviewed the available records and understand that this acknowledgment does not authorize clinical decisions.',
    });
    expect(await invoke(caregiver, 'start_caregiver_visit', { p_visit_id: visit.id })).toMatchObject({ status: 'in_progress' });
    const visitNote = 'Fictional caregiver: visit completed and the patient update was reviewed. ' + run;
    await invoke(caregiver, 'end_caregiver_visit', { p_visit_id: visit.id, p_visit_notes: visitNote });
    const [visitStatus, visits] = await http('GET', '/rest/v1/caregiver_visits?id=eq.' + visit.id +
      '&select=status,actual_start,actual_end,visit_notes', undefined, director.token);
    expect(visitStatus).toBe(200);
    expect(visits).toEqual([{
      status: 'completed', actual_start: expect.any(String), actual_end: expect.any(String), visit_notes: visitNote,
    }]);

    // The core assertions above must pass before specialists are added. A
    // disposable license/membership fixture models a completed tier change.
    const medical = await signInAs('medical');
    const therapist = await signInAs('therapist');
    sql(`
      UPDATE organization_licenses SET license_tier_code='complete', specialist_slot_count=3
        WHERE organization_id='${org}';
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
        ('${org}','${medical.id}','medical_professional','active'),
        ('${org}','${therapist.id}','therapist','active');
    `);
    await invoke(director, 'assign_staff_to_patient', {
      p_org_id: org, p_user_id: medical.id, p_patient_id: patient.id, p_org_role: 'medical_professional',
    });
    await invoke(director, 'assign_staff_to_patient', {
      p_org_id: org, p_user_id: therapist.id, p_patient_id: patient.id, p_org_role: 'therapist',
    });
    const clinical = await invoke<{ id: string }>(director, 'create_conversation', {
      p_patient_id: patient.id, p_recipient_user_ids: [medical.id, therapist.id, caregiver.id],
      p_subject: 'Fictional medical and therapy handoff ' + run,
    });
    const request = await exchange(clinical.id, director, [medical, therapist, caregiver],
      'Fictional director: please review the visit handoff and confirm receipt. ' + run);
    const observation = await exchange(clinical.id, caregiver, [director, medical, therapist],
      'Fictional caregiver: the patient asked to discuss their morning routine. ' + run, request);
    const medicalReply = await exchange(clinical.id, medical, [director, caregiver, therapist],
      'Fictional medical specialist: received the observation for review. ' + run, observation);
    await exchange(clinical.id, therapist, [director, caregiver, medical],
      'Fictional therapist: received and will coordinate a follow-up with the care team. ' + run, medicalReply);
    expect(await http('GET', '/rest/v1/messages?conversation_id=eq.' + clinical.id + '&select=id',
      undefined, patient.token)).toEqual([200, []]);
  } finally {
    sql('DELETE FROM hcn_previsit_acknowledgments WHERE visit_id IN ' +
      '(SELECT id FROM caregiver_visits WHERE organization_id=' + quote(org) + ')');
    if (patient) sql('DELETE FROM patients WHERE id=' + quote(patient.id));
    sql('DELETE FROM organizations WHERE id=' + quote(org));
    for (const id of users) await authDeleteUser(id);
  }
}, 90_000);
