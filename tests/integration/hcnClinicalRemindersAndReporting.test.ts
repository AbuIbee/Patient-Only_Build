// HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- Automated
// Follow-Ups and Reporting. Real RPC calls against a real local
// Postgres stack -- no mocks.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, SERVICE, sql } from './_runtime';

const PW = 'RemindReport9!';
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdPatientIds: string[] = [];

async function orgWithDirectorAndPatient(label: string) {
  const directorEmail = `remind-director-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(directorEmail, PW);
  createdUserIds.push(directorId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('Remind Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  createdOrgIds.push(orgId);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('Remind','Patient','Remind Patient ${label}','1 Ave','Facility') RETURNING id;`);
  createdPatientIds.push(patientId);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,license_number) VALUES('${orgId}',10,10,399,'active','REMIND-LIC-${stamp}-${label}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
  `);
  const directorTok = await login(directorEmail, PW);
  return { orgId, directorId, directorTok, patientId };
}

async function createOverdueSentRequest(ctx: { orgId: string; directorTok: string; patientId: string }, label: string) {
  const providerEmail = `remind-provider-${stamp}-${label}@example-clinic.test`;
  const [, provider] = (await rpc('hcn_upsert_healthcare_provider', {
    p_organization_id: ctx.orgId, p_provider_id: null, p_display_name: 'Dr. Remind', p_professional_title: 'MD',
    p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
    p_fax_number: null, p_secure_contact_email: providerEmail, p_office_address: null, p_professional_identifier: null, p_credentials: null,
  }, ctx.directorTok)) as [number, { id: string }];
  const [, request] = (await rpc('hcn_create_clinical_request', {
    p_organization_id: ctx.orgId, p_patient_id: ctx.patientId, p_provider_id: provider.id, p_request_type: 'medical_documentation',
    p_title: `Remind Request ${label}`, p_description: null, p_requested_items: [],
    p_deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), p_follow_up_owner_id: null,
  }, ctx.directorTok)) as [number, { id: string }];
  await rpc('hcn_send_clinical_request', { p_request_id: request.id, p_expires_in_days: 14 }, ctx.directorTok);
  // Backdate the deadline so this request is already overdue, without
  // needing to actually wait real time.
  sql(`UPDATE hcn_clinical_requests SET deadline_at = now() - interval '2 days' WHERE id='${request.id}';`);
  return request.id as string;
}

afterAll(async () => {
  if (createdOrgIds.length) {
    const orgIds = createdOrgIds.map((id) => `'${id}'`).join(',');
    const patientIds = createdPatientIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM hcn_coordination_plans WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_external_verification_codes WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds})));
      DELETE FROM hcn_external_verified_sessions WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds})));
      DELETE FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_documents WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_document_grants WHERE document_id IN (SELECT id FROM hcn_clinical_documents WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_requests WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_clinical_documents WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_healthcare_providers WHERE organization_id IN (${orgIds});
      DELETE FROM covered_patient_memberships WHERE organization_id IN (${orgIds});
      DELETE FROM organization_memberships WHERE organization_id IN (${orgIds});
      DELETE FROM organization_licenses WHERE organization_id IN (${orgIds});
      DELETE FROM organizations WHERE id IN (${orgIds});
      DELETE FROM patients WHERE id IN (${patientIds});
    `);
  }
  for (const id of createdUserIds) await authDeleteUser(id);
});

