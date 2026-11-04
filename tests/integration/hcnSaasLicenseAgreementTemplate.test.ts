// HCN-SAAS-1.0 directive -- proves the owner-approved Haneen SaaS
// License and Subscription Agreement (HCN-SAAS-1.0) is registered as
// a versioned, immutable template with a correct, independently
// Postgres-derived content hash; that electronic signing of it stays
// server-side BLOCKED with a precise configuration message until the
// lawful contracting entity is confirmed (never silently permitted,
// never faked); that the already-executed BAA is completely
// unaffected; and that once the entity-confirmed gate is lifted (the
// one state this test flips directly, to prove the future path works
// without actually enabling it for real), signing, duplicate-signature
// prevention, cross-applicant rejection, and the billing-advance gate
// all behave correctly.
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'SaasLicenseTpl9!';
const stamp = Date.now();
const createdApplicantIds: string[] = [];
const createdOrgNames: string[] = [];

function setEntityConfirmed(confirmed: boolean) {
  sql(`CREATE OR REPLACE FUNCTION public.hcn_saas_contracting_entity_confirmed() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT ${confirmed}; $$;`);
}

async function freshApplicant(): Promise<{ email: string; id: string; token: string }> {
  const email = `saastpl-applicant-${stamp}-${createdApplicantIds.length}@local.test`;
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
  const orgName = `SaasTpl Org ${stamp}-${createdOrgNames.length}`;
  createdOrgNames.push(orgName);
  const [status, app] = (await rpc('start_self_service_application', {
    p_selected_tier_code: 'essential', p_initial_expected_active_patients: 10,
    p_legal_name: 'Saas Tpl Applicant', p_contact_email: applicant.email,
    p_application_details: minimalDetails({ fullLegalName: 'Saas Tpl Applicant', verifiedBusinessEmail: applicant.email, orgName }),
  }, applicant.token)) as [number, { id: string; status: string; application_details: { originatingQuoteId: string } }];
  expect(status).toBe(200);
  expect(app.status).toBe('approved');
  return { applicant, appId: app.id, quoteId: app.application_details.originatingQuoteId };
}

afterEach(() => setEntityConfirmed(false)); // never leave a test in the "entity confirmed" state

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

describe('HCN-SAAS-1.0 -- versioned template registration', () => {
  it('HCN-SAAS-1.0 is registered with the correct version and a Postgres-derived content hash', () => {
    const version = sql(`SELECT template_version FROM hcn_agreement_templates WHERE contract_type='saas_license';`);
    expect(version).toBe('HCN-SAAS-1.0');
    const hash = sql(`SELECT content_sha256 FROM hcn_agreement_templates WHERE contract_type='saas_license';`);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // content_sha256 is a GENERATED column -- re-deriving it independently
    // here proves it really is derived from the stored content, not a
    // separately-supplied value that happens to look right.
    const rederived = sql(`SELECT encode(extensions.digest(content, 'sha256'), 'hex') FROM hcn_agreement_templates WHERE contract_type='saas_license';`);
    expect(rederived).toBe(hash);
  });

  it('registering the same version again does not overwrite or duplicate the row', () => {
    const before = sql(`SELECT count(*) FROM hcn_agreement_templates WHERE contract_type='saas_license' AND template_version='HCN-SAAS-1.0';`);
    expect(before).toBe('1');
    sql(`INSERT INTO hcn_agreement_templates (contract_type, template_version, content) VALUES ('saas_license','HCN-SAAS-1.0','ignored, should be rejected by the unique constraint') ON CONFLICT (contract_type, template_version) DO NOTHING;`);
    const after = sql(`SELECT count(*) FROM hcn_agreement_templates WHERE contract_type='saas_license' AND template_version='HCN-SAAS-1.0';`);
    expect(after).toBe('1');
    const stillOriginal = sql(`SELECT length(content) FROM hcn_agreement_templates WHERE contract_type='saas_license' AND template_version='HCN-SAAS-1.0';`);
    expect(Number(stillOriginal)).toBeGreaterThan(1000); // still the real ~21KB document, not the 1-line placeholder above
  });
});

