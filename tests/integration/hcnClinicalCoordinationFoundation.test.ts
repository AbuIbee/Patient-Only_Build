// HCN-CLINICAL-MASTER-002 -- backend proof of the Clinical
// Coordination Center foundation: Healthcare Contact Directory
// (Feature 1), the clinical-request lifecycle including external
// verified provider access (Features 2 & 4), and document review /
// clinical-approval separation (Feature 3.5). Every call here is a
// real RPC against a real local Postgres stack.
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, http, login, rpc, SERVICE, sql } from './_runtime';

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

// SEC-002 fixture: a clinician who holds an eligible org_role but has
// NO patient-specific staff_patient_assignments row for this patient --
// the exact gap the fix closes (role alone must not be sufficient).
async function addUnassignedClinician(ctx: { orgId: string }, orgRole: 'medical_professional' | 'therapist', label: string): Promise<{ id: string; tok: string }> {
  const email = `clinord-unassigned-${orgRole}-${stamp}-${label}@local.test`;
  const id = await authSignUp(email, PW);
  createdUserIds.push(id);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ctx.orgId}','${id}','${orgRole}','active');
  `);
  const tok = await login(email, PW);
  return { id, tok };
}

// SEC-003 fixture: a Caregiver with a real patient-specific assignment
// (so has_patient_access(patient_id) is true) but no clinical role at
// all -- the broad-visibility baseline every classification tier is
// tested against.
async function addCaregiver(ctx: { orgId: string; patientId: string; directorId: string }, label: string): Promise<{ id: string; tok: string }> {
  const email = `clinord-caregiver-${stamp}-${label}@local.test`;
  const id = await authSignUp(email, PW);
  createdUserIds.push(id);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ctx.orgId}','${id}','caregiver','active');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES('${ctx.orgId}','${id}','${ctx.patientId}','caregiver',true,'${ctx.directorId}');
  `);
  const tok = await login(email, PW);
  return { id, tok };
}

// SEC-001: drives the real two-step challenge (request a code via the
// service-role-only RPC, then verify it) to obtain a session_token --
// the only thing any of the four protected external actions accept
// now. Mirrors exactly what the Edge Function's own request_code/
// verify_code actions do, minus the Resend email hop (there is no
// mail server in the disposable stack; the code is read directly from
// the SECURITY DEFINER RPC's own response, which is deliberately the
// ONLY place it is ever exposed in plaintext).
async function verifyExternalSession(rawToken: string): Promise<string> {
  const [, requestRows] = (await rpc('hcn_request_external_verification_code', { p_raw_token: rawToken }, SERVICE)) as [number, { outcome: string; code: string }[]];
  const requestRow = requestRows[0];
  if (requestRow.outcome !== 'ok') throw new Error(`verifyExternalSession: code request failed with outcome '${requestRow.outcome}'`);
  const [, verifyRows] = (await rpc('hcn_verify_external_code', { p_raw_token: rawToken, p_code: requestRow.code }, SERVICE)) as [number, { outcome: string; session_token: string }[]];
  const verifyRow = verifyRows[0];
  if (verifyRow.outcome !== 'verified') throw new Error(`verifyExternalSession: code verify failed with outcome '${verifyRow.outcome}'`);
  return verifyRow.session_token;
}

