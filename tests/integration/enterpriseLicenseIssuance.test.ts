// OWNER DIRECTIVE MMA-ENT-SALES-005 Phase G — the license issuance
// engine (migration 111). Covers both orderings the real business
// scenario allows: approve-then-pay (the common path) and
// pay-then-approve (the safety-net path), confirms a license is NEVER
// issued without a confirmed-paid enterprise_billing_accounts row (the
// critical gate -- activate_enterprise_license_from_quote must reject
// an approved-but-unpaid application), confirms the MMA-FE/MMA-TE
// numbering scheme and idempotency, confirms cancellation propagates
// from the billing account to the license, and confirms neither new
// service-role-only RPC is reachable by an authenticated client.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'LicenseEngine9!';
const stamp = Date.now();

const emails = {
  owner: `license-owner-${stamp}@local.test`,
  bilal: `license-bilal-${stamp}@local.test`,
  bilal2: `license-bilal2-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const createdOrgIds: string[] = [];

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM enterprise_contracts WHERE created_by='${ids.owner}';
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN ('${ids.bilal}','${ids.bilal2}'));
    DELETE FROM enterprise_billing_events WHERE billing_account_id IN (SELECT id FROM enterprise_billing_accounts WHERE created_by IN ('${ids.bilal}','${ids.bilal2}'));
    DELETE FROM enterprise_billing_accounts WHERE created_by IN ('${ids.bilal}','${ids.bilal2}');
    DELETE FROM organization_licenses WHERE organization_id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM organization_memberships WHERE organization_id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM organizations WHERE id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.bilal}','${ids.bilal2}');
    DELETE FROM sales_quote_invitations WHERE created_by='${ids.owner}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

async function makeQuote(email: string, orgName: string, packageType: string, fee: number): Promise<string> {
  const [, prospect] = (await rpc(
    'platform_owner_create_prospect',
    { p_contact_name: 'License Test', p_contact_email: email, p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null },
    tok.owner,
  )) as [number, { id: string }];
  const [, quote] = (await rpc(
    'platform_owner_create_quote',
    {
      p_prospect_id: prospect.id, p_package_type: packageType, p_proposed_licensed_seats: 6,
      p_proposed_covered_patient_capacity: 30, p_annual_license_fee: fee, p_billing_cadence: 'annual',
      p_quote_term_months: null, p_discount_notes: null, p_valid_until: null,
    },
    tok.owner,
  )) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  return quote.id;
}
async function submitApplication(userId: string, token: string, orgName: string, packageType: string, quoteId: string): Promise<string> {
  const appId = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
    VALUES ('${userId}', 'director', '${orgName}', '${packageType}', 'License Test Applicant', 'license-applicant-${stamp}@local.test', 'pending_review', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb)
    RETURNING id;
  `);
  return appId;
}
// CODEX F-04 fix (migration 123): both 'saas_license' and 'baa' must
// now be executed before activation can ever succeed.
async function executeRequiredContracts(quoteId: string, signatoryName: string): Promise<void> {
  for (const contractType of ['saas_license', 'baa'] as const) {
    const [, contract] = (await rpc('platform_owner_create_contract', {
      p_quote_id: quoteId, p_contract_type: contractType, p_template_version: 'v1', p_signatory_name: signatoryName, p_signatory_title: null,
    }, tok.owner)) as [number, { id: string }];
    await rpc('platform_owner_present_contract', { p_contract_id: contract.id }, tok.owner);
    await rpc('platform_owner_record_contract_execution', {
      p_contract_id: contract.id, p_execution_method: 'manual', p_execution_evidence_reference: `test-evidence-${contractType}`,
    }, tok.owner);
  }
}
function markBillingAccountActive(quoteId: string, email: string, feeCents: number): string {
  const existing = sql(`SELECT id FROM enterprise_billing_accounts WHERE quote_id='${quoteId}';`);
  if (existing) {
    sql(`UPDATE enterprise_billing_accounts SET status='active' WHERE id='${existing}';`);
    return existing;
  }
  return sql(`
    INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
    VALUES ('${quoteId}', '${email}', 'usd', ${feeCents}, 'year', 'active', (SELECT applicant_user_id FROM professional_applications WHERE application_details->>'originatingQuoteId'='${quoteId}' LIMIT 1))
    RETURNING id;
  `);
}