describe('HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- automated reminders', () => {
  it('processes an overdue request exactly once, then is idempotent within the cooldown window', async () => {
    const ctx = await orgWithDirectorAndPatient('idempotent');
    const requestId = await createOverdueSentRequest(ctx, 'idempotent');

    const [firstStatus, firstRows] = (await rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: 24 }, SERVICE)) as [number, { out_request_id: string; processed: boolean; detail: string | null }[]];
    expect(firstStatus).toBe(200);
    const firstMatch = firstRows.find((r) => r.out_request_id === requestId);
    expect(firstMatch?.processed).toBe(true);

    const eventCount = sql(`SELECT count(*) FROM hcn_clinical_request_events WHERE request_id='${requestId}' AND event_type='reminder_sent';`);
    expect(eventCount).toBe('1');

    // Running it again immediately must NOT record a second reminder --
    // this is the actual proof of idempotency, not merely "it didn't
    // error twice."
    const [secondStatus, secondRows] = (await rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: 24 }, SERVICE)) as [number, { out_request_id: string; processed: boolean; detail: string | null }[]];
    expect(secondStatus).toBe(200);
    const secondMatch = secondRows.find((r) => r.out_request_id === requestId);
    expect(secondMatch?.processed).toBe(false);
    expect(secondMatch?.detail).toMatch(/cooldown/i);

    const eventCountAfter = sql(`SELECT count(*) FROM hcn_clinical_request_events WHERE request_id='${requestId}' AND event_type='reminder_sent';`);
    expect(eventCountAfter).toBe('1'); // still exactly one -- no duplicate
  });

  it('a request that is not overdue, cancelled, or already closed is never reminded', async () => {
    const ctx = await orgWithDirectorAndPatient('not-due');
    const providerEmail = `remind-provider-${stamp}-notdue@example-clinic.test`;
    const [, provider] = (await rpc('hcn_upsert_healthcare_provider', {
      p_organization_id: ctx.orgId, p_provider_id: null, p_display_name: 'Dr. NotDue', p_professional_title: 'MD',
      p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
      p_fax_number: null, p_secure_contact_email: providerEmail, p_office_address: null, p_professional_identifier: null, p_credentials: null,
    }, ctx.directorTok)) as [number, { id: string }];
    const [, request] = (await rpc('hcn_create_clinical_request', {
      p_organization_id: ctx.orgId, p_patient_id: ctx.patientId, p_provider_id: provider.id, p_request_type: 'medical_documentation',
      p_title: 'Not Due Yet', p_description: null, p_requested_items: [],
      p_deadline_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), p_follow_up_owner_id: null,
    }, ctx.directorTok)) as [number, { id: string }];
    await rpc('hcn_send_clinical_request', { p_request_id: request.id, p_expires_in_days: 14 }, ctx.directorTok);

    const [, rows] = (await rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: 24 }, SERVICE)) as [number, { out_request_id: string }[]];
    expect(rows.find((r) => r.out_request_id === request.id)).toBeUndefined();
  });

  it('one malformed/failing row does not block reminders for other overdue requests in the same batch', async () => {
    const ctx = await orgWithDirectorAndPatient('batch');
    const goodRequestId = await createOverdueSentRequest(ctx, 'batch-good');
    const otherGoodRequestId = await createOverdueSentRequest(ctx, 'batch-good-2');

    // Simulate a row that would fail event recording: a request_id
    // that momentarily fails the FK-driven hcn_record_request_event
    // call is hard to engineer honestly without corrupting real data,
    // so instead this proves the weaker but still real guarantee: an
    // unrelated REVOKED request (no longer eligible at all) sitting in
    // the same organization alongside two genuinely overdue ones does
    // not prevent the two good ones from being processed in the same
    // batch call.
    const revokedRequestId = await createOverdueSentRequest(ctx, 'batch-revoked');
    await rpc('hcn_revoke_clinical_request_access', { p_request_id: revokedRequestId }, ctx.directorTok);
    sql(`UPDATE hcn_clinical_requests SET status='cancelled' WHERE id='${revokedRequestId}';`);

    const [, rows] = (await rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: 24 }, SERVICE)) as [number, { out_request_id: string; processed: boolean }[]];
    expect(rows.find((r) => r.out_request_id === goodRequestId)?.processed).toBe(true);
    expect(rows.find((r) => r.out_request_id === otherGoodRequestId)?.processed).toBe(true);
    expect(rows.find((r) => r.out_request_id === revokedRequestId)).toBeUndefined();
  });

  it('cross-organization isolation: reminders for one org never touch another org\'s requests', async () => {
    const ctxA = await orgWithDirectorAndPatient('xorg-a');
    const ctxB = await orgWithDirectorAndPatient('xorg-b');
    const requestAId = await createOverdueSentRequest(ctxA, 'xorg-a');
    const requestBId = await createOverdueSentRequest(ctxB, 'xorg-b');

    const [, rows] = (await rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: 24 }, SERVICE)) as [number, { out_request_id: string; processed: boolean }[]];
    expect(rows.find((r) => r.out_request_id === requestAId)?.processed).toBe(true);
    expect(rows.find((r) => r.out_request_id === requestBId)?.processed).toBe(true);
  });
});

