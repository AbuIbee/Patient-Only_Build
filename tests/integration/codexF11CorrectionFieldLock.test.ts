// CODEX F-11 (P1, release-blocking) — "Corrections overwrite
// reviewed evidence." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 127.
//
// DirectorApplicationWizard.tsx disables every fieldset not named in
// correction.allowedSteps client-side -- but resubmit_application()
// itself never enforced that boundary server-side. A direct RPC call
// (bypassing the UI entirely) could change the applicant's legal
// name/contact email/phone/title even when only an unrelated step was
// reopened for correction. Reproduced here via a direct RPC call,
// never through the UI.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, validDirectorApplicationDetails } from './_runtime';

const PW = 'CodexF11Fix9!';
const stamp = Date.now();

const emails = { owner: `f11-owner-${stamp}@local.test` };
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const allApplicantIds: string[] = [];
let n = 0;

async function freshApplicant(): Promise<{ id: string; email: string; token: string }> {
  n += 1;
  const email = `f11-applicant-${stamp}-${n}@local.test`;
  const id = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
  const token = await login(email, PW);
  allApplicantIds.push(id);
  return { id, email, token };
}

beforeAll(async () => {
  ids.owner = await authSignUp(emails.owner, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete', role='admin' WHERE id='${ids.owner}';`);
  tok.owner = await login(emails.owner, PW);
}, 30000);

afterAll(async () => {
  const applicantFilter = allApplicantIds.length ? allApplicantIds.map((i) => `'${i}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN (${applicantFilter}));
    DELETE FROM professional_applications WHERE applicant_user_id IN (${applicantFilter});
  `);
  for (const id of [...allApplicantIds, ids.owner]) await authDeleteUser(id);
});

const fullDetails = (fullLegalName: string, email: string) => validDirectorApplicationDetails({ fullLegalName, verifiedBusinessEmail: email });

async function submitDirectorApp(applicant: { email: string; token: string }, orgName: string): Promise<{ id: string }> {
  const [, app] = (await rpc('submit_professional_application', {
    p_requested_office: 'director', p_target_organization_id: null,
    p_proposed_organization_name: orgName, p_proposed_package_type: 'integrated_care',
    p_legal_name: 'Original Name', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: '555-0001',
    p_professional_title: 'Founder', p_profession_category: null,
    p_application_details: fullDetails('Original Name', applicant.email), p_draft_id: null,
  }, applicant.token)) as [number, { id: string }];
  return app;
}

describe('CODEX F-11 FIX (migration 127) — the correction-reopened-step boundary is server-enforced', () => {
  it('FIX: when only step1 is reopened, a direct RPC call changing legal_name/contact fields (step2) is rejected', async () => {
    const applicant = await freshApplicant();
    const app = await submitDirectorApp(applicant, `F11 Step1Only Org ${stamp}`);
    await rpc('request_application_corrections', {
      p_application_id: app.id, p_correction_request: 'Fix your registered address', p_correction_fields: { allowedSteps: ['step1'] },
    }, tok.owner);

    const [status, body] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'FORGED NAME', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: '555-0001',
      p_professional_title: 'Founder', p_profession_category: null, p_application_details: {},
    }, applicant.token);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('Founding Director step was not reopened');
    expect(sql(`SELECT legal_name FROM professional_applications WHERE id='${app.id}';`)).toBe('Original Name');
  });

  it('FIX: the same applies to contact_phone and professional_title individually, not just legal_name', async () => {
    const applicant = await freshApplicant();
    const app = await submitDirectorApp(applicant, `F11 Step1Only Phone Org ${stamp}`);
    await rpc('request_application_corrections', {
      p_application_id: app.id, p_correction_request: 'Fix your registered address', p_correction_fields: { allowedSteps: ['step1'] },
    }, tok.owner);

    const [phoneStatus] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Original Name', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: '555-9999',
      p_professional_title: 'Founder', p_profession_category: null, p_application_details: {},
    }, applicant.token);
    expect(phoneStatus).toBe(400);

    const [titleStatus] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Original Name', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: '555-0001',
      p_professional_title: 'FORGED TITLE', p_profession_category: null, p_application_details: {},
    }, applicant.token);
    expect(titleStatus).toBe(400);
  });

  it('regression guard: when step2 IS reopened, legal_name/contact fields can be legitimately corrected', async () => {
    const applicant = await freshApplicant();
    const app = await submitDirectorApp(applicant, `F11 Step2Allowed Org ${stamp}`);
    await rpc('request_application_corrections', {
      p_application_id: app.id, p_correction_request: 'Your legal name does not match your ID', p_correction_fields: { allowedSteps: ['step2'] },
    }, tok.owner);

    const [status, body] = (await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Corrected Legal Name', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: '555-0001',
      p_professional_title: 'Founder', p_profession_category: null, p_application_details: fullDetails('Corrected Legal Name', applicant.email),
    }, applicant.token)) as [number, { legal_name: string; status: string }];
    expect(status).toBe(200);
    expect(body.legal_name).toBe('Corrected Legal Name');
    expect(body.status).toBe('resubmitted');
  });

  it('regression guard: when no correction_fields were ever recorded (legacy/unspecified), identity fields can still be changed -- back-compat, not a new restriction where none existed', async () => {
    const applicant = await freshApplicant();
    const app = await submitDirectorApp(applicant, `F11 NoFieldsOrg ${stamp}`);
    sql(`UPDATE professional_applications SET status='info_required', correction_requested_fields=NULL WHERE id='${app.id}';`);

    const [status, body] = (await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Changed Without Restriction', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: '555-0001',
      p_professional_title: 'Founder', p_profession_category: null, p_application_details: fullDetails('Changed Without Restriction', applicant.email),
    }, applicant.token)) as [number, { legal_name: string }];
    expect(status).toBe(200);
    expect(body.legal_name).toBe('Changed Without Restriction');
  });
});
