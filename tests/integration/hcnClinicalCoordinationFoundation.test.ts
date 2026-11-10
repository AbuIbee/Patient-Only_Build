// HCN-CLINICAL-MASTER-002 -- backend proof of the Clinical
// Coordination Center foundation: Healthcare Contact Directory
// (Feature 1), the clinical-request lifecycle including external
// verified provider access (Features 2 & 4), and document review /
// clinical-approval separation (Feature 3.5). Every call here is a
// real RPC against a real local Postgres stack.
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, SERVICE, sql } from './_runtime';

const PW = 'ClinicalCoord9!';
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdPatientIds: string[] = [];

async function orgWithDirectorAndPatient(label: string): Promise<{
  orgId: string; directorId: string; directorTok: string; patientId: string; medicalId: string; medicalTok: string;
}> {
  const directorEmail = `clinord-director-${stamp}-${label}@local.test`;
  const medicalEmail = `clinord-medical-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(directorEmail, PW);
  const medicalId = await authSignUp(medicalEmail, PW);
  createdUserIds.push(directorId, medicalId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${directorId}','${medicalId}');`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('ClinOrd Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  createdOrgIds.push(orgId);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('ClinOrd','Patient','ClinOrd Patient ${label}','1 Ave','Facility') RETURNING id;`);
  createdPatientIds.push(patientId);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${medicalId}','medical_professional','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${orgId}','${medicalId}','${patientId}','medical_professional',true,'${directorId}');
  `);
  const directorTok = await login(directorEmail, PW);
  const medicalTok = await login(medicalEmail, PW);
  return { orgId, directorId, directorTok, patientId, medicalId, medicalTok };
}

afterAll(async () => {
  if (createdOrgIds.length) {
    const orgIds = createdOrgIds.map((id) => `'${id}'`).join(',');
    const patientIds = createdPatientIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_documents WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_document_grants WHERE document_id IN (SELECT id FROM hcn_clinical_documents WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_requests WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_clinical_documents WHERE organization_id IN (${orgIds});
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

describe('HCN-CLINICAL-MASTER-002 Feature 1 -- Healthcare Contact Directory', () => {
  it('a Director can create, read, and update an org-scoped provider, and associate it with a patient', async () => {
    const { orgId, directorTok, patientId } = await orgWithDirectorAndPatient('contacts');
    const [createStatus, provider] = (await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: orgId, p_provider_id: null, p_display_name: 'Dr. Jane Smith', p_professional_title: 'MD',
      p_specialty: 'primary_care_physician', p_specialty_other_label: null, p_practice_name: 'Riverside Clinic',
      p_office_phone: '555-0100', p_fax_number: '555-0101', p_secure_contact_email: 'jane.smith@example-clinic.test',
      p_office_address: '100 Main St', p_professional_identifier: 'NPI-12345', p_credentials: 'Board Certified Family Medicine',
    }, directorTok)) as [number, { id: string; version: number; display_name: string }];
    expect(createStatus).toBe(200);
    expect(provider.display_name).toBe('Dr. Jane Smith');
    expect(provider.version).toBe(1);

    const [updateStatus, updated] = (await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: orgId, p_provider_id: provider.id, p_display_name: 'Dr. Jane Smith-Jones', p_professional_title: 'MD',
      p_specialty: 'primary_care_physician', p_specialty_other_label: null, p_practice_name: 'Riverside Clinic',
      p_office_phone: '555-0100', p_fax_number: '555-0101', p_secure_contact_email: 'jane.smith@example-clinic.test',
      p_office_address: '100 Main St', p_professional_identifier: 'NPI-12345', p_credentials: 'Board Certified Family Medicine',
      p_expected_version: 1,
    }, directorTok)) as [number, { display_name: string; version: number }];
    expect(updateStatus).toBe(200);
    expect(updated.display_name).toBe('Dr. Jane Smith-Jones');
    expect(updated.version).toBe(2);

    const [staleStatus] = await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: orgId, p_provider_id: provider.id, p_display_name: 'Conflicting Edit', p_professional_title: null,
      p_specialty: 'primary_care_physician', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
      p_fax_number: null, p_secure_contact_email: null, p_office_address: null, p_professional_identifier: null, p_credentials: null,
      p_expected_version: 1, // stale -- real version is now 2
    }, directorTok);
    expect(staleStatus).toBeGreaterThanOrEqual(400);

    const [assocStatus, assoc] = (await rpc('hcn_associate_provider_with_patient', {
      p_patient_id: patientId, p_provider_id: provider.id, p_relationship_note: 'Primary care since 2020',
    }, directorTok)) as [number, { id: string; patient_id: string; provider_id: string }];
    expect(assocStatus).toBe(200);
    expect(assoc.patient_id).toBe(patientId);
  });

  it('a Caregiver without any assignment in the org cannot create a provider', async () => {
    const { orgId } = await orgWithDirectorAndPatient('contacts-deny');
    const outsiderEmail = `clinord-outsider-${stamp}@local.test`;
    const outsiderId = await authSignUp(outsiderEmail, PW);
    createdUserIds.push(outsiderId);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${outsiderId}';`);
    const outsiderTok = await login(outsiderEmail, PW);
    const [status] = await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: orgId, p_provider_id: null, p_display_name: 'Should Fail', p_professional_title: null,
      p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
      p_fax_number: null, p_secure_contact_email: null, p_office_address: null, p_professional_identifier: null, p_credentials: null,
    }, outsiderTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