describe('HCN-SAAS-1.0 -- signing stays BLOCKED until the contracting entity is confirmed', () => {
  it('the approved template exists for review, but signing is refused with a precise configuration message', async () => {
    expect(sql(`SELECT hcn_saas_contracting_entity_confirmed();`)).toBe('f');
    const { applicant, appId } = await freshApprovedApplication();
    const [status, body] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Saas Tpl Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { message?: string }];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toMatch(/BLOCKED/);
    expect(body.message).toMatch(/HCN-SAAS-1\.0/);
    expect(body.message).toMatch(/lawful contracting entity/);
    // No row was created for THIS application's quote -- a blocked
    // attempt leaves no partial/fabricated record. Scoped to this
    // test's own quote_id -- this suite shares one Postgres instance
    // with every other integration test file, which may have its own,
    // unrelated saas_license contracts for other quotes.
    const quoteId = sql(`SELECT (application_details->>'originatingQuoteId') FROM professional_applications WHERE id='${appId}';`);
    const count = sql(`SELECT count(*) FROM enterprise_contracts WHERE contract_type='saas_license' AND quote_id='${quoteId}';`);
    expect(count).toBe('0');
  });

  it('the already-executed BAA is completely unaffected by the saas_license gate', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    const [status, contract] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Saas Tpl Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { status: string; template_version: string; content_sha256: string | null }];
    expect(status).toBe(200);
    expect(contract.status).toBe('executed');
    expect(contract.template_version).toBe('HCN-BAA-2026-04-19');
    expect(contract.content_sha256).toBeNull(); // BAA was never registered in hcn_agreement_templates -- unaffected, unchanged
  });
});

describe('HCN-SAAS-1.0 -- once the contracting entity is confirmed (test-only state, proves the future path)', () => {
  it('signing succeeds, records the correct version and content hash, and advances billing once BOTH agreements are executed', async () => {
    const { applicant, appId, quoteId } = await freshApprovedApplication();
    await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'baa', p_signatory_name: 'Saas Tpl Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token);

    setEntityConfirmed(true);
    const expectedHash = sql(`SELECT content_sha256 FROM hcn_agreement_templates WHERE contract_type='saas_license';`);

    const [status, contract] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Saas Tpl Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { status: string; template_version: string; content_sha256: string; quote_id: string }];
    expect(status).toBe(200);
    expect(contract.status).toBe('executed');
    expect(contract.template_version).toBe('HCN-SAAS-1.0');
    expect(contract.content_sha256).toBe(expectedHash);
    expect(contract.quote_id).toBe(quoteId);

    const appStatus = sql(`SELECT status FROM professional_applications WHERE id='${appId}';`);
    expect(appStatus).toBe('agreements_executed'); // both now executed -- billing authorization unblocked

    const [billingStatus] = await rpc('create_enterprise_billing_account', {
      p_quote_id: quoteId, p_billing_contact_email: applicant.email,
    }, applicant.token);
    expect(billingStatus).toBe(200);
  });

  it('duplicate-signature prevention: a second signing attempt returns the original executed contract unchanged', async () => {
    const { applicant, appId } = await freshApprovedApplication();
    setEntityConfirmed(true);
    const [, first] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Saas Tpl Applicant',
      p_signatory_title: 'Founder', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { id: string }];
    const [status, second] = (await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Someone Else Entirely',
      p_signatory_title: 'Imposter', p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, applicant.token)) as [number, { id: string; signatory_name: string }];
    expect(status).toBe(200);
    expect(second.id).toBe(first.id);
    expect(second.signatory_name).toBe('Saas Tpl Applicant');
    const count = sql(`SELECT count(*) FROM enterprise_contracts WHERE quote_id = (SELECT (application_details->>'originatingQuoteId')::uuid FROM professional_applications WHERE id='${appId}') AND contract_type='saas_license';`);
    expect(count).toBe('1');
  });

  it('cross-organization access is rejected: a different applicant cannot sign for this application', async () => {
    const { appId } = await freshApprovedApplication();
    const outsider = await freshApplicant();
    setEntityConfirmed(true);
    const [status] = await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Outsider',
      p_signatory_title: null, p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, outsider.token);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('an unauthorized (unauthenticated) signing attempt is rejected', async () => {
    const { appId } = await freshApprovedApplication();
    setEntityConfirmed(true);
    const [status] = await rpc('self_service_execute_agreement', {
      p_application_id: appId, p_contract_type: 'saas_license', p_signatory_name: 'Nobody',
      p_signatory_title: null, p_consent_to_electronic_records: true, p_user_agent: 'vitest-integration',
    }, '');
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