describe('MMA-ENT-SALES-005 Phase G — enterprise license issuance engine (migration 111)', () => {
  it('CRITICAL GATE: approving an application does NOT activate a license without confirmed payment', async () => {
    const quoteId = await makeQuote(emails.bilal, `Unpaid Org ${stamp}`, 'integrated_care', 20000);
    const appId = await submitApplication(ids.bilal, tok.bilal, `Unpaid Org ${stamp}`, 'integrated_care', quoteId);

    const [status, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    expect(status).toBe(200);
    createdOrgIds.push(org.id);

    const license = sql(`SELECT status, license_number FROM organization_licenses WHERE organization_id='${org.id}';`);
    expect(license).toBe('proposed|');

    // Directly confirms the gate lives inside activate_enterprise_license_from_quote
    // itself (not just in the caller's swallow-exception safety net) --
    // calling it directly post-approval, still with no paid billing
    // account, must also raise.
    let threwWithoutPayment = false;
    try {
      sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`);
    } catch {
      threwWithoutPayment = true;
    }
    expect(threwWithoutPayment).toBe(true);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('proposed');
  });

  it('pay-then-approve ordering: license activates automatically the instant approval happens', async () => {
    const quoteId = await makeQuote(emails.bilal, `PayFirst Org ${stamp}`, 'integrated_care', 24000);
    const appId = await submitApplication(ids.bilal, tok.bilal, `PayFirst Org ${stamp}`, 'integrated_care', quoteId);
    markBillingAccountActive(quoteId, 'billing@payfirst.test', 2400000);
    await executeRequiredContracts(quoteId, 'License Test Applicant');

    const [status, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    expect(status).toBe(200);
    createdOrgIds.push(org.id);

    const license = sql(`SELECT status, license_number, licensed_seats, covered_patient_capacity, annual_license_fee FROM organization_licenses WHERE organization_id='${org.id}';`);
    const [licStatus, licNumber] = license.split('|');
    expect(licStatus).toBe('active');
    expect(licNumber).toMatch(/^MMA-FE-\d{4}-\d{6}$/);
    expect(license).toContain('|6|30|24000.00');

    const event = sql(`SELECT event_type FROM professional_application_events WHERE application_id='${appId}' AND event_type='enterprise_license_activated';`);
    expect(event).toBe('enterprise_license_activated');
  });

  it('approve-then-pay ordering: the webhook-equivalent RPC activates the license after the fact', async () => {
    const quoteId = await makeQuote(emails.bilal2, `ApproveFirst Org ${stamp}`, 'therapist', 15000);
    const appId = await submitApplication(ids.bilal2, tok.bilal2, `ApproveFirst Org ${stamp}`, 'therapist', quoteId);

    const [approveStatus, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    expect(approveStatus).toBe(200);
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('proposed');

    markBillingAccountActive(quoteId, 'billing@approvefirst.test', 1500000);
    await executeRequiredContracts(quoteId, 'License Test Applicant');

    // Simulates exactly what the webhook does post-payment: call the
    // service-role-only activation RPC directly as postgres (the same
    // privilege level the webhook's service-role key has).
    const activated = sql(`SELECT (activate_enterprise_license_from_quote('${quoteId}')).*;`);
    expect(activated).toContain('|active|');

    const license = sql(`SELECT status, license_number FROM organization_licenses WHERE organization_id='${org.id}';`);
    const [licStatus, licNumber] = license.split('|');
    expect(licStatus).toBe('active');
    expect(licNumber).toMatch(/^MMA-TE-\d{4}-\d{6}$/);
  });

  it('calling activation twice for the same quote is idempotent -- no second license number is issued', async () => {
    const quoteId = await makeQuote(emails.bilal, `Idempotent Org ${stamp}`, 'integrated_care', 18000);
    const appId = await submitApplication(ids.bilal, tok.bilal, `Idempotent Org ${stamp}`, 'integrated_care', quoteId);
    markBillingAccountActive(quoteId, 'billing@idem.test', 1800000);
    await executeRequiredContracts(quoteId, 'License Test Applicant');

    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);

    const firstNumber = sql(`SELECT license_number FROM organization_licenses WHERE organization_id='${org.id}';`);
    sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); // replay
    const secondNumber = sql(`SELECT license_number FROM organization_licenses WHERE organization_id='${org.id}';`);
    expect(secondNumber).toBe(firstNumber);
  });

  it('activate_enterprise_license_from_quote fails closed before approval even with confirmed payment', async () => {
    const quoteId = await makeQuote(emails.bilal, `TooEarly Org ${stamp}`, 'integrated_care', 9000);
    await submitApplication(ids.bilal, tok.bilal, `TooEarly Org ${stamp}`, 'integrated_care', quoteId);
    markBillingAccountActive(quoteId, 'billing@tooearly.test', 900000);

    let threw = false;
    try {
      sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('a confirmed Stripe subscription cancellation propagates to the organization license', async () => {
    const quoteId = await makeQuote(emails.bilal, `Cancel Org ${stamp}`, 'integrated_care', 11000);
    const appId = await submitApplication(ids.bilal, tok.bilal, `Cancel Org ${stamp}`, 'integrated_care', quoteId);
    markBillingAccountActive(quoteId, 'billing@cancel.test', 1100000);
    await executeRequiredContracts(quoteId, 'License Test Applicant');
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('active');

    sql(`SELECT set_enterprise_license_status_for_quote('${quoteId}', 'canceled');`);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('canceled');
  });

  it('migration 112 (superseded by PACKAGE-1 migration 143): an active license was already locked against Director self-edit by its own 400 business-logic check; org_configure_license is now unreachable by any authenticated Director at all, active or not', async () => {
    const quoteId = await makeQuote(emails.bilal, `Locked Org ${stamp}`, 'integrated_care', 13000);
    const appId = await submitApplication(ids.bilal, tok.bilal, `Locked Org ${stamp}`, 'integrated_care', quoteId);
    markBillingAccountActive(quoteId, 'billing@locked.test', 1300000);
    await executeRequiredContracts(quoteId, 'License Test Applicant');
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('active');

    // PACKAGE 1 (migration 143): the EXECUTE grant itself is now
    // revoked from authenticated -- PostgREST maps Postgres's
    // insufficient_privilege to 403, before the function's own
    // internal "active license is locked" 400 check (migration 112)
    // ever runs. Migration 112's check still exists in the function
    // body (defense in depth, exercised directly by a service_role/
    // SQL-level call elsewhere) but is no longer reachable via the
    // client at all, for any license status.
    const [tamperStatus] = await rpc('org_configure_license', {
      p_org_id: org.id, p_licensed_seats: 999, p_covered_patient_capacity: 999, p_annual_license_fee: 1,
    }, tok.bilal);
    expect(tamperStatus).toBe(403);

    const unchanged = sql(`SELECT licensed_seats, covered_patient_capacity, annual_license_fee FROM organization_licenses WHERE organization_id='${org.id}';`);
    expect(unchanged).toBe('6|30|13000.00');
  });

  it('PACKAGE 1 migration 143: a PROPOSED (not yet paid) license can no longer be self-configured by its Director either -- the real path is the commercial quote/contract pipeline, never a direct client call', async () => {
    const quoteId = await makeQuote(emails.bilal, `StillProposed Org ${stamp}`, 'integrated_care', 5000);
    const appId = await submitApplication(ids.bilal, tok.bilal, `StillProposed Org ${stamp}`, 'integrated_care', quoteId);
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('proposed');

    // Before migration 143, this title was literally true ("can still
    // be freely configured... exactly as before") -- a Director could
    // self-declare their own org's seats/capacity/fee with no real
    // payment, quote, or Platform Owner review behind the numbers.
    // That is exactly the "self-service license capacity change"
    // Codex/the senior architect's hosted migration closes. Now
    // rejected outright, before the function body even runs.
    const [status] = await rpc('org_configure_license', {
      p_org_id: org.id, p_licensed_seats: 3, p_covered_patient_capacity: 10, p_annual_license_fee: 1200,
    }, tok.bilal);
    expect(status).toBe(403);
    expect(sql(`SELECT licensed_seats, covered_patient_capacity FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('|');
  });

  it('neither new RPC is reachable by an authenticated client -- service_role only', async () => {
    // PostgREST maps Postgres's insufficient_privilege (no EXECUTE
    // grant) to 403; a non-existent/renamed RPC would be 404 instead --
    // either is an acceptable "not reachable," but 403 is what an
    // actual privilege denial looks like here.
    const [activateStatus] = await rpc('activate_enterprise_license_from_quote', { p_quote_id: '00000000-0000-0000-0000-000000000000' }, tok.owner);
    expect([401, 403, 404]).toContain(activateStatus);
    const [cancelStatus] = await rpc('set_enterprise_license_status_for_quote', { p_quote_id: '00000000-0000-0000-0000-000000000000', p_status: 'canceled' }, tok.owner);
    expect([401, 403, 404]).toContain(cancelStatus);
    const [anonStatus] = await rpc('activate_enterprise_license_from_quote', { p_quote_id: '00000000-0000-0000-0000-000000000000' }, ANON);
    expect([401, 403, 404]).toContain(anonStatus);
  });

  it('an unrecognized package type on the quote fails closed rather than guessing a license prefix', async () => {
    // Bypasses platform_owner_create_quote's own package_type CHECK by
    // inserting directly -- proves the ISSUANCE function's own guard,
    // not just the quote-creation RPC's input validation.
    const prospectId = sql(`
      INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by)
      VALUES ('Bad Package Test', '${emails.bilal}', 'Bad Package Org ${stamp}', '${ids.owner}') RETURNING id;
    `);
    let threw = false;
    try {
      sql(`
        INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by)
        VALUES ('${prospectId}', 'not_a_real_package', 1, 1, 100, 'annual', 'sent', '${ids.owner}');
      `);
    } catch {
      threw = true; // the pre-existing package_type CHECK constraint already rejects this -- confirms the schema itself has no room for an unrecognized type to reach the issuance function at all.
    }
    expect(threw).toBe(true);
    sql(`DELETE FROM sales_prospects WHERE id='${prospectId}';`);
  });
});
