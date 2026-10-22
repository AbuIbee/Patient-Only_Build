// MASTER ENTERPRISE COMPLETION DIRECTIVE §1.C — Professional credential
// verification. DEFECT-CREDENTIAL-VERIFICATION-STATUS-NEVER-ENFORCED
// (CONFIRMED, fixed by migration 089): professional_applications.
// credential_verification_status existed since migration 083 with a
// rich CHECK constraint but was never read, written, or gated on by
// any RPC — an application could reach status='approved' (full active
// membership, full privileges) with its credential still at the
// default 'submitted' value, genuinely unverified.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'CredentialGate9!';
const stamp = Date.now();
const ORG = 'c0111111-1111-4111-8111-111111111111';

const emails = {
  director: `cvg-director-${stamp}@local.test`,
  applicant: `cvg-applicant-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let applicationId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) {
    ids[name] = await authSignUp(email, PW);
  }
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','CVG Integration Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  const [, app] = (await rpc('submit_professional_application', {
    p_requested_office: 'caregiver', p_target_organization_id: ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
    p_legal_name: 'CVG Applicant', p_preferred_name: null, p_contact_email: emails.applicant, p_contact_phone: null,
    p_professional_title: 'Caregiver', p_profession_category: 'caregiver', p_application_details: {},
  }, tok.applicant)) as [number, { id: string }];
  applicationId = app.id;
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM public.account_management_audit WHERE organization_id='${ORG}';
    DELETE FROM public.professional_application_events WHERE application_id='${applicationId}';
    DELETE FROM public.professional_applications WHERE id='${applicationId}';
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('Credential verification gate (migration 089)', () => {
  it('a brand-new application starts credential_verification_status=submitted, never independently_verified', () => {
    const status = sql(`SELECT credential_verification_status FROM professional_applications WHERE id='${applicationId}';`);
    expect(status).toBe('submitted');
  });

  it('director_approve_application() is REJECTED while the credential is not independently verified, even by a legitimate reviewing director', async () => {
    const [status, body] = (await rpc('director_approve_application', { p_application_id: applicationId }, tok.director)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('independently verified');

    const membershipCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.applicant}';`);
    expect(membershipCount).toBe('0'); // no privileges granted — the unverified applicant has zero org membership
  });

  it('a non-director (including the applicant themselves) cannot record a credential verification decision', async () => {
    const [status, body] = (await rpc('record_credential_verification', { p_application_id: applicationId, p_decision: 'independently_verified', p_evidence_reference: 'self-attested' }, tok.applicant)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('Only an active director');
  });

  it('an evidence reference is mandatory — a bare decision with no description of what was checked is rejected', async () => {
    const [status, body] = (await rpc('record_credential_verification', { p_application_id: applicationId, p_decision: 'independently_verified', p_evidence_reference: '' }, tok.director)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('evidence reference');
  });

  it('the reviewing director CAN record an independently_verified decision, with reviewer identity, timestamp, and evidence preserved', async () => {
    const [status, body] = (await rpc('record_credential_verification', {
      p_application_id: applicationId, p_decision: 'independently_verified', p_evidence_reference: 'Confirmed caregiver certification number against state registry lookup, ref #CVG-TEST-001',
    }, tok.director)) as [number, { credential_verification_status: string; credential_verified_by: string; credential_verified_at: string | null; credential_verification_evidence: string }];
    expect(status).toBe(200);
    expect(body.credential_verification_status).toBe('independently_verified');
    expect(body.credential_verified_by).toBe(ids.director);
    expect(body.credential_verified_at).toBeTruthy();
    expect(body.credential_verification_evidence).toContain('state registry lookup');

    const eventType = sql(`SELECT event_type FROM professional_application_events WHERE application_id='${applicationId}' AND event_type='credential_verification_recorded';`);
    expect(eventType).toBe('credential_verification_recorded');
  });

  it('director_approve_application() now SUCCEEDS, since the credential has been independently verified', async () => {
    const [status, body] = (await rpc('director_approve_application', { p_application_id: applicationId }, tok.director)) as [number, { status: string }];
    expect(status).toBe(200);
    expect(body.status).toBe('approved');
    const membership = sql(`SELECT org_role, status FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.applicant}';`);
    expect(membership).toBe('caregiver|active');
  });

  // Codex MMA-CODEX-02 — "invalidate affected authority when evidence
  // is changed, rejected, expired... or revoked." The applicant is now
  // an active member (previous test). Flagging the SAME, already-
  // approved application's credential as requires_reverification must
  // revoke that real authority, not just update a column.
  it('migration 091: flagging an ALREADY-APPROVED application for reverification immediately revokes the real organization membership it granted', async () => {
    const before = sql(`SELECT status FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.applicant}';`);
    expect(before).toBe('active');

    const [status, body] = (await rpc('record_credential_verification', {
      p_application_id: applicationId, p_decision: 'requires_reverification', p_evidence_reference: 'New information surfaced — re-checking the original license number against the state registry.',
    }, tok.director)) as [number, { credential_verification_status: string }];
    expect(status).toBe(200);
    expect(body.credential_verification_status).toBe('requires_reverification');

    const after = sql(`SELECT status FROM organization_memberships WHERE organization_id='${ORG}' AND user_id='${ids.applicant}';`);
    expect(after).toBe('revoked');
    const assignmentActive = sql(`SELECT count(*) FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.applicant}' AND is_active=true;`);
    expect(assignmentActive).toBe('0');

    const auditType = sql(`SELECT action_type FROM account_management_audit WHERE target_user_id='${ids.applicant}' AND action_type='membership_revoked_credential_invalidated';`);
    expect(auditType).toBe('membership_revoked_credential_invalidated');
  });

  it('a Director application has no clinical credential to verify — record_credential_verification() refuses to apply to one', async () => {
    const freshEmail = `cvg-freshdirector-${stamp}@local.test`;
    const freshId = await authSignUp(freshEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${freshId}';`);
    const freshTok = await login(freshEmail, PW);

    const [createStatus] = await rpc('create_organization', { p_name: 'CVG Rogue Org', p_package_type: 'integrated_care' }, freshTok);
    expect(createStatus).toBe(200);
    const dirApp = sql(`SELECT id FROM professional_applications WHERE applicant_user_id='${freshId}' AND requested_office='director' ORDER BY created_at DESC LIMIT 1;`);
    const [status, body] = (await rpc('record_credential_verification', { p_application_id: dirApp, p_decision: 'independently_verified', p_evidence_reference: 'n/a' }, tok.director)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('no clinical credential');

    sql(`DELETE FROM professional_application_events WHERE application_id='${dirApp}'; DELETE FROM professional_applications WHERE id='${dirApp}';`);
    await authDeleteUser(freshId);
  });
});
