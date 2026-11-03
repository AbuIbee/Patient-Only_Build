// HCN-ONBOARDING-PRODUCTION-001, Sections 1-2 -- proves the production
// dead end ("Application approved — agreements pending" / "Agreement
// signing is not yet available in this workspace") is closed for the
// Business Associate Agreement, and that the Haneen SaaS License
// Agreement is correctly, honestly BLOCKED rather than faked -- and
// that billing authorization cannot begin without both.
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'AgreementExec9!';
const stamp = Date.now();
const createdApplicantIds: string[] = [];
const createdOrgNames: string[] = [];

async function freshApplicant(): Promise<{ email: string; id: string; token: string }> {
  const email = `agreementexec-applicant-${stamp}-${createdApplicantIds.length}@local.test`;
  const id = await authSignUp(email, PW);
  createdApplicantIds.push(id);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${id}';`);
  const token = await login(email, PW);
  return { email, id, token };
}

function minimalDetails(opts: { fullLegalName: string; verifiedBusinessEmail: string; orgName: string }) {
  return {
    step1: {
      legalBusinessName: opts.orgName, legalForm: 'LLC', businessClassification: 'Home care agency',
      formationJurisdiction: 'Texas', registeredAddress: '100 Main St, Austin, TX', businessPhone: '512-555-0100',
      businessEmail: opts.verifiedBusinessEmail,
    },
    step2: {
      fullLegalName: opts.fullLegalName, verifiedBusinessEmail: opts.verifiedBusinessEmail, mobile: '512-555-0101',
      title: 'Founder', relationshipToEntity: 'Owner', authorizedSignatory: true, authorityAttestation: true,
    },
    step5: { billingContact: 'Billing Contact', billingAddress: '100 Main St, Austin, TX', billingEmail: opts.verifiedBusinessEmail },
    step6: { accuracyAttestation: true, authorizedSignatoryConfirmed: true, privacyAck: true, signatureName: opts.fullLegalName },
  };
}

async function freshApprovedApplication(): Promise<{ applicant: { email: string; id: string; token: string }; appId: string; quoteId: string }> {
  const applicant = await freshApplicant();
  const orgName = `AgreementExec Org ${stamp}-${createdOrgNames.length}`;
  createdOrgNames.push(orgName);
  const [status, app] = (await rpc('start_self_service_application', {
    p_selected_tier_code: 'essential', p_initial_expected_active_patients: 10,
    p_legal_name: 'Agreement Exec Applicant', p_contact_email: applicant.email,
    p_application_details: minimalDetails({ fullLegalName: 'Agreement Exec Applicant', verifiedBusinessEmail: applicant.email, orgName }),
  }, applicant.token)) as [number, { id: string; status: string; application_details: { originatingQuoteId: string } }];
  expect(status).toBe(200);
  expect(app.status).toBe('approved');
  return { applicant, appId: app.id, quoteId: app.application_details.originatingQuoteId };
}

afterAll(async () => {
  const orgNameList = createdOrgNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(',') || "''";
  sql(`
    DELETE FROM enterprise_contracts WHERE quote_id IN (SELECT (application_details->>'originatingQuoteId')::uuid FROM professional_applications WHERE applicant_user_id IN ('${createdApplicantIds.join("','")}'));
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN ('${createdApplicantIds.join("','")}'));
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${createdApplicantIds.join("','")}');
    DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE name IN (${orgNameList}));
    DELETE FROM organization_licenses WHERE organization_id IN (SELECT id FROM organizations WHERE name IN (${orgNameList}));
    DELETE FROM organizations WHERE name IN (${orgNameList});
  `);
  for (const id of createdApplicantIds) await authDeleteUser(id);
});

