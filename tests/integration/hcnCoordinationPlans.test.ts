// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 3 -- Feature 5, Advanced
// Multi-Provider Coordination. The directive requires a concrete
// fictional post-surgery scenario proving Medical + Therapy +
// Director + Caregiver are all linked to ONE coordination plan. Every
// call here is a real RPC/table read against a real local Postgres
// stack -- no mocks.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'CoordPlan9!';
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdPatientIds: string[] = [];

afterAll(async () => {
  if (createdOrgIds.length) {
    const orgIds = createdOrgIds.map((id) => `'${id}'`).join(',');
    const patientIds = createdPatientIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM hcn_coordination_plan_updates WHERE plan_id IN (SELECT id FROM hcn_coordination_plans WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_coordination_plan_participants WHERE plan_id IN (SELECT id FROM hcn_coordination_plans WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_coordination_plans WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_patient_provider_associations WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_healthcare_providers WHERE organization_id IN (${orgIds});
      DELETE FROM staff_patient_assignments WHERE organization_id IN (${orgIds});
      DELETE FROM covered_patient_memberships WHERE organization_id IN (${orgIds});
      DELETE FROM organization_memberships WHERE organization_id IN (${orgIds});
      DELETE FROM organization_licenses WHERE organization_id IN (${orgIds});
      DELETE FROM organizations WHERE id IN (${orgIds});
      DELETE FROM patients WHERE id IN (${patientIds});
    `);
  }
  for (const id of createdUserIds) await authDeleteUser(id);
});

describe('HCN-CLINICAL-MASTER-002-CONTINUATION Feature 5 -- post-surgery multi-provider coordination plan', () => {
  it('links Director, Caregiver, Medical, and Therapy to one shared plan, with a real external provider referenced too', async () => {
    // Fictional scenario: Mrs. Eleanor Reyes (synthetic patient),
    // recovering from hip-replacement surgery. Her Director assembles
    // a coordination plan naming her assigned Caregiver, her assigned
    // Medical Professional (post-op monitoring), her assigned
    // Physical Therapist (mobility rehab), and references her
    // external orthopedic surgeon's own provider-directory entry
    // (never given a Haneen account or a seat).
    const directorEmail = `coordplan-director-${stamp}@local.test`;
    const caregiverEmail = `coordplan-caregiver-${stamp}@local.test`;
    const medicalEmail = `coordplan-medical-${stamp}@local.test`;
    const therapyEmail = `coordplan-therapy-${stamp}@local.test`;
    const outsiderEmail = `coordplan-outsider-${stamp}@local.test`;

    const directorId = await authSignUp(directorEmail, PW);
    const caregiverId = await authSignUp(caregiverEmail, PW);
    const medicalId = await authSignUp(medicalEmail, PW);
    const therapyId = await authSignUp(therapyEmail, PW);
    const outsiderId = await authSignUp(outsiderEmail, PW);
    createdUserIds.push(directorId, caregiverId, medicalId, therapyId, outsiderId);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${caregiverId}','${medicalId}','${therapyId}','${outsiderId}');`);

    const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('Reyes Post-Surgery Org ${stamp}','integrated_care','${directorId}') RETURNING id;`);
    createdOrgIds.push(orgId);
    const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('Eleanor','Reyes','Mrs. Reyes','12 Birch Ln','Haneen Residence') RETURNING id;`);
    createdPatientIds.push(patientId);
    sql(`
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number) VALUES('${orgId}',10,10,399,'active','COORD-LIC-${stamp}');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${caregiverId}','caregiver','active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${medicalId}','medical_professional','active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${therapyId}','therapist','active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${outsiderId}','caregiver','active');
      INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
      INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${caregiverId}','${patientId}','caregiver',true,'${directorId}');
      INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${medicalId}','${patientId}','medical_professional',true,'${directorId}');
      INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${therapyId}','${patientId}','therapist',true,'${directorId}');
    `);
    // outsiderId is a real caregiver in the SAME org but deliberately
    // NOT assigned to Mrs. Reyes at all -- the negative case below.

    const directorTok = await login(directorEmail, PW);
    const caregiverTok = await login(caregiverEmail, PW);
    const medicalTok = await login(medicalEmail, PW);
    const therapyTok = await login(therapyEmail, PW);
    const outsiderTok = await login(outsiderEmail, PW);

    const [, surgeon] = (await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: orgId, p_provider_id: null, p_display_name: 'Dr. Adaeze Okafor, Orthopedic Surgery', p_professional_title: 'MD',
      p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: 'Riverside Orthopedics', p_office_phone: null,
      p_fax_number: null, p_secure_contact_email: `coordplan-surgeon-${stamp}@example-ortho.test`, p_office_address: null,
      p_professional_identifier: null, p_credentials: 'Board Certified Orthopedic Surgery',
    }, directorTok)) as [number, { id: string }];
    await rpc('hcn_associate_provider_with_patient', { p_patient_id: patientId, p_provider_id: surgeon.id, p_relationship_note: 'Performed the hip replacement.' }, directorTok);

    // Director creates the plan.
    const [createStatus, plan] = (await rpc('hcn_create_coordination_plan', {
      p_organization_id: orgId, p_patient_id: patientId, p_title: 'Mrs. Reyes -- Post-Hip-Replacement Recovery Coordination',
      p_description: 'Coordinated recovery plan following total hip replacement: post-op monitoring, mobility rehabilitation, and daily care.',
    }, directorTok)) as [number, { id: string; status: string }];
    expect(createStatus).toBe(200);
    expect(plan.status).toBe('active');

    // Director links Caregiver, Medical, Therapy -- and the external surgeon.
    const [caregiverAddStatus] = await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: plan.id, p_participant_type: 'internal_user', p_participant_user_id: caregiverId, p_external_provider_id: null, p_role_label: 'Primary Caregiver',
    }, directorTok);
    expect(caregiverAddStatus).toBe(200);
    const [medicalAddStatus] = await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: plan.id, p_participant_type: 'internal_user', p_participant_user_id: medicalId, p_external_provider_id: null, p_role_label: 'Post-Op Medical Monitoring',
    }, directorTok);
    expect(medicalAddStatus).toBe(200);
    const [therapyAddStatus] = await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: plan.id, p_participant_type: 'internal_user', p_participant_user_id: therapyId, p_external_provider_id: null, p_role_label: 'Mobility Rehabilitation',
    }, directorTok);
    expect(therapyAddStatus).toBe(200);
    const [directorAddStatus] = await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: plan.id, p_participant_type: 'internal_user', p_participant_user_id: directorId, p_external_provider_id: null, p_role_label: 'Overseeing Director',
    }, directorTok);
    expect(directorAddStatus).toBe(200);
    const [surgeonAddStatus, surgeonParticipant] = (await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: plan.id, p_participant_type: 'external_provider', p_participant_user_id: null, p_external_provider_id: surgeon.id, p_role_label: 'Operating Surgeon',
    }, directorTok)) as [number, { participant_type: string; external_provider_id: string }];
    expect(surgeonAddStatus).toBe(200);
    expect(surgeonParticipant.participant_type).toBe('external_provider');
    expect(surgeonParticipant.external_provider_id).toBe(surgeon.id);

    // Negative case: a same-org Caregiver with NO assignment to this
    // patient cannot be added -- being a staff member of the org is
    // not enough, only a genuine connection to THIS patient is.
    const [rejectedAddStatus] = await rpc('hcn_add_coordination_plan_participant', {
      p_plan_id: plan.id, p_participant_type: 'internal_user', p_participant_user_id: outsiderId, p_external_provider_id: null, p_role_label: 'Should be rejected',
    }, directorTok);
    expect(rejectedAddStatus).toBeGreaterThanOrEqual(400);

    // All four roles post to the SAME shared timeline -- this is the
    // actual proof of "linked to one plan": one object, four distinct
    // real identities, all reading and writing to it.
    const [medicalPostStatus] = await rpc('hcn_post_coordination_plan_update', {
      p_plan_id: plan.id, p_update_text: 'Post-op vitals stable. Incision site clean, no signs of infection. Pain managed per protocol.',
    }, medicalTok);
    expect(medicalPostStatus).toBe(200);
    const [therapyPostStatus] = await rpc('hcn_post_coordination_plan_update', {
      p_plan_id: plan.id, p_update_text: 'Day 3: patient tolerating weight-bearing with walker for short distances. Continuing ROM exercises.',
    }, therapyTok);
    expect(therapyPostStatus).toBe(200);
    const [caregiverPostStatus] = await rpc('hcn_post_coordination_plan_update', {
      p_plan_id: plan.id, p_update_text: 'Assisted with morning routine and medication reminders. Patient in good spirits, mobility improving daily.',
    }, caregiverTok);
    expect(caregiverPostStatus).toBe(200);
    const [directorPostStatus] = await rpc('hcn_post_coordination_plan_update', {
      p_plan_id: plan.id, p_update_text: 'Reviewed team updates -- recovery on track. Scheduling a 2-week follow-up check-in.',
    }, directorTok);
    expect(directorPostStatus).toBe(200);

    // Every named participant can read the FULL shared timeline --
    // one authoritative record, not four separate office-siloed logs.
    for (const tok of [directorTok, caregiverTok, medicalTok, therapyTok]) {
      const [status, updates] = (await http('GET', `/rest/v1/hcn_coordination_plan_updates?plan_id=eq.${plan.id}&select=update_text&order=created_at`, undefined, tok)) as [number, { update_text: string }[]];
      expect(status).toBe(200);
      expect(updates.length).toBe(4);
    }

    // The unassigned same-org outsider can see NONE of it -- plan
    // scoping is by named participation, not blanket org membership.
    const [outsiderReadStatus, outsiderRows] = (await http('GET', `/rest/v1/hcn_coordination_plan_updates?plan_id=eq.${plan.id}&select=id`, undefined, outsiderTok)) as [number, unknown[]];
    expect(outsiderReadStatus).toBe(200);
    expect(outsiderRows).toHaveLength(0);

    // The outsider also cannot post to a plan they were never named on.
    const [outsiderPostStatus] = await rpc('hcn_post_coordination_plan_update', { p_plan_id: plan.id, p_update_text: 'Should be rejected.' }, outsiderTok);
    expect(outsiderPostStatus).toBeGreaterThanOrEqual(400);

    // Director closes the plan with a summary once recovery is complete.
    const [closeStatus, closed] = (await rpc('hcn_close_coordination_plan', {
      p_plan_id: plan.id, p_closing_summary: 'Full recovery achieved at 6 weeks. All care team goals met.',
    }, directorTok)) as [number, { status: string; closing_summary: string }];
    expect(closeStatus).toBe(200);
    expect(closed.status).toBe('completed');
    expect(closed.closing_summary).toContain('Full recovery');

    // Once completed, the plan no longer accepts new updates from
    // anyone, even a still-named participant.
    const [postAfterCloseStatus] = await rpc('hcn_post_coordination_plan_update', { p_plan_id: plan.id, p_update_text: 'Posting after close should fail.' }, medicalTok);
    expect(postAfterCloseStatus).toBeGreaterThanOrEqual(400);
  });

  it('cross-organization isolation: a different org cannot see or act on this plan', async () => {
    const directorAEmail = `coordplan-xorg-a-${stamp}@local.test`;
    const directorBEmail = `coordplan-xorg-b-${stamp}@local.test`;
    const directorAId = await authSignUp(directorAEmail, PW);
    const directorBId = await authSignUp(directorBEmail, PW);
    createdUserIds.push(directorAId, directorBId);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorAId}','${directorBId}');`);
    const orgAId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('CoordPlan XOrg A ${stamp}','integrated_care','${directorAId}') RETURNING id;`);
    const orgBId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('CoordPlan XOrg B ${stamp}','integrated_care','${directorBId}') RETURNING id;`);
    createdOrgIds.push(orgAId, orgBId);
    const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('XOrg','Patient','XOrg Patient','1 Ave','F') RETURNING id;`);
    createdPatientIds.push(patientId);
    sql(`
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number) VALUES('${orgAId}',10,10,399,'active','COORD-LIC-A-${stamp}');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgAId}','${directorAId}','director','active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgBId}','${directorBId}','director','active');
      INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgAId}','${patientId}','active','${directorAId}');
    `);
    const directorATok = await login(directorAEmail, PW);
    const directorBTok = await login(directorBEmail, PW);
    const [, plan] = (await rpc('hcn_create_coordination_plan', {
      p_organization_id: orgAId, p_patient_id: patientId, p_title: 'Org A Plan', p_description: null,
    }, directorATok)) as [number, { id: string }];

    const [bReadStatus, bRows] = (await http('GET', `/rest/v1/hcn_coordination_plans?id=eq.${plan.id}&select=id`, undefined, directorBTok)) as [number, unknown[]];
    expect(bReadStatus).toBe(200);
    expect(bRows).toHaveLength(0);

    const [bCloseStatus] = await rpc('hcn_close_coordination_plan', { p_plan_id: plan.id, p_closing_summary: 'Hostile close attempt' }, directorBTok);
    expect(bCloseStatus).toBeGreaterThanOrEqual(400);

    const stillActive = sql(`SELECT status FROM hcn_coordination_plans WHERE id='${plan.id}';`);
    expect(stillActive).toBe('active');
  });
});
