// CODEX F-03 (P1, release-blocking) — "Quote ownership, locking and
// consumption are untrusted." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 122.
//
// Each test uses its own freshly-signed-up applicant(s) -- submitting
// one application already puts an applicant "under review" (the
// existing EXISTS guard in both save_application_draft() and
// submit_professional_application()), which would otherwise block
// every subsequent test sharing one fixed applicant account.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, validDirectorApplicationDetails } from './_runtime';

const PW = 'CodexF03Fix9!';
const stamp = Date.now();
let n = 0;

const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const allApplicantIds: string[] = [];

async function freshApplicant(): Promise<{ id: string; email: string; token: string }> {
  n += 1;
  const email = `f03-applicant-${stamp}-${n}@local.test`;
  const id = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
  const token = await login(email, PW);
  allApplicantIds.push(id);
  return { id, email, token };
}

async function makeSentQuote(orgName: string, fee: number, packageType: 'integrated_care' | 'therapist' = 'integrated_care'): Promise<string> {
  const [, prospect] = (await rpc('platform_owner_create_prospect', {
    p_contact_name: 'F03 Test', p_contact_email: `f03-contact-${stamp}-${Math.random()}@local.test`, p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null,
  }, tok.owner)) as [number, { id: string }];
  const [, quote] = (await rpc('platform_owner_create_quote', {
    p_prospect_id: prospect.id, p_package_type: packageType, p_proposed_licensed_seats: 4,
    p_proposed_covered_patient_capacity: 20, p_annual_license_fee: fee, p_billing_cadence: 'annual',
    p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  return quote.id;
}

beforeAll(async () => {
  const ownerEmail = `f03-owner-${stamp}@local.test`;
  ids.owner = await authSignUp(ownerEmail, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete', role='admin' WHERE id='${ids.owner}';`);
  tok.owner = await login(ownerEmail, PW);
}, 30000);

afterAll(async () => {
  const applicantFilter = allApplicantIds.length ? allApplicantIds.map((i) => `'${i}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN (${applicantFilter}));
    DELETE FROM professional_applications WHERE applicant_user_id IN (${applicantFilter});
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of [...allApplicantIds, ids.owner]) await authDeleteUser(id);
});

describe('CODEX F-03 FIX (migration 122) — quote ownership, locking and consumption', () => {
  it('FIX: submitting a draft with a tampered proposed_organization_name/package is ignored -- the server re-derives both from the live quote', async () => {
    const applicant = await freshApplicant();
    const quoteId = await makeSentQuote(`F03 Tamper Org ${stamp}`, 12000, 'integrated_care');
    await rpc('save_application_draft', {
      p_requested_office: 'director', p_proposed_organization_name: 'Whatever The Draft Said', p_proposed_package_type: 'integrated_care',
      p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: { originatingQuoteId: quoteId },
    }, applicant.token);
    const [, draftRows] = (await rpc('get_my_application_draft', {}, applicant.token)) as [number, { id: string }[]];
    const draftId = draftRows[0]!.id;

    const [status, app] = (await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'TAMPERED NAME', p_proposed_package_type: 'therapist',
      p_legal_name: 'Applicant One', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: validDirectorApplicationDetails({ fullLegalName: 'Applicant One', verifiedBusinessEmail: applicant.email, originatingQuoteId: quoteId }), p_draft_id: draftId,
    }, applicant.token)) as [number, { proposed_organization_name: string; proposed_package_type: string }];
    expect(status).toBe(200);
    expect(app.proposed_organization_name).toBe(`F03 Tamper Org ${stamp}`);
    expect(app.proposed_package_type).toBe('integrated_care');
  });

  it('FIX: submit cannot redirect a draft\'s originatingQuoteId to a DIFFERENT quote', async () => {
    const applicant = await freshApplicant();
    const quoteId1 = await makeSentQuote(`F03 Redirect Org A ${stamp}`, 5000);
    const quoteId2 = await makeSentQuote(`F03 Redirect Org B ${stamp}`, 50000);
    await rpc('save_application_draft', {
      p_requested_office: 'director', p_proposed_organization_name: null, p_proposed_package_type: 'integrated_care',
      p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: { originatingQuoteId: quoteId1 },
    }, applicant.token);
    const [, draftRows] = (await rpc('get_my_application_draft', {}, applicant.token)) as [number, { id: string }[]];
    const draftId = draftRows[0]!.id;

    const [status, body] = await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'x', p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Applicant One', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: { originatingQuoteId: quoteId2 }, p_draft_id: draftId,
    }, applicant.token);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('originating quote cannot be changed');
  });

  it('FIX: one commercial issuance -- a second, different applicant cannot attach a second live application to a quote already claimed by a live application', async () => {
    const applicantA = await freshApplicant();
    const applicantB = await freshApplicant();
    const quoteId = await makeSentQuote(`F03 One Issuance Org ${stamp}`, 8000);
    const [status1, app1] = (await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'x', p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Applicant A', p_preferred_name: null, p_contact_email: applicantA.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: validDirectorApplicationDetails({ fullLegalName: 'Applicant A', verifiedBusinessEmail: applicantA.email, originatingQuoteId: quoteId }), p_draft_id: null,
    }, applicantA.token)) as [number, { id: string }];
    expect(status1).toBe(200);

    const [status2] = await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'x', p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Applicant B', p_preferred_name: null, p_contact_email: applicantB.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: validDirectorApplicationDetails({ fullLegalName: 'Applicant B', verifiedBusinessEmail: applicantB.email, originatingQuoteId: quoteId }), p_draft_id: null,
    }, applicantB.token);
    expect(status2).toBe(409);

    // Withdrawing the first application frees the quote for genuine reuse.
    await rpc('withdraw_application', { p_application_id: app1.id }, applicantA.token);
    const [status3] = await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'x', p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Applicant B', p_preferred_name: null, p_contact_email: applicantB.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: validDirectorApplicationDetails({ fullLegalName: 'Applicant B', verifiedBusinessEmail: applicantB.email, originatingQuoteId: quoteId }), p_draft_id: null,
    }, applicantB.token);
    expect(status3).toBe(200);
  });

  it('FIX: a submission is rejected if the referenced quote is no longer "sent" (expired/revoked/superseded) even though a draft was saved while it still was', async () => {
    const applicant = await freshApplicant();
    const quoteId = await makeSentQuote(`F03 Revoked Org ${stamp}`, 9000);
    await rpc('save_application_draft', {
      p_requested_office: 'director', p_proposed_organization_name: null, p_proposed_package_type: 'integrated_care',
      p_legal_name: null, p_preferred_name: null, p_contact_email: null, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: { originatingQuoteId: quoteId },
    }, applicant.token);
    const [, draftRows] = (await rpc('get_my_application_draft', {}, applicant.token)) as [number, { id: string }[]];
    const draftId = draftRows[0]!.id;

    sql(`UPDATE sales_quotes SET status='revoked' WHERE id='${quoteId}';`);

    const [status, body] = await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'x', p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Applicant One', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: { originatingQuoteId: quoteId }, p_draft_id: draftId,
    }, applicant.token);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('no longer available');
  });

  it('FIX: resubmit_application() cannot redirect originatingQuoteId to a different quote, and still re-derives org name/package from the (unchanged) quote', async () => {
    const applicant = await freshApplicant();
    const quoteId = await makeSentQuote(`F03 Resubmit Org ${stamp}`, 11000, 'integrated_care');
    const fullDetails = validDirectorApplicationDetails({ fullLegalName: 'Applicant One', verifiedBusinessEmail: applicant.email, originatingQuoteId: quoteId });
    const [, app] = (await rpc('submit_professional_application', {
      p_requested_office: 'director', p_target_organization_id: null,
      p_proposed_organization_name: 'x', p_proposed_package_type: 'integrated_care',
      p_legal_name: 'Applicant One', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: fullDetails, p_draft_id: null,
    }, applicant.token)) as [number, { id: string }];

    await rpc('request_application_corrections', {
      p_application_id: app.id, p_correction_request: 'Fix your address', p_correction_fields: { allowedSteps: ['step1'] },
    }, tok.owner);

    const otherQuoteId = await makeSentQuote(`F03 Resubmit Other Org ${stamp}`, 99000);
    const [redirectStatus, redirectBody] = await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Applicant One', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null, p_application_details: { ...fullDetails, originatingQuoteId: otherQuoteId },
    }, applicant.token);
    expect(redirectStatus).toBe(400);
    expect(JSON.stringify(redirectBody)).toContain('originating quote cannot be changed');

    // CODEX F-11 fix (migration 127): only step1 was reopened for
    // correction, so legal_name (a step2/"Founding Director" field)
    // must be resubmitted UNCHANGED -- this test's correction was
    // about the address (step1), not identity.
    const [okStatus, okApp] = (await rpc('resubmit_application', {
      p_application_id: app.id, p_legal_name: 'Applicant One', p_preferred_name: null, p_contact_email: applicant.email, p_contact_phone: null,
      p_professional_title: null, p_profession_category: null,
      p_application_details: { ...fullDetails, originatingQuoteId: quoteId, step1: { ...fullDetails.step1, note: 'fixed' } },
    }, applicant.token)) as [number, { proposed_organization_name: string; proposed_package_type: string; status: string }];
    expect(okStatus).toBe(200);
    expect(okApp.status).toBe('resubmitted');
    expect(okApp.proposed_organization_name).toBe(`F03 Resubmit Org ${stamp}`);
    expect(okApp.proposed_package_type).toBe('integrated_care');
  });
});
