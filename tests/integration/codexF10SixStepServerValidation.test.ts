// CODEX F-10 (P1, release-blocking) — "Six-step application is not
// validated on the server." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, finding F-10;
// closed in migration 130 per MMA-ENT-SALES-009 Workstream C §18.
//
// DirectorApplicationWizard.tsx (D1-D6) enforces required/conditional
// fields and the three mandatory step-6 attestations only via its own
// client-side `canSubmit`/`required` markers. These tests call
// submit_professional_application()/resubmit_application() DIRECTLY,
// bypassing the wizard entirely, proving the server itself now rejects
// an incomplete or malformed six-step payload -- not merely that the
// UI happens to prevent one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, validDirectorApplicationDetails } from './_runtime';

const PW = 'CodexF10Fix9!';
const stamp = Date.now();
let n = 0;
const allApplicantIds: string[] = [];
let ownerToken: string;

beforeAll(async () => {
  const ownerEmail = `f10-owner-${stamp}@local.test`;
  const ownerId = await authSignUp(ownerEmail, PW);
  allApplicantIds.push(ownerId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete', role='admin' WHERE id='${ownerId}';`);
  ownerToken = await login(ownerEmail, PW);
}, 30000);

async function freshApplicant(): Promise<{ id: string; email: string; token: string }> {
  n += 1;
  const email = `f10-applicant-${stamp}-${n}@local.test`;
  const id = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
  const token = await login(email, PW);
  allApplicantIds.push(id);
  return { id, email, token };
}

function submitDirector(applicant: { email: string; token: string }, details: unknown) {
  return rpc('submit_professional_application', {
    p_requested_office: 'director', p_target_organization_id: null,
    p_proposed_organization_name: `F10 Org ${stamp}-${n}`, p_proposed_package_type: 'integrated_care',
    p_legal_name: 'F10 Applicant', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
    p_professional_title: null, p_profession_category: null,
    p_application_details: details, p_draft_id: null,
  }, applicant.token);
}

afterAll(async () => {
  const filter = allApplicantIds.length ? allApplicantIds.map((i) => `'${i}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN (${filter}));
    DELETE FROM professional_applications WHERE applicant_user_id IN (${filter});
  `);
  for (const id of allApplicantIds) await authDeleteUser(id);
});

describe('CODEX F-10 FIX (migration 130) — six-step Director application is validated server-side', () => {
  it('FIX: a direct RPC call carrying a six-step-shaped payload that omits nearly every required field is rejected, not merely UI-prevented', async () => {
    const applicant = await freshApplicant();
    const [status, body] = await submitDirector(applicant, { step1: {} });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('Registered legal business name is required');
  });

  it("regression guard: create_organization()'s separate, pre-existing quick-create path (no step1..step6 keys at all) is correctly NOT subjected to six-step validation", async () => {
    const applicant = await freshApplicant();
    const [status] = await submitDirector(applicant, {});
    expect(status).toBe(200);
  });

  it('FIX: step6 mandatory attestations cannot be omitted by a direct RPC call even when every other step is complete', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [status, body] = await submitDirector(applicant, { ...full, step6: { accuracyAttestation: false, authorizedSignatoryConfirmed: true, privacyAck: true, signatureName: 'F10 Applicant' } });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('accuracy attestation is required');
  });

  it('FIX: a malformed Director email is rejected by format, independent of step1\'s own business email', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [status, body] = await submitDirector(applicant, { ...full, step2: { ...full.step2, verifiedBusinessEmail: 'not-an-email' } });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('valid Director business email is required');
  });

  it('FIX: a Director email that does not match the authoritative contact_email column is rejected (cross-field consistency)', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [status, body] = await submitDirector(applicant, { ...full, step2: { ...full.step2, verifiedBusinessEmail: `different-${applicant.email}` } });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('does not match the application\'s contact email');
  });

  it('FIX: when PHI processing is declared "yes", the conditional privacy/security/BAA-signatory fields become mandatory', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [status, body] = await submitDirector(applicant, {
      ...full,
      step4: { ...full.step4, phiIntendedUse: 'yes', privacyContact: '', securityContact: '', baaSignatory: '' },
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('privacy contact is required');
  });

  it('regression guard: when PHI processing is declared "no", the same privacy/security/BAA fields are correctly NOT required (conditional distinction preserved)', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [status] = await submitDirector(applicant, {
      ...full,
      step4: { ...full.step4, phiIntendedUse: 'no', hipaaDeclaration: 'not_applicable', privacyContact: '', securityContact: '', baaSignatory: '' },
    });
    expect(status).toBe(200);
  });

  it('regression guard: a complete, valid six-step payload submits successfully and receives a stable human-readable application_reference', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [status, app] = (await submitDirector(applicant, full)) as [number, { id: string; application_reference: string }];
    expect(status).toBe(200);
    expect(app.application_reference).toMatch(/^APP-\d{4}-\d{6}$/);
    const dbRef = sql(`SELECT application_reference FROM professional_applications WHERE id='${app.id}';`);
    expect(dbRef).toBe(app.application_reference);
  });

  it('BUGFIX (found during F-10 re-verification): resubmitting an application whose contact_phone/professional_title were NULL (e.g. create_organization()-originated) does not falsely trip the step2 lock when step2 itself is unchanged', async () => {
    const applicant = await freshApplicant();
    const [, app] = (await rpc('create_organization', { p_name: `F10 Quick Org ${stamp}`, p_package_type: 'integrated_care' }, applicant.token)) as [number, { id: string; legal_name: string; contact_phone: string | null; professional_title: string | null }];
    expect(app.contact_phone).toBeNull();
    expect(app.professional_title).toBeNull();

    await rpc('request_application_corrections', {
      p_application_id: app.id, p_correction_request: 'Please add your business details', p_correction_fields: { allowedSteps: ['step1'] },
    }, ownerToken);

    // Resubmit with contact_phone/professional_title left exactly as
    // NULL (unchanged, matching the stored row) -- must succeed, not
    // be treated as a tampered step2.
    const [status, body] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: app.legal_name, p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: {},
    }, applicant.token);
    expect(status, JSON.stringify(body)).toBe(200);
  });

  it('FIX: resubmit_application() re-validates the full six-step payload, not just the five legacy top-level columns', async () => {
    const applicant = await freshApplicant();
    const full = validDirectorApplicationDetails({ fullLegalName: 'F10 Applicant', verifiedBusinessEmail: applicant.email });
    const [, app] = (await submitDirector(applicant, full)) as [number, { id: string }];
    sql(`UPDATE professional_applications SET status='info_required' WHERE id='${app.id}';`);

    const [status, body] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'F10 Applicant', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: { ...full, step5: { ...full.step5, billingEmail: 'not-an-email' } },
    }, applicant.token);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('valid billing email is required');
  });
});
