// HCN-CLINICAL-MASTER-002 / Workstream C.
// True HTTP/RLS/RPC integration on a disposable local Supabase stack,
// NEVER production. Proves the Medical -> Therapy -> Director ->
// Caregiver clinical coordination dependency/approval/ack chain.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, http, sql } from './_runtime';

const stamp = Date.now();
const password = 'HcnCareChain9!';
const authUsers: string[] = [];
const orgs: string[] = [];
const patients: string[] = [];
type Actor = { id: string; token: string };
type Fixture = {
  orgId: string; patientId: string; director: Actor;
  med: Actor; therapy: Actor; caregiver: Actor; unrelated: Actor;
  planId: string; sourceDocId: string;
};
let fixture: Fixture | null = null;

async function actor(label: string): Promise<Actor> {
  const email = 'hcn-tasks-' + stamp + '-' + label + '@local.test';
  const id = await authSignUp(email, password);
  authUsers.push(id);
  sql("UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='" + id + "';");
  return { id, token: await login(email, password) };
}

async function setup(): Promise<Fixture> {
  if (fixture) return fixture;
  const director = await actor('director');
  const med = await actor('medical');
  const therapy = await actor('therapy');
  const caregiver = await actor('caregiver');
  const unrelated = await actor('unrelated');
  const orgId = sql("INSERT INTO organizations(name,package_type,created_by) VALUES('HCN Task Fixture " +
    stamp + "','integrated_care','" + director.id + "') RETURNING id;");
  orgs.push(orgId);
  const patientId = sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('Fictional','Recovery','Fictional Recovery','1 Example Road','Test Facility') RETURNING id;");
  patients.push(patientId);
  sql("INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('" +
    orgId + "',10,10,399,'active');");
  for (const [a, role] of [[director, 'director'], [med, 'medical_professional'], [therapy, 'therapist'], [caregiver, 'caregiver']] as [Actor, string][]) {
    sql("INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('" +
      orgId + "','" + a.id + "','" + role + "','active');");
    if (role !== 'director') sql("INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('" +
      orgId + "','" + a.id + "','" + patientId + "','" + role + "',true,'" + director.id + "');");
  }
  sql("INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('" +
    orgId + "','" + patientId + "','active','" + director.id + "');");
  const [status, plan] = await rpc('hcn_create_coordination_plan', {
    p_organization_id: orgId, p_patient_id: patientId,
    p_title: 'Fictional post-surgery care team', p_description: 'Synthetic E2E test',
  }, director.token);
  expect(status).toBe(200);
  const planId = (plan as { id: string }).id;
  for (const [a, label] of [[med, 'Medical'], [therapy, 'Therapy'], [caregiver, 'Caregiver']] as [Actor,string][]) {
    const [s] = await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: planId, p_participant_type: 'internal_user',
      p_participant_user_id: a.id, p_external_provider_id: null, p_role_label: label,
    }, director.token);
    expect(s).toBe(200);
  }
  const sourceDocId = sql("INSERT INTO hcn_clinical_documents(organization_id,patient_id,category,classification,storage_path,original_filename,mime_type,file_size_bytes,uploaded_by,review_status,reviewed_by) VALUES('" +
    orgId + "','" + patientId +
    "','care_instructions','caregiver_approved_instructions','" + patientId + "/approved-instruction-" + stamp +
    ".pdf','approved-instruction.pdf','application/pdf',128,'" + med.id + "','clinical_approved','" + med.id + "') RETURNING id;");
  fixture = { orgId, patientId, director, med, therapy, caregiver, unrelated, planId, sourceDocId };
  return fixture;
}

afterAll(async () => {
  if (orgs.length) {
    const ids = orgs.map((id) => "'" + id + "'").join(',');
    const patientIds = patients.map((id) => "'" + id + "'").join(',');
    sql("DELETE FROM hcn_coordination_instruction_acks WHERE task_id IN (SELECT id FROM hcn_coordination_tasks WHERE organization_id IN (" + ids + "));");
    sql("DELETE FROM hcn_coordination_task_events WHERE task_id IN (SELECT id FROM hcn_coordination_tasks WHERE organization_id IN (" + ids + "));");
    sql("DELETE FROM hcn_coordination_task_dependencies WHERE task_id IN (SELECT id FROM hcn_coordination_tasks WHERE organization_id IN (" + ids + "));");
    sql("DELETE FROM hcn_coordination_tasks WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM hcn_coordination_plan_updates WHERE plan_id IN (SELECT id FROM hcn_coordination_plans WHERE organization_id IN (" + ids + "));");
    sql("DELETE FROM hcn_coordination_plan_participants WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM hcn_coordination_plans WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM hcn_clinical_documents WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM staff_patient_assignments WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM covered_patient_memberships WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM organization_memberships WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM organization_licenses WHERE organization_id IN (" + ids + ");");
    sql("DELETE FROM organizations WHERE id IN (" + ids + ");");
    sql("DELETE FROM patients WHERE id IN (" + patientIds + ");");
  }
  for (const id of authUsers) await authDeleteUser(id);
});