describe('HCN-ONBOARDING-PRODUCTION-001 Sections 1-2 -- self-service first-party agreement execution', () => {
  it('a fresh approved application can execute the Business Associate Agreement for real', async () => {
    const { applicant, appId, quoteId } = await freshApprovedApplication();
    const [status, contract] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Agreement Exec Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { status: string; signatory_name: string; executed_at: string; template_version: string; quote_id: string }];
    expect(status).toBe(200);
    expect(contract.status).toBe('executed');
    expect(contract.signatory_name).toBe('Agreement Exec Applicant');
    expect(contract.executed_at).toBeTruthy();
    expect(contract.template_version).toBe('HCN-BAA-2026-04-19');
    expect(contract.quote_id).toBe(quoteId);
  });

  it('the Haneen SaaS License Agreement is explicitly BLOCKED, never faked', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    const [status, body] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Agreement Exec Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toMatch(/BLOCKED/);
  });

  it('cannot execute an agreement without affirmative consent', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    const [status] = await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Agreement Exec Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: false, p_user_agent: 'vitest-integration',
    }, applicant.token);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('cannot execute an agreement with a blank typed name', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    const [status] = await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: '   ',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a user cannot execute an agreement for another applicant\'s application', async () => {
    const { appId } = await freshApprovedApplication();
    const outsider = await freshApplicant();
    const [status] = await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Outsider',
      p_signatory_title: null, p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, outsider.token);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('signing retries are idempotent -- a second identical call returns the same executed contract, not a duplicate', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    const [, first] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Agreement Exec Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { id: string }];
    const [status, second] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Agreement Exec Applicant (retry)',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { id: string; signatory_name: string }];
    expect(status).toBe(200);
    expect(second.id).toBe(first.id);
    expect(second.signatory_name).toBe('Agreement Exec Applicant'); // the retry did NOT overwrite the original signature
  });

  it('Stripe billing authorization cannot begin until BOTH agreements are executed (BAA alone is not sufficient)', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Agreement Exec Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token);

    const appStatus = sql(`SELECT status FROM professional_applications WHERE id='${appId}';`);
    expect(appStatus).toBe('approved'); // never advances to agreements_executed -- saas_license is still blocked

    const [status, body] = (await rpc('create_enterprise_billing_account', {
      p_quote_id: sql(`SELECT (application_details->>'originatingQuoteId') FROM professional_applications WHERE id='${appId}';`),
      p_billing_contact_email: applicant.email,
    }, applicant.token)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toMatch(/SaaS License Agreement and Business Associate Agreement must be executed/);
  });

  it('an amendment request\'s billing (an ALREADY-active organization) is unaffected by the new initial-activation agreement gate', async () => {
    // Direct fixture: an active org + an amendment request already
    // quoted -- this engagement's own pre-existing coverage
    // (enterpriseContracts.test.ts / amendment flow tests) already
    // proves this path end to end; this is a narrow regression check
    // that THIS migration's new gate specifically does not reach it.
    const directorEmail = `agreementexec-amend-director-${stamp}@local.test`;
    const directorId = await authSignUp(directorEmail, PW);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
    const directorTok = await login(directorEmail, PW);
    const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('AgreementExec Amend Org ${stamp}','integrated_care','${directorId}') RETURNING id;`);
    sql(`
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'active');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    `);
    const [, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: { description: 'More seats' }, p_director_notes: null,
    }, directorTok)) as [number, { id: string }];
    // Quoting requires Platform Owner -- simulate directly via SQL since
    // this test's subject is the billing gate, not the quoting ceremony.
    const quoteId = sql(`
      INSERT INTO sales_prospects(contact_name,contact_email,prospective_organization_name,status,created_by) VALUES('Director','${directorEmail}','AgreementExec Amend Org ${stamp}','quoted','${directorId}') RETURNING id;
    `);
    const quoteId2 = sql(`
      INSERT INTO sales_quotes(prospect_id,package_type,proposed_licensed_seats,proposed_covered_patient_capacity,annual_license_fee,billing_cadence,status,created_by) VALUES('${quoteId}','integrated_care',20,20,399,'annual','sent','${directorId}') RETURNING id;
    `);
    sql(`UPDATE organization_amendment_requests SET status='quoted', resulting_quote_id='${quoteId2}' WHERE id='${request.id}';`);

    const [status] = await rpc('create_enterprise_billing_account', {
      p_quote_id: quoteId2, p_billing_contact_email: directorEmail,
    }, directorTok);
    expect(status).toBe(200); // not blocked -- no agreement re-execution required for an amendment to an already-licensed org

    sql(`
      DELETE FROM enterprise_billing_accounts WHERE quote_id='${quoteId2}';
      DELETE FROM organization_amendment_requests WHERE id='${request.id}';
      DELETE FROM sales_quotes WHERE id='${quoteId2}';
      DELETE FROM sales_prospects WHERE id='${quoteId}';
      DELETE FROM organization_memberships WHERE organization_id='${orgId}';
      DELETE FROM organization_licenses WHERE organization_id='${orgId}';
      DELETE FROM organizations WHERE id='${orgId}';
    `);
    await authDeleteUser(directorId);
  });
});