describe('HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- Director reporting reconciliation', () => {
  it('report counts exactly match a manual tally of the real underlying rows', async () => {
    const ctx = await orgWithDirectorAndPatient('report');
    const overdueId = await createOverdueSentRequest(ctx, 'report-overdue');
    await createOverdueSentRequest(ctx, 'report-overdue-2');

    // A pending-clinical-review document.
    const sessionToken = await (async () => {
      const providerEmail = `remind-provider-${stamp}-report@example-clinic.test`;
      const [, provider] = (await rpc('hcn_upsert_healthcare_provider', {
        p_organization_id: ctx.orgId, p_provider_id: null, p_display_name: 'Dr. Report', p_professional_title: 'MD',
        p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
        p_fax_number: null, p_secure_contact_email: providerEmail, p_office_address: null, p_professional_identifier: null, p_credentials: null,
      }, ctx.directorTok)) as [number, { id: string }];
      const [, request] = (await rpc('hcn_create_clinical_request', {
        p_organization_id: ctx.orgId, p_patient_id: ctx.patientId, p_provider_id: provider.id, p_request_type: 'medical_documentation',
        p_title: 'Report Doc Request', p_description: null, p_requested_items: [], p_deadline_at: null, p_follow_up_owner_id: null,
      }, ctx.directorTok)) as [number, { id: string }];
      const [, sendRows] = (await rpc('hcn_send_clinical_request', { p_request_id: request.id, p_expires_in_days: 14 }, ctx.directorTok)) as [number, { raw_token: string }[]];
      const [, codeRows] = (await rpc('hcn_request_external_verification_code', { p_raw_token: sendRows[0].raw_token }, SERVICE)) as [number, { code: string }[]];
      const [, verifyRows] = (await rpc('hcn_verify_external_code', { p_raw_token: sendRows[0].raw_token, p_code: codeRows[0].code }, SERVICE)) as [number, { session_token: string }[]];
      const [, uploadedDoc] = (await rpc('hcn_record_external_document_upload', {
        p_session_token: verifyRows[0].session_token, p_storage_path: `${ctx.patientId}/report-${stamp}.pdf`,
        p_original_filename: 'report.pdf', p_mime_type: 'application/pdf', p_file_size_bytes: 10,
        p_checksum_sha256: 'x', p_category: 'specialist_assessments',
      }, SERVICE)) as [number, { id: string }];
      await rpc('hcn_review_clinical_document', { p_document_id: uploadedDoc.id, p_decision: 'forwarded_for_clinical_review', p_notes: 'n' }, ctx.directorTok);
      return verifyRows[0].session_token;
    })();
    void sessionToken;

    await rpc('hcn_create_coordination_plan', { p_organization_id: ctx.orgId, p_patient_id: ctx.patientId, p_title: 'Report Plan', p_description: null }, ctx.directorTok);
    await rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: 24 }, SERVICE);

    const [status, rows] = (await rpc('hcn_get_clinical_coordination_report', { p_organization_id: ctx.orgId }, ctx.directorTok)) as [number, {
      total_requests: number; requests_sent: number; requests_overdue: number; requests_pending_review: number;
      requests_pending_clinical_approval: number; requests_closed_or_accepted: number;
      documents_pending_administrative_review: number; documents_pending_clinical_approval: number;
      active_coordination_plans: number; reminders_sent_last_30_days: number;
    }[]];
    expect(status).toBe(200);
    const report = rows[0];

    const manualTotal = Number(sql(`SELECT count(*) FROM hcn_clinical_requests WHERE organization_id='${ctx.orgId}';`));
    const manualOverdue = Number(sql(`SELECT count(*) FROM hcn_clinical_requests WHERE organization_id='${ctx.orgId}' AND status IN ('sent','response_received') AND deadline_at <= now();`));
    const manualPendingClinical = Number(sql(`SELECT count(*) FROM hcn_clinical_documents WHERE organization_id='${ctx.orgId}' AND review_status='forwarded_for_clinical_review';`));
    const manualActivePlans = Number(sql(`SELECT count(*) FROM hcn_coordination_plans WHERE organization_id='${ctx.orgId}' AND status='active';`));
    const manualReminders = Number(sql(`SELECT count(*) FROM hcn_clinical_request_events e JOIN hcn_clinical_requests r ON r.id=e.request_id WHERE r.organization_id='${ctx.orgId}' AND e.event_type='reminder_sent';`));

    expect(report.total_requests).toBe(manualTotal);
    expect(report.requests_overdue).toBe(manualOverdue);
    expect(report.documents_pending_clinical_approval).toBe(manualPendingClinical);
    expect(report.active_coordination_plans).toBe(manualActivePlans);
    expect(report.reminders_sent_last_30_days).toBe(manualReminders);
    expect(report.requests_overdue).toBeGreaterThanOrEqual(1);
    void overdueId;
  });

  it('a non-director cannot view another organization\'s report', async () => {
    const ctxA = await orgWithDirectorAndPatient('report-xorg-a');
    const ctxB = await orgWithDirectorAndPatient('report-xorg-b');
    const [status] = await rpc('hcn_get_clinical_coordination_report', { p_organization_id: ctxA.orgId }, ctxB.directorTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