describe('HCN Clinical Coordination task dependency and clinical instruction chain', () => {
  let medicalTaskId = '';
  let therapyTaskId = '';
  let careTaskId = '';

  it('lists real eligible assigned staff and rejects task creation by a non-Director', async () => {
    const f = await setup();
    const [listStatus, list] = await rpc('hcn_list_eligible_plan_staff', { p_plan_id: f.planId }, f.director.token);
    expect(listStatus).toBe(200);
    expect((list as { user_id: string }[]).map((x) => x.user_id).sort())
      .toEqual([f.med.id, f.therapy.id, f.caregiver.id].sort());
    const [unauthenticatedStatus] = await rpc('hcn_list_eligible_plan_staff', { p_plan_id: f.planId }, f.med.token);
    expect(unauthenticatedStatus).toBeGreaterThanOrEqual(400);
    const [createStatus] = await rpc('hcn_create_coordination_task', {
      p_plan_id: f.planId, p_title: 'Fake', p_details: '',
      p_kind: 'medical_review', p_assignee_id: f.med.id,
      p_due_at: null, p_source_document_id: null, p_dependency_ids: [],
    }, f.caregiver.token);
    expect(createStatus).toBeGreaterThanOrEqual(400);
  });

  it('prevents assigning a medical task to a Caregiver and rejects an unrelated user', async () => {
    const f = await setup();
    for (const id of [f.caregiver.id, f.unrelated.id]) {
      const [status] = await rpc('hcn_create_coordination_task', {
        p_plan_id: f.planId, p_title: 'Unlawful assignment', p_details: '',
        p_kind: 'medical_review', p_assignee_id: id,
        p_due_at: null, p_source_document_id: null, p_dependency_ids: [],
      }, f.director.token);
      expect(status).toBeGreaterThanOrEqual(400);
    }
  });

  it('creates Medical, dependent Therapy, and dependent Caregiver instruction tasks', async () => {
    const f = await setup();
    const create = async (title: string, kind: string, assigneeId: string, prerequisiteIds: string[], docId: string | null) => {
      const [status, body] = await rpc('hcn_create_coordination_task', {
        p_plan_id: f.planId, p_title: title, p_details: 'Synthetic no-PHI work',
        p_kind: kind, p_assignee_id: assigneeId,
        p_due_at: null, p_source_document_id: docId, p_dependency_ids: prerequisiteIds,
      }, f.director.token);
      expect(status, JSON.stringify(body)).toBe(200);
      return (body as { id: string }).id;
    };
    medicalTaskId = await create('Medical assessment', 'medical_review', f.med.id, [], null);
    therapyTaskId = await create('Therapy assessment', 'therapy_review', f.therapy.id, [medicalTaskId], null);
    careTaskId = await create('Caregiver instructions', 'care_instruction', f.caregiver.id, [therapyTaskId], f.sourceDocId);
    // Caregivers must not receive preliminary care instructions before
    // the Director approves the prerequisites and releases the source.
    const [beforeStatus, beforeRows] = await http('GET',
      '/rest/v1/hcn_coordination_tasks?id=eq.' + careTaskId + '&select=id,details',
      undefined, f.caregiver.token);
    expect(beforeStatus).toBe(200);
    expect(beforeRows).toEqual([]);
    const [directorStatus, directorRows] = await http('GET',
      '/rest/v1/hcn_coordination_tasks?id=eq.' + careTaskId + '&select=id',
      undefined, f.director.token);
    expect(directorStatus).toBe(200);
    expect(directorRows).toHaveLength(1);
    const [invalidStatus] = await rpc('hcn_create_coordination_task', {
      p_plan_id: f.planId, p_title: 'Cross-assignee', p_details: '', p_kind: 'general',
      p_assignee_id: f.med.id, p_due_at: null, p_source_document_id: null,
      p_dependency_ids: [medicalTaskId, medicalTaskId],
    }, f.director.token);
    expect(invalidStatus).toBeGreaterThanOrEqual(400);
  });

  it('enforces dependencies, distinct clinical/directional permissions and Director review', async () => {
    const f = await setup();
    const [blocked] = await rpc('hcn_set_coordination_task_status', {
      p_task_id: therapyTaskId, p_action: 'start', p_result_note: null,
    }, f.therapy.token);
    expect(blocked).toBeGreaterThanOrEqual(400);

    const [noDirectorRelease] = await rpc('hcn_review_coordination_task', {
      p_task_id: careTaskId, p_decision: 'release', p_note: null,
    }, f.med.token);
    expect(noDirectorRelease).toBeGreaterThanOrEqual(400);

    for (const [taskId, actorToken] of [[medicalTaskId, f.med.token], [therapyTaskId, f.therapy.token]]) {
      const [startStatus, started] = await rpc('hcn_set_coordination_task_status', {
        p_task_id: taskId, p_action: 'start', p_result_note: null,
      }, actorToken);
      expect(startStatus, JSON.stringify(started)).toBe(200);
      const [submitStatus, submitted] = await rpc('hcn_set_coordination_task_status', {
        p_task_id: taskId, p_action: 'submit', p_result_note: 'Synthetic work complete, see authorized notes.',
      }, actorToken);
      expect(submitStatus, JSON.stringify(submitted)).toBe(200);
      const [reviewStatus, accepted] = await rpc('hcn_review_coordination_task', {
        p_task_id: taskId, p_decision: 'accept', p_note: 'Coordination completion acknowledged; not clinical approval',
      }, f.director.token);
      expect(reviewStatus, JSON.stringify(accepted)).toBe(200);
      expect((accepted as { status: string }).status).toBe('approved');
    }

    const [releaseStatus, released] = await rpc('hcn_review_coordination_task', {
      p_task_id: careTaskId, p_decision: 'release', p_note: null,
    }, f.director.token);
    expect(releaseStatus, JSON.stringify(released)).toBe(200);
    expect((released as { status: string }).status).toBe('approved');

    const [releasedReadStatus, releasedRows] = await http('GET',
      '/rest/v1/hcn_coordination_tasks?id=eq.' + careTaskId + '&select=id,details',
      undefined, f.caregiver.token);
    expect(releasedReadStatus).toBe(200);
    expect(releasedRows).toHaveLength(1);


    const [outsiderAck] = await rpc('hcn_ack_coordination_instruction',
      { p_task_id: careTaskId }, f.med.token);
    expect(outsiderAck).toBeGreaterThanOrEqual(400);
    const [ackStatus, time] = await rpc('hcn_ack_coordination_instruction',
      { p_task_id: careTaskId }, f.caregiver.token);
    expect(ackStatus).toBe(200);
    const [retryStatus, retryTime] = await rpc('hcn_ack_coordination_instruction',
      { p_task_id: careTaskId }, f.caregiver.token);
    expect(retryStatus).toBe(200);
    expect(time).toEqual(retryTime);
    const [metricsStatus, rows] = await rpc('hcn_get_coordination_task_metrics',
      { p_organization_id: f.orgId }, f.director.token);
    expect(metricsStatus).toBe(200);
    const row = (rows as { unacknowledged_instructions: number }[])[0];
    expect(row.unacknowledged_instructions).toBe(0);
  });

  it('direct table writes are forbidden; unrelated users cannot read scoped plan tasks', async () => {
    const f = await setup();
    const [status, visible] = await http('GET',
      '/rest/v1/hcn_coordination_tasks?plan_id=eq.' + f.planId + '&select=id',
      undefined, f.unrelated.token);
    expect(status).toBe(200);
    expect(visible).toEqual([]);
    const [patchStatus] = await http('PATCH',
      '/rest/v1/hcn_coordination_tasks?id=eq.' + medicalTaskId,
      { status: 'approved', reviewed_by: f.unrelated.id }, f.unrelated.token);
    expect(patchStatus).toBeGreaterThanOrEqual(400);
  });

  it('revoke Caregiver patient assignment: instruction and acknowledgement access immediately fail', async () => {
    const f = await setup();
    sql("UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='" + f.orgId +
      "' AND patient_id='" + f.patientId + "' AND user_id='" + f.caregiver.id + "';");
    const [planReadStatus, planRows] = await http('GET',
      '/rest/v1/hcn_coordination_plans?id=eq.' + f.planId + '&select=id',
      undefined, f.caregiver.token);
    expect(planReadStatus).toBe(200);
    expect(planRows).toEqual([]);
    const [participantReadStatus, participantRows] = await http('GET',
      '/rest/v1/hcn_coordination_plan_participants?plan_id=eq.' + f.planId + '&select=id',
      undefined, f.caregiver.token);
    expect(participantReadStatus).toBe(200);
    expect(participantRows).toEqual([]);
    const [postRevokedStatus] = await rpc('hcn_post_coordination_plan_update', {
      p_plan_id: f.planId, p_update_text: 'Former assignee must not post',
    }, f.caregiver.token);
    expect(postRevokedStatus).toBeGreaterThanOrEqual(400);
    const [status, rows] = await http('GET', '/rest/v1/hcn_coordination_tasks?id=eq.' +
      careTaskId + '&select=id', undefined, f.caregiver.token);
    expect(status).toBe(200);
    expect(rows).toEqual([]);
    const [ackStatus] = await rpc('hcn_ack_coordination_instruction',
      { p_task_id: careTaskId }, f.caregiver.token);
    expect(ackStatus).toBeGreaterThanOrEqual(400);
  });
});