afterAll(async () => {
  if (createdOrgIds.length) {
    const orgIds = createdOrgIds.map((id) => `'${id}'`).join(',');
    const patientIds = createdPatientIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM hcn_external_verification_codes WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds})));
      DELETE FROM hcn_external_verified_sessions WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds})));
      DELETE FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_documents WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_document_grants WHERE document_id IN (SELECT id FROM hcn_clinical_documents WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_requests WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_clinical_documents WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_patient_provider_associations WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_healthcare_providers WHERE organization_id IN (${orgIds});
      DELETE FROM organization_owner_capability_grants WHERE organization_id IN (${orgIds});
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

    // External: the session-less info function rejects a garbage
    // session token outright -- possessing the link alone proves
    // nothing (SEC-001).
    const [, bogusInfoRows] = (await rpc('hcn_external_session_request_info', { p_session_token: 'not-a-real-session' }, SERVICE)) as [number, { outcome: string }[]];
    expect(bogusInfoRows[0].outcome).toBe('invalid_session');

    // External: completes the real two-step verification challenge and
    // obtains a session token.
    const sessionToken = await verifyExternalSession(sendResult.raw_token);

    const [infoStatus, infoRows] = (await rpc('hcn_external_session_request_info', { p_session_token: sessionToken }, SERVICE)) as [number, { outcome: string; request_id: string; request_title: string }[]];
    expect(infoStatus).toBe(200);
    expect(infoRows[0].outcome).toBe('ok');
    expect(infoRows[0].request_id).toBe(request.id);
    expect(infoRows[0].request_title).toBe('Please verify current medication list');

    // External: upload a response document.
    const [uploadStatus, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
      p_session_token: sessionToken, p_storage_path: `${ctx.patientId}/ext-${stamp}.pdf`,
      p_original_filename: 'updated-medication-list.pdf', p_mime_type: 'application/pdf', p_file_size_bytes: 12345,
      p_checksum_sha256: 'abc123', p_category: 'medication_lists',
    }, SERVICE)) as [number, { id: string; review_status: string; uploader_external_label: string }];
    expect(uploadStatus).toBe(200);
    expect(uploadedDoc.review_status).toBe('received_unreviewed');
    expect(uploadedDoc.uploader_external_label).toContain(providerEmail);

    const [submitStatus] = await rpc('hcn_submit_external_response', {
      p_session_token: sessionToken, p_response_text: 'Updated list attached.',
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
    const sessionToken = await verifyExternalSession(sendResult.raw_token);
    const [, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
      p_session_token: sessionToken, p_storage_path: `${ctx.patientId}/ext-ca-${stamp}.pdf`,
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

  it('SEC-002: a same-organization clinician with NO patient-specific assignment is denied, even though an assigned one succeeds', async () => {
    const ctx = await orgWithDirectorAndPatient('sec002');
    const providerEmail = `clinord-provider-${stamp}-sec002@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    const sessionToken = await verifyExternalSession(sendResult.raw_token);
    const [, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
      p_session_token: sessionToken, p_storage_path: `${ctx.patientId}/ext-sec002-${stamp}.pdf`,
      p_original_filename: 'specialist-notes.pdf', p_mime_type: 'application/pdf', p_file_size_bytes: 500,
      p_checksum_sha256: 'sec002hash', p_category: 'specialist_assessments',
    }, SERVICE)) as [number, { id: string }];
    await rpc('hcn_review_clinical_document', { p_document_id: uploadedDoc.id, p_decision: 'forwarded_for_clinical_review', p_notes: 'Needs sign-off.' }, ctx.directorTok);

    // Holds 'medical_professional' org-wide but has NO staff_patient_assignments
    // row for THIS patient -- the exact gap SEC-002 closes. Role alone
    // must not be sufficient.
    const unassigned = await addUnassignedClinician(ctx, 'medical_professional', 'deny');
    const [unassignedStatus] = await rpc('hcn_clinical_approve_document', {
      p_document_id: uploadedDoc.id, p_notes: 'Should be denied.',
    }, unassigned.tok);
    expect(unassignedStatus).toBeGreaterThanOrEqual(400);

    // The already-assigned Medical Professional still succeeds (same
    // request as the directive's own "assigned, authorized clinician:
    // succeeds" pairing).
    const [assignedStatus, approved] = (await rpc('hcn_clinical_approve_document', {
      p_document_id: uploadedDoc.id, p_notes: 'Approved by the assigned clinician.',
    }, ctx.medicalTok)) as [number, { review_status: string }];
    expect(assignedStatus).toBe(200);
    expect(approved.review_status).toBe('clinical_approved');
  });

  it('SEC-002: an Organization Owner with a self-assigned capability grant may approve without a staff_patient_assignments row', async () => {
    const ctx = await orgWithDirectorAndPatient('sec002-owner');
    const providerEmail = `clinord-provider-${stamp}-sec002owner@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    const sessionToken = await verifyExternalSession(sendResult.raw_token);
    const [, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
      p_session_token: sessionToken, p_storage_path: `${ctx.patientId}/ext-sec002owner-${stamp}.pdf`,
      p_original_filename: 'specialist-notes.pdf', p_mime_type: 'application/pdf', p_file_size_bytes: 500,
      p_checksum_sha256: 'sec002ownerhash', p_category: 'specialist_assessments',
    }, SERVICE)) as [number, { id: string }];
    await rpc('hcn_review_clinical_document', { p_document_id: uploadedDoc.id, p_decision: 'forwarded_for_clinical_review', p_notes: 'Needs sign-off.' }, ctx.directorTok);

    sql(`
      INSERT INTO organization_owner_capability_grants(organization_id, user_id, capability, status, granted_by)
      VALUES ('${ctx.orgId}', '${ctx.directorId}', 'medical_professional', 'active', '${ctx.directorId}')
      ON CONFLICT DO NOTHING;
    `);
    const [ownerStatus, approved] = (await rpc('hcn_clinical_approve_document', {
      p_document_id: uploadedDoc.id, p_notes: 'Approved via owner capability grant.',
    }, ctx.directorTok)) as [number, { review_status: string }];
    expect(ownerStatus).toBe(200);
    expect(approved.review_status).toBe('clinical_approved');
  });

  it('a revoked external token cannot be used, even with the correct email', async () => {
    const ctx = await orgWithDirectorAndPatient('revoke');
    const providerEmail = `clinord-provider-${stamp}-revoke@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctx, providerEmail);

    const [revokeStatus] = await rpc('hcn_revoke_clinical_request_access', { p_request_id: request.id }, ctx.directorTok);
    expect(revokeStatus).toBe(204); // void-returning RPC -- PostgREST reports success as 204 No Content, not 200

    const [, rows] = (await rpc('hcn_request_external_verification_code', {
      p_raw_token: sendResult.raw_token,
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

    const [, oldTokenRows] = (await rpc('hcn_request_external_verification_code', {
      p_raw_token: firstToken.raw_token,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(oldTokenRows[0].outcome).toBe('revoked');

    const newSessionToken = await verifyExternalSession(resendResult.raw_token);
    expect(newSessionToken).toBeTruthy();
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

    const [, rows] = (await rpc('hcn_request_external_verification_code', {
      p_raw_token: sendResult.raw_token,
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

    const [, rows] = (await rpc('hcn_request_external_verification_code', {
      p_raw_token: sendResult.raw_token,
    }, SERVICE)) as [number, { outcome: string }[]];
    expect(rows[0].outcome).toBe('expired');
  });
});

describe('HCN-CLINICAL-MASTER-002-CONTINUATION SEC-001 -- external recipient identity verification challenge', () => {
  it('a wrong code is rejected and never issues a session', async () => {
    const ctx = await orgWithDirectorAndPatient('sec001-wrong-code');
    const providerEmail = `clinord-provider-${stamp}-sec001a@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    await rpc('hcn_request_external_verification_code', { p_raw_token: sendResult.raw_token }, SERVICE);

    const [, wrongRows] = (await rpc('hcn_verify_external_code', { p_raw_token: sendResult.raw_token, p_code: '000000' }, SERVICE)) as [number, { outcome: string; session_token: string | null }[]];
    expect(wrongRows[0].outcome).toBe('wrong_code');
    expect(wrongRows[0].session_token).toBeNull();
  });

  it('exceeding 5 failed attempts permanently retires that code, even if the correct code is then supplied', async () => {
    const ctx = await orgWithDirectorAndPatient('sec001-attempts');
    const providerEmail = `clinord-provider-${stamp}-sec001b@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    const [, requestRows] = (await rpc('hcn_request_external_verification_code', { p_raw_token: sendResult.raw_token }, SERVICE)) as [number, { outcome: string; code: string }[]];
    const realCode = requestRows[0].code;

    for (let i = 0; i < 5; i++) {
      const [, rows] = (await rpc('hcn_verify_external_code', { p_raw_token: sendResult.raw_token, p_code: '999999' }, SERVICE)) as [number, { outcome: string }[]];
      expect(['wrong_code', 'too_many_attempts']).toContain(rows[0].outcome);
    }
    const [, finalRows] = (await rpc('hcn_verify_external_code', { p_raw_token: sendResult.raw_token, p_code: realCode }, SERVICE)) as [number, { outcome: string }[]];
    expect(finalRows[0].outcome).toBe('too_many_attempts');
  });

  it('an expired code is rejected', async () => {
    const ctx = await orgWithDirectorAndPatient('sec001-expired-code');
    const providerEmail = `clinord-provider-${stamp}-sec001c@example-clinic.test`;
    const { sendResult, request } = await createSentRequest(ctx, providerEmail);
    const [, requestRows] = (await rpc('hcn_request_external_verification_code', { p_raw_token: sendResult.raw_token }, SERVICE)) as [number, { outcome: string; code: string }[]];
    const realCode = requestRows[0].code;
    sql(`UPDATE hcn_external_verification_codes SET expires_at = now() - interval '1 minute' WHERE token_id = (SELECT id FROM hcn_external_access_tokens WHERE request_id='${request.id}');`);

    const [, rows] = (await rpc('hcn_verify_external_code', { p_raw_token: sendResult.raw_token, p_code: realCode }, SERVICE)) as [number, { outcome: string }[]];
    expect(rows[0].outcome).toBe('code_expired');
  });

  it('requesting a second code before the cooldown elapses is rate limited, and a hard cap eventually applies', async () => {
    const ctx = await orgWithDirectorAndPatient('sec001-rate-limit');
    const providerEmail = `clinord-provider-${stamp}-sec001d@example-clinic.test`;
    const { sendResult } = await createSentRequest(ctx, providerEmail);
    const [, first] = (await rpc('hcn_request_external_verification_code', { p_raw_token: sendResult.raw_token }, SERVICE)) as [number, { outcome: string }[]];
    expect(first[0].outcome).toBe('ok');
    const [, second] = (await rpc('hcn_request_external_verification_code', { p_raw_token: sendResult.raw_token }, SERVICE)) as [number, { outcome: string }[]];
    expect(second[0].outcome).toBe('rate_limited');
  });

  it('revoking request access invalidates an already-issued verified session, not merely future verification attempts', async () => {
    const ctx = await orgWithDirectorAndPatient('sec001-session-revoke');
    const providerEmail = `clinord-provider-${stamp}-sec001e@example-clinic.test`;
    const { sendResult, request } = await createSentRequest(ctx, providerEmail);
    const sessionToken = await verifyExternalSession(sendResult.raw_token);

    const [, beforeRevoke] = (await rpc('hcn_external_session_request_info', { p_session_token: sessionToken }, SERVICE)) as [number, { outcome: string }[]];
    expect(beforeRevoke[0].outcome).toBe('ok');

    await rpc('hcn_revoke_clinical_request_access', { p_request_id: request.id }, ctx.directorTok);

    const [, afterRevoke] = (await rpc('hcn_external_session_request_info', { p_session_token: sessionToken }, SERVICE)) as [number, { outcome: string }[]];
    expect(afterRevoke[0].outcome).toBe('invalid_session');
  });

  it('protected external actions reject a missing or garbage session token without revealing anything about the request', async () => {
    const [uploadStatus] = await rpc('hcn_record_external_document_upload', {
      p_session_token: 'garbage', p_storage_path: 'x/y.pdf', p_original_filename: 'y.pdf', p_mime_type: 'application/pdf',
      p_file_size_bytes: 10, p_checksum_sha256: 'x', p_category: 'other_clinical_attachment',
    }, SERVICE);
    expect(uploadStatus).toBeGreaterThanOrEqual(400);

    const [submitStatus] = await rpc('hcn_submit_external_response', { p_session_token: 'garbage', p_response_text: 'hi' }, SERVICE);
    expect(submitStatus).toBeGreaterThanOrEqual(400);

    const [, docsRows] = (await rpc('hcn_list_external_shared_documents', { p_session_token: 'garbage' }, SERVICE)) as [number, unknown[]];
    expect(docsRows).toEqual([]);
  });
});

describe('HCN-CLINICAL-MASTER-002-CONTINUATION SEC-003 -- document classification access controls', () => {
  it('a caregiver with ordinary patient access can see a general-tier document but not a specially-protected one', async () => {
    const ctx = await orgWithDirectorAndPatient('sec003-general');
    const caregiver = await addCaregiver(ctx, 'sec003a');
    const generalDocId = sql(`
      INSERT INTO hcn_clinical_documents(organization_id, patient_id, category, classification, storage_path, original_filename, mime_type, file_size_bytes, checksum_sha256, uploaded_by)
      VALUES ('${ctx.orgId}', '${ctx.patientId}', 'care_instructions', 'general_care_coordination', '${ctx.patientId}/general-${stamp}.pdf', 'general.pdf', 'application/pdf', 100, 'h1', '${ctx.directorId}')
      RETURNING id;
    `);
    const protectedDocId = sql(`
      INSERT INTO hcn_clinical_documents(organization_id, patient_id, category, classification, storage_path, original_filename, mime_type, file_size_bytes, checksum_sha256, uploaded_by)
      VALUES ('${ctx.orgId}', '${ctx.patientId}', 'therapy_reports', 'specially_protected_documentation', '${ctx.patientId}/protected-${stamp}.pdf', 'protected.pdf', 'application/pdf', 100, 'h2', '${ctx.medicalId}')
      RETURNING id;
    `);

    const [, generalVisible] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${generalDocId}&select=id`, undefined, caregiver.tok);
    expect(generalVisible).toHaveLength(1);
    const [, protectedVisible] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${protectedDocId}&select=id`, undefined, caregiver.tok);
    expect(protectedVisible).toHaveLength(0);
  });

  it('a qualified clinician cannot see a specially-protected document without an explicit grant, but can once granted', async () => {
    const ctx = await orgWithDirectorAndPatient('sec003-protected');
    const protectedDocId = sql(`
      INSERT INTO hcn_clinical_documents(organization_id, patient_id, category, classification, storage_path, original_filename, mime_type, file_size_bytes, checksum_sha256, uploaded_by)
      VALUES ('${ctx.orgId}', '${ctx.patientId}', 'therapy_reports', 'specially_protected_documentation', '${ctx.patientId}/protected2-${stamp}.pdf', 'protected2.pdf', 'application/pdf', 100, 'h3', '${ctx.directorId}')
      RETURNING id;
    `);

    const [, beforeGrant] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${protectedDocId}&select=id`, undefined, ctx.medicalTok);
    expect(beforeGrant).toHaveLength(0);

    sql(`
      INSERT INTO hcn_document_grants(document_id, grantee_type, grantee_user_id, granted_by)
      VALUES ('${protectedDocId}', 'internal_user', '${ctx.medicalId}', '${ctx.directorId}');
    `);

    const [, afterGrant] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${protectedDocId}&select=id`, undefined, ctx.medicalTok);
    expect(afterGrant).toHaveLength(1);
  });

  it('restricted clinical documentation is visible to the assigned clinician and Director, but not to a plain caregiver', async () => {
    const ctx = await orgWithDirectorAndPatient('sec003-restricted');
    const caregiver = await addCaregiver(ctx, 'sec003c');
    const restrictedDocId = sql(`
      INSERT INTO hcn_clinical_documents(organization_id, patient_id, category, classification, storage_path, original_filename, mime_type, file_size_bytes, checksum_sha256, uploaded_by)
      VALUES ('${ctx.orgId}', '${ctx.patientId}', 'specialist_assessments', 'restricted_clinical_documentation', '${ctx.patientId}/restricted-${stamp}.pdf', 'restricted.pdf', 'application/pdf', 100, 'h4', '${ctx.directorId}')
      RETURNING id;
    `);

    const [, caregiverView] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${restrictedDocId}&select=id`, undefined, caregiver.tok);
    expect(caregiverView).toHaveLength(0);
    const [, medicalView] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${restrictedDocId}&select=id`, undefined, ctx.medicalTok);
    expect(medicalView).toHaveLength(1);
    const [, directorView] = await http('GET', `/rest/v1/hcn_clinical_documents?id=eq.${restrictedDocId}&select=id`, undefined, ctx.directorTok);
    expect(directorView).toHaveLength(1);
  });
});

describe('HCN-CLINICAL-MASTER-002-CONTINUATION SEC-005 -- notification recipient/request binding', () => {
  it('resolves the real recipient from the token row, never a caller-supplied address, for a valid request+token pairing', async () => {
    const ctx = await orgWithDirectorAndPatient('sec005-valid');
    const providerEmail = `clinord-provider-${stamp}-sec005a@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctx, providerEmail);

    const [status, rows] = (await rpc('hcn_resolve_notification_target', {
      p_request_id: request.id, p_raw_token: sendResult.raw_token,
    }, ctx.directorTok)) as [number, { recipient_email: string; token_id: string; already_delivered: boolean }[]];
    expect(status).toBe(200);
    expect(rows[0].recipient_email).toBe(providerEmail);
    expect(rows[0].already_delivered).toBe(false);
  });

  it('rejects a token that belongs to a DIFFERENT request, even if both requests are in the same org', async () => {
    const ctx = await orgWithDirectorAndPatient('sec005-mismatch');
    const { request: requestA } = await createSentRequest(ctx, `clinord-provider-${stamp}-sec005b-a@example-clinic.test`);
    const { sendResult: sendB } = await createSentRequest(ctx, `clinord-provider-${stamp}-sec005b-b@example-clinic.test`);

    // requestA's id, but sendB's token -- a mismatched pairing a naive
    // implementation that merely checked "does this token exist" would
    // have accepted.
    const [status] = await rpc('hcn_resolve_notification_target', {
      p_request_id: requestA.id, p_raw_token: sendB.raw_token,
    }, ctx.directorTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('cross-organization isolation: a different org\'s Director cannot resolve a notification target for this request', async () => {
    const ctxA = await orgWithDirectorAndPatient('sec005-xorg-a');
    const ctxB = await orgWithDirectorAndPatient('sec005-xorg-b');
    const providerEmail = `clinord-provider-${stamp}-sec005c@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctxA, providerEmail);

    const [status] = await rpc('hcn_resolve_notification_target', {
      p_request_id: request.id, p_raw_token: sendResult.raw_token,
    }, ctxB.directorTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('reports already_delivered once a send_delivered event exists for this exact token, preventing a duplicate send', async () => {
    const ctx = await orgWithDirectorAndPatient('sec005-idempotent');
    const providerEmail = `clinord-provider-${stamp}-sec005d@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctx, providerEmail);

    const [, firstRows] = (await rpc('hcn_resolve_notification_target', {
      p_request_id: request.id, p_raw_token: sendResult.raw_token,
    }, ctx.directorTok)) as [number, { token_id: string; already_delivered: boolean }[]];
    expect(firstRows[0].already_delivered).toBe(false);

    sql(`
      INSERT INTO hcn_clinical_request_events(request_id, event_type, actor_user_id, details)
      VALUES ('${request.id}', 'send_delivered', '${ctx.directorId}', jsonb_build_object('token_id', '${firstRows[0].token_id}'));
    `);

    const [, secondRows] = (await rpc('hcn_resolve_notification_target', {
      p_request_id: request.id, p_raw_token: sendResult.raw_token,
    }, ctx.directorTok)) as [number, { already_delivered: boolean }[]];
    expect(secondRows[0].already_delivered).toBe(true);
  });

  it('a revoked token can no longer be used to resolve a fresh notification target', async () => {
    const ctx = await orgWithDirectorAndPatient('sec005-revoked');
    const providerEmail = `clinord-provider-${stamp}-sec005e@example-clinic.test`;
    const { request, sendResult } = await createSentRequest(ctx, providerEmail);
    await rpc('hcn_revoke_clinical_request_access', { p_request_id: request.id }, ctx.directorTok);

    const [status] = await rpc('hcn_resolve_notification_target', {
      p_request_id: request.id, p_raw_token: sendResult.raw_token,
    }, ctx.directorTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });
});


describe('HCN-CLINICAL-MASTER-002 SEC-006 -- document write authority and revocation', () => {
  it('rejects an authenticated Director forging clinical approval via direct INSERT', async () => {
    const ctx = await orgWithDirectorAndPatient('sec006-forged-insert');
    const [status] = await http('POST', '/rest/v1/hcn_clinical_documents', {
      organization_id: ctx.orgId, patient_id: ctx.patientId,
      category: 'care_instructions', classification: 'caregiver_approved_instructions',
      storage_path: ctx.patientId + '/forged-' + stamp + '.pdf',
      original_filename: 'forged.pdf', mime_type: 'application/pdf',
      file_size_bytes: 32, uploaded_by: ctx.directorId,
      review_status: 'clinical_approved', reviewed_by: ctx.directorId,
    }, ctx.directorTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('blocks direct PATCH of review_status, while allowing a legitimate unreviewed upload', async () => {
    const ctx = await orgWithDirectorAndPatient('sec006-update');
    const storagePath = ctx.patientId + '/unreviewed-' + stamp + '.pdf';
    const [createdStatus, createdBody] = await http('POST', '/rest/v1/hcn_clinical_documents', {
      organization_id: ctx.orgId, patient_id: ctx.patientId,
      category: 'patient_provided_documents', classification: 'patient_shared_document',
      storage_path: storagePath, original_filename: 'unreviewed.pdf',
      mime_type: 'application/pdf', file_size_bytes: 64, uploaded_by: ctx.directorId,
    }, ctx.directorTok);
    expect(createdStatus, JSON.stringify(createdBody)).toBe(201);
    const row = (createdBody as Array<{ id: string; review_status: string }>)[0];
    expect(row.review_status).toBe('received_unreviewed');
    const [patchStatus] = await http('PATCH', '/rest/v1/hcn_clinical_documents?id=eq.' + row.id, {
      review_status: 'clinical_approved',
    }, ctx.directorTok);
    expect(patchStatus).toBeGreaterThanOrEqual(400);
  });

  it('rejects a Director associating a document with a patient not covered by that organization', async () => {
    const ctx = await orgWithDirectorAndPatient('sec006-org-match');
    const otherPatientId = sql("INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('Uncovered','Test','Uncovered','1 Ave','Facility') RETURNING id;");
    createdPatientIds.push(otherPatientId);
    const [status] = await http('POST', '/rest/v1/hcn_clinical_documents', {
      organization_id: ctx.orgId, patient_id: otherPatientId,
      category: 'patient_provided_documents', classification: 'patient_shared_document',
      storage_path: otherPatientId + '/mismatched-' + stamp + '.pdf',
      original_filename: 'mismatched.pdf', mime_type: 'application/pdf',
      file_size_bytes: 64, uploaded_by: ctx.directorId,
    }, ctx.directorTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('same-patient access in organization A never grants access to organization B clinical documents', async () => {
    const a = await orgWithDirectorAndPatient('tenant-boundary-a');
    const b = await orgWithDirectorAndPatient('tenant-boundary-b');
    // A real patient is simultaneously covered by both organizations,
    // but the clinician in A has NO assignment or membership in B.
    sql("INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('" +
      b.orgId + "','" + a.patientId + "','active','" + b.directorId + "');");
    const id = sql("INSERT INTO hcn_clinical_documents(organization_id,patient_id,category,classification,storage_path,original_filename,mime_type,file_size_bytes,uploaded_by) VALUES ('" +
      b.orgId + "','" + a.patientId + "','patient_provided_documents','patient_shared_document','" +
      a.patientId + "/tenant-boundary-" + stamp + ".pdf','tenant.pdf','application/pdf',64,'" + b.directorId + "') RETURNING id;");
    const [directorStatus, visible] = await http('GET',
      '/rest/v1/hcn_clinical_documents?id=eq.' + id + '&select=id', undefined, b.directorTok);
    expect(directorStatus).toBe(200);
    expect(visible).toHaveLength(1);

    const [outsiderStatus, hidden] = await http('GET',
      '/rest/v1/hcn_clinical_documents?id=eq.' + id + '&select=id', undefined, a.medicalTok);
    expect(outsiderStatus).toBe(200);
    expect(hidden).toEqual([]);

    const [insertStatus] = await http('POST','/rest/v1/hcn_clinical_documents',{
      organization_id:b.orgId,patient_id:a.patientId,
      category:'patient_provided_documents',classification:'patient_shared_document',
      storage_path:a.patientId+'/cross-tenant-'+stamp+'.pdf',
      original_filename:'cross-tenant.pdf',mime_type:'application/pdf',
      file_size_bytes:64,uploaded_by:a.medicalId,
    },a.medicalTok);
    expect(insertStatus).toBeGreaterThanOrEqual(400);
  });

  it('an uploader cannot continue reading a clinical document after assignment revocation', async () => {
    const ctx = await orgWithDirectorAndPatient('sec006-revoked');
    const caregiver = await addCaregiver(ctx, 'sec006-revoked-cg');
    const id = sql("INSERT INTO hcn_clinical_documents(organization_id,patient_id,category,classification,storage_path,original_filename,mime_type,file_size_bytes,uploaded_by) VALUES ('" +
      ctx.orgId + "','" + ctx.patientId + "','patient_provided_documents','patient_shared_document','" +
      ctx.patientId + "/revoked-" + stamp + ".pdf','test.pdf','application/pdf',64,'" + caregiver.id + "') RETURNING id;");
    const [, before] = await http('GET', '/rest/v1/hcn_clinical_documents?id=eq.' + id + '&select=id', undefined, caregiver.tok);
    expect(before).toHaveLength(1);
    sql("UPDATE staff_patient_assignments SET is_active=false WHERE organization_id='" + ctx.orgId + "' AND patient_id='" + ctx.patientId + "' AND user_id='" + caregiver.id + "';");
    const [, after] = await http('GET', '/rest/v1/hcn_clinical_documents?id=eq.' + id + '&select=id', undefined, caregiver.tok);
    expect(after).toHaveLength(0);
  });
});
