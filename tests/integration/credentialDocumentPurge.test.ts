// Codex MMA-CODEX-16 — Document Storage hygiene gap (b). Reproduces the
// exact gap migration 101 closes at the RPC/database level:
// professional_application_documents' ON DELETE CASCADE never fires
// (applications are status-transitioned, never deleted), and no code
// path ever removed a rejected/withdrawn application's document
// metadata rows. withdraw_application()/reject_application() now purge
// them in the same transaction as the status change.
//
// The OTHER half of this fix -- actually removing the underlying
// storage.objects bytes -- could not be done inside the RPC: a direct
// `DELETE FROM storage.objects` is blocked by Supabase Storage's own
// protective trigger even from a SECURITY DEFINER function (confirmed
// live: 42501, "Direct deletion from storage tables is not allowed. Use
// the Storage API instead."). That half is implemented client-side in
// professionalApplicationService.ts's withdrawApplication()/
// rejectApplication() (supabase.storage...remove(), called with the
// paths fetched BEFORE the RPC since the RPC deletes their metadata
// row) and is covered by a unit test there
// (tests/unit/professionalApplicationServiceStorageCleanup.test.ts),
// not here -- this file only has real REST/RPC access, not the
// Storage API's own auth path, and bypasses the client service layer
// entirely by design (it calls the RPC directly).
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'DocPurge9!';
const stamp = Date.now();
const ORG = 'c0555555-5555-4555-8555-555555555555';

const emails = {
  director: `dpg-director-${stamp}@local.test`,
  withdrawer: `dpg-withdrawer-${stamp}@local.test`,
  rejectee: `dpg-rejectee-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','DPG Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

async function submitApplicationWithDocument(applicantToken: string, email: string): Promise<{ appId: string; storagePath: string }> {
  const [, app] = (await rpc('submit_professional_application', {
    p_requested_office: 'caregiver', p_target_organization_id: ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
    p_legal_name: 'DPG Applicant', p_preferred_name: null, p_contact_email: email, p_contact_phone: null,
    p_professional_title: 'Caregiver', p_profession_category: 'caregiver', p_application_details: {},
  }, applicantToken)) as [number, { id: string }];
  const storagePath = `${app.id}/credential_document/${Date.now()}_test.pdf`;
  sql(`
    INSERT INTO professional_application_documents (application_id, document_type, file_name, storage_path)
      VALUES ('${app.id}', 'credential_document', 'test.pdf', '${storagePath}');
  `);
  return { appId: app.id, storagePath };
}

describe('Codex MMA-CODEX-16 — withdraw_application()/reject_application() purge the document metadata row on a terminal decision (migration 101)', () => {
  it('withdrawing an application deletes the document metadata row', async () => {
    const { appId } = await submitApplicationWithDocument(tok.withdrawer, emails.withdrawer);
    expect(sql(`SELECT count(*) FROM professional_application_documents WHERE application_id='${appId}';`)).toBe('1');

    const [status] = await rpc('withdraw_application', { p_application_id: appId }, tok.withdrawer);
    expect(status).toBe(200);

    expect(sql(`SELECT count(*) FROM professional_application_documents WHERE application_id='${appId}';`)).toBe('0');
    expect(sql(`SELECT status FROM professional_applications WHERE id='${appId}';`)).toBe('withdrawn');
  });

  it('a director rejecting an application deletes the document metadata row', async () => {
    const { appId } = await submitApplicationWithDocument(tok.rejectee, emails.rejectee);
    expect(sql(`SELECT count(*) FROM professional_application_documents WHERE application_id='${appId}';`)).toBe('1');

    const [status] = await rpc('reject_application', { p_application_id: appId, p_rejection_reason: 'test rejection' }, tok.director);
    expect(status).toBe(200);

    expect(sql(`SELECT count(*) FROM professional_application_documents WHERE application_id='${appId}';`)).toBe('0');
    expect(sql(`SELECT status FROM professional_applications WHERE id='${appId}';`)).toBe('rejected');

    // The durable audit trail survives: the event log still records that
    // a document-bearing application was reviewed and rejected, even
    // though the document metadata row itself is now gone.
    expect(sql(`SELECT count(*) FROM professional_application_events WHERE application_id='${appId}' AND event_type='rejected';`)).toBe('1');
  });
});
