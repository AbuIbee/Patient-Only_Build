// MMA-ENT-SALES-009 Workstream C §17 (F-09) — "Prevent: ... Therapist
// package caregiver feature access." Fixed in migration 131.
//
// Before this fix, neither director_approve_application() (the
// credential-verified application pipeline) nor invite_org_member()
// (the direct-invite path) consulted organizations.package_type at
// all -- a 'therapist'-only ("Therapist Enterprise") package
// organization could have a caregiver or medical_professional office
// granted through either path with full working access, exactly as if
// it held the broader 'integrated_care' ("Full Enterprise") package.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'F09PkgScope9!';
const stamp = Date.now();
const THERAPIST_ORG = 'c0888888-8888-4888-8888-888888888888';
const FULL_ORG = 'c0999999-9999-4999-8999-999999999999';

const emails = {
  director: `f09-director-${stamp}@local.test`,
  fullDirector: `f09-fulldirector-${stamp}@local.test`,
  caregiverApplicant: `f09-caregiver-${stamp}@local.test`,
  medicalApplicant: `f09-medical-${stamp}@local.test`,
  existingStaff: `f09-existing-${stamp}@local.test`,
  fullExistingStaff: `f09-fullexisting-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const appIds: string[] = [];

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id IN ('${THERAPIST_ORG}','${FULL_ORG}');
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${THERAPIST_ORG}','F09 Therapist Org ${stamp}','therapist','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${THERAPIST_ORG}',10,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${THERAPIST_ORG}','${ids.director}','director','active');
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${FULL_ORG}','F09 Full Org ${stamp}','integrated_care','${ids.fullDirector}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${FULL_ORG}',10,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${FULL_ORG}','${ids.fullDirector}','director','active');
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  const filter = appIds.length ? appIds.map((i) => `'${i}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM public.professional_application_events WHERE application_id IN (${filter});
    DELETE FROM public.professional_applications WHERE id IN (${filter});
    DELETE FROM organizations WHERE id IN ('${THERAPIST_ORG}','${FULL_ORG}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-SALES-009 F-09 FIX (migration 131) — a Therapist Enterprise package organization cannot acquire caregiver/medical offices', () => {
  it('FIX: director_approve_application() rejects approving a credential-verified caregiver application against a therapist-package org', async () => {
    const [, app] = (await rpc('submit_professional_application', {
      p_requested_office: 'caregiver', p_target_organization_id: THERAPIST_ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
      p_legal_name: 'F09 Caregiver Applicant', p_preferred_name: null, p_contact_email: emails.caregiverApplicant, p_contact_phone: null,
      p_professional_title: 'Caregiver', p_profession_category: 'caregiver', p_application_details: {},
    }, tok.caregiverApplicant)) as [number, { id: string }];
    appIds.push(app.id);
    await rpc('record_credential_verification', { p_application_id: app.id, p_decision: 'independently_verified', p_evidence_reference: 'test' }, tok.director);

    const [status, body] = await rpc('director_approve_application', { p_application_id: app.id }, tok.director);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toContain('does not include caregiver or medical professional offices');

    const membershipCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${THERAPIST_ORG}' AND user_id='${ids.caregiverApplicant}';`);
    expect(membershipCount).toBe('0');
  });

  it('FIX: director_approve_application() rejects approving a credential-verified medical_professional application against a therapist-package org', async () => {
    const [, app] = (await rpc('submit_professional_application', {
      p_requested_office: 'medical_professional', p_target_organization_id: THERAPIST_ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
      p_legal_name: 'F09 Medical Applicant', p_preferred_name: null, p_contact_email: emails.medicalApplicant, p_contact_phone: null,
      p_professional_title: 'RN', p_profession_category: 'medical', p_application_details: {},
    }, tok.medicalApplicant)) as [number, { id: string }];
    appIds.push(app.id);
    await rpc('record_credential_verification', { p_application_id: app.id, p_decision: 'independently_verified', p_evidence_reference: 'test' }, tok.director);

    const [status, body] = await rpc('director_approve_application', { p_application_id: app.id }, tok.director);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toContain('does not include caregiver or medical professional offices');
  });

  it('FIX: invite_org_member() rejects a direct caregiver invite against a therapist-package org', async () => {
    const [status, body] = await rpc('invite_org_member', { p_org_id: THERAPIST_ORG, p_email: emails.existingStaff, p_org_role: 'caregiver' }, tok.director);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toContain('does not include the caregiver office');

    const membershipCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${THERAPIST_ORG}' AND user_id='${ids.existingStaff}';`);
    expect(membershipCount).toBe('0');
  });

  it('regression guard: a Full Enterprise (integrated_care) package org is unaffected -- caregiver approval and direct invite both still succeed', async () => {
    const fullCaregiverEmail = `f09-fullcaregiver-${stamp}@local.test`;
    const fullCaregiverId = await authSignUp(fullCaregiverEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${fullCaregiverId}';`);
    const fullCaregiverToken = await login(fullCaregiverEmail, PW);

    const [, app] = (await rpc('submit_professional_application', {
      p_requested_office: 'caregiver', p_target_organization_id: FULL_ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
      p_legal_name: 'F09 Full Caregiver Applicant', p_preferred_name: null, p_contact_email: fullCaregiverEmail, p_contact_phone: null,
      p_professional_title: 'Caregiver', p_profession_category: 'caregiver', p_application_details: {},
    }, fullCaregiverToken)) as [number, { id: string }];
    appIds.push(app.id);
    await rpc('record_credential_verification', { p_application_id: app.id, p_decision: 'independently_verified', p_evidence_reference: 'test' }, tok.fullDirector);

    const [status] = await rpc('director_approve_application', { p_application_id: app.id }, tok.fullDirector);
    expect(status).toBe(200);

    const [inviteStatus] = await rpc('invite_org_member', { p_org_id: FULL_ORG, p_email: emails.fullExistingStaff, p_org_role: 'caregiver' }, tok.fullDirector);
    expect(inviteStatus).toBe(200);

    sql(`DELETE FROM organization_memberships WHERE organization_id='${FULL_ORG}' AND user_id='${fullCaregiverId}';`);
    await authDeleteUser(fullCaregiverId);
  });
});