async function createSentRequest(director: { orgId: string; directorTok: string; patientId: string }, providerEmail: string) {
  const [, provider] = (await rpc('hcn_upsert_healthcare_provider', {
    p_organization_id: director.orgId, p_provider_id: null, p_display_name: 'Dr. External Provider', p_professional_title: 'MD',
    p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: 'External Clinic', p_office_phone: null,
    p_fax_number: null, p_secure_contact_email: providerEmail, p_office_address: null, p_professional_identifier: null, p_credentials: null,
  }, director.directorTok)) as [number, { id: string }];

  const [, request] = (await rpc('hcn_create_clinical_request', {
    p_organization_id: director.orgId, p_patient_id: director.patientId, p_provider_id: provider.id,
    p_request_type: 'medication_list_verification', p_title: 'Please verify current medication list',
    p_description: 'Need an updated list before the next visit.', p_requested_items: ['Current medication list'],
    p_deadline_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), p_follow_up_owner_id: null,
  }, director.directorTok)) as [number, { id: string; status: string }];

  const [sendStatus, sendRows] = (await rpc('hcn_send_clinical_request', {
    p_request_id: request.id, p_expires_in_days: 14,
  }, director.directorTok)) as [number, { request: { status: string }; raw_token: string; token_expires_at: string }[]];
  const sendResult = sendRows?.[0];

  return { provider, request, sendStatus, sendResult };
}

describe('HCN-CLINICAL-MASTER-002 Features 2 & 4 -- clinical request lifecycle and external verified access', () => {
  it('a full Director -> external provider -> response -> review cycle works end to end', async () => {
    const ctx = await orgWithDirectorAndPatient('e2e');
    const providerEmail = `clinord-provider-${stamp}-e2e@example-clinic.test`;
    const { request, sendStatus, sendResult } = await createSentRequest(ctx, providerEmail);
    expect(sendStatus).toBe(200);
    expect(sendResult.request.status).toBe('sent');
    expect(sendResult.raw_token).toBeTruthy();

    // External: wrong email is rejected.
    const [, wrongEmailRows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: 'someone-else@example.test',
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(wrongEmailRows[0].outcome).toBe('wrong_recipient');

    // External: correct verification succeeds and returns only this request's info.
    const [verifyStatus, verifyRows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail,
    }, SERVICE)) as [number, { outcome: string; request_id: string; request_title: string }[]];
    expect(verifyStatus).toBe(200);
    expect(verifyRows[0].outcome).toBe('verified');
    expect(verifyRows[0].request_id).toBe(request.id);
    expect(verifyRows[0].request_title).toBe('Please verify current medication list');

    // External: upload a response document.
    const [uploadStatus, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail, p_storage_path: `${ctx.patientId}/ext-${stamp}.pdf`,
      p_original_filename: 'updated-medication-list.pdf', p_mime_type: 'application/pdf', p_file_size_bytes: 12345,
      p_checksum_sha256: 'abc123', p_category: 'medication_lists',
    }, SERVICE)) as [number, { id: string; review_status: string; uploader_external_label: string }];
    expect(uploadStatus).toBe(200);
    expect(uploadedDoc.review_status).toBe('received_unreviewed');
    expect(uploadedDoc.uploader_external_label).toContain(providerEmail);

    const [submitStatus] = await rpc('hcn_submit_external_response', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail, p_response_text: 'Updated list attached.',
    }, SERVICE);
    expect(submitStatus).toBe(204); // void-returning RPC

    const requestStatus = sql(`SELECT status FROM hcn_clinical_requests WHERE id='${request.id}';`);
    expect(requestStatus).toBe('pending_review');

    // Director performs administrative review -- accepts the document.
    const [reviewStatus, reviewed] = (await rpc('hcn_review_clinical_document', {
      p_document_id: uploadedDoc.id, p_decision: 'accepted', p_notes: 'Looks complete.',
    }, ctx.directorTok)) as [number, { review_status: string }];
    expect(reviewStatus).toBe(200);
    expect(reviewed.review_status).toBe('accepted');

    // Full event history is present and in order.
    const eventTypes = sql(`SELECT string_agg(event_type, ',' ORDER BY created_at) FROM hcn_clinical_request_events WHERE request_id='${request.id}';`);
    expect(eventTypes).toContain('created');
    expect(eventTypes).toContain('recipient_verified');
    expect(eventTypes).toContain('document_uploaded');
    expect(eventTypes).toContain('response_submitted');
    expect(eventTypes).toContain('administrative_review');
  });

  it('a document forwarded for clinical review can only be approved by a qualified clinical role, not by the Director alone', async () => {
    const ctx = await orgWithDirectorAndPatient('clinical-approval');
    const providerEmail = `clinord-provider-${stamp}-ca@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    const [, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail, p_storage_path: `${ctx.patientId}/ext-ca-${stamp}.pdf`,
      p_original_filename: 'new-treatment-plan.pdf', p_mime_type: 'application/pdf', p_file_size_bytes: 500,
      p_checksum_sha256: 'def456', p_category: 'specialist_assessments',
    }, SERVICE)) as [number, { id: string }];

    const [forwardStatus, forwarded] = (await rpc('hcn_review_clinical_document', {
      p_document_id: uploadedDoc.id, p_decision: 'forwarded_for_clinical_review', p_notes: 'Needs clinical sign-off.',
    }, ctx.directorTok)) as [number, { review_status: string }];
    expect(forwardStatus).toBe(200);
    expect(forwarded.review_status).toBe('forwarded_for_clinical_review');

    // Director attempting to clinically approve it directly is refused --
    // administrative authority is not clinical authority (directive 5.5/7.5).
    const [directorApproveStatus] = await rpc('hcn_clinical_approve_document', {
      p_document_id: uploadedDoc.id, p_notes: 'Approved by director (should fail).',
    }, ctx.directorTok);
    expect(directorApproveStatus).toBeGreaterThanOrEqual(400);

    // The assigned Medical Professional CAN approve it.
    const [medicalApproveStatus, approved] = (await rpc('hcn_clinical_approve_document', {
      p_document_id: uploadedDoc.id, p_notes: 'Reviewed and approved.',
    }, ctx.medicalTok)) as [number, { review_status: string }];
    expect(medicalApproveStatus).toBe(200);
    expect(approved.review_status).toBe('clinical_approved');
  });

  it('a revoked external token cannot be used, even with the correct email', async () => {
    const ctx = await orgWithDirectorAndPatient('revoke');
    const providerEmail = `clinord-provider-${stamp}-revoke@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctx, providerEmail);

    const [revokeStatus] = await rpc('hcn_revoke_clinical_request_access', { p_request_id: request.id }, ctx.directorTok);
    expect(revokeStatus).toBe(204); // void-returning RPC -- PostgREST reports success as 204 No Content, not 200

    const [, rows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(rows[0].outcome).toBe('revoked');
  });

  it('resending an invitation issues a new token and revokes the old one, without creating a duplicate request', async () => {
    const ctx = await orgWithDirectorAndPatient('resend');
    const providerEmail = `clinord-provider-${stamp}-resend@example-clinic.test`;
    const { request, sendResult: firstToken } = await createSentRequest(ctx, providerEmail);

    const [resendStatus, resendRows] = (await rpc('hcn_resend_clinical_request_invitation', {
      p_request_id: request.id, p_expires_in_days: 14,
    }, ctx.directorTok)) as [number, { raw_token: string }[]];
    expect(resendStatus).toBe(200);
    const resendResult = resendRows[0];
    expect(resendResult.raw_token).not.toBe(firstToken.raw_token);

    const requestCount = sql(`SELECT count(*) FROM hcn_clinical_requests WHERE id='${request.id}';`);
    expect(requestCount).toBe('1');

    const [, oldTokenRows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: firstToken.raw_token, p_confirmed_email: providerEmail,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(oldTokenRows[0].outcome).toBe('revoked');

    const [, newTokenRows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: resendResult.raw_token, p_confirmed_email: providerEmail,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(newTokenRows[0].outcome).toBe('verified');
  });

  it('cancelling a request revokes outstanding access and reaches a terminal state', async () => {
    const ctx = await orgWithDirectorAndPatient('cancel');
    const providerEmail = `clinord-provider-${stamp}-cancel@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctx, providerEmail);

    const [cancelStatus, cancelled] = (await rpc('hcn_cancel_clinical_request', {
      p_request_id: request.id, p_reason: 'No longer needed.',
    }, ctx.directorTok)) as [number, { status: string }];
    expect(cancelStatus).toBe(200);
    expect(cancelled.status).toBe('cancelled');

    const [, rows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(rows[0].outcome).toBe('revoked');
  });

  it('cross-organization isolation: a director from a different org cannot see or act on this request', async () => {
    const ctxA = await orgWithDirectorAndPatient('xorg-a');
    const ctxB = await orgWithDirectorAndPatient('xorg-b');
    const providerEmail = `clinord-provider-${stamp}-xorg@example-clinic.test`;
    const { request } = await createSentRequest(ctxA, providerEmail);

    const [reviewStatus] = await rpc('hcn_review_clinical_document', {
      p_document_id: '00000000-0000-0000-0000-000000000000', p_decision: 'accepted', p_notes: 'n/a',
    }, ctxB.directorTok);
    expect(reviewStatus).toBeGreaterThanOrEqual(400); // no such document at all, from org B's perspective

    const [cancelStatus] = await rpc('hcn_cancel_clinical_request', { p_request_id: request.id, p_reason: 'Hostile cancel attempt' }, ctxB.directorTok);
    expect(cancelStatus).toBeGreaterThanOrEqual(400);

    const stillOpen = sql(`SELECT status FROM hcn_clinical_requests WHERE id='${request.id}';`);
    expect(stillOpen).toBe('sent');
  });

  it('an expired token is rejected even with the correct email', async () => {
    const ctx = await orgWithDirectorAndPatient('expired');
    const providerEmail = `clinord-provider-${stamp}-expired@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    sql(`UPDATE hcn_external_access_tokens SET expires_at = now() - interval '1 hour' WHERE request_id = (SELECT id FROM hcn_clinical_requests WHERE organization_id='${ctx.orgId}');`);

    const [, rows] = (await rpc('hcn_verify_external_access', {
      p_raw_token: sendResult.raw_token, p_confirmed_email: providerEmail,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(rows[0].outcome).toBe('expired');
  });
});
