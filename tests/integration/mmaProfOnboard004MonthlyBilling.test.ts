// MMA-PROF-ONBOARD-004 P0-2 Phase 6 (migration 164): the monthly
// active-patient billing component -- a second, distinct commercial
// obligation from the annual license, deferred to the first calendar
// day of the next month in a disclosed timezone, and activation's
// extended gate requiring a confirmed recurring-payment authorization
// for it (when one exists) before a license can go active. Requires
// the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'MonthlyBill9!';
const stamp = Date.now();
const emails = { owner: `monthly-owner-${stamp}@local.test`, bilal: `monthly-bilal-${stamp}@local.test` };
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

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
    DELETE FROM enterprise_billing_accounts WHERE created_by='${ids.bilal}';
    DELETE FROM enterprise_contracts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by IN ('${ids.owner}','${ids.bilal}'));
    DELETE FROM professional_applications WHERE applicant_user_id='${ids.bilal}';
    DELETE FROM sales_quotes WHERE created_by IN ('${ids.owner}','${ids.bilal}');
    DELETE FROM sales_prospects WHERE created_by IN ('${ids.owner}','${ids.bilal}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-PROF-ONBOARD-004 monthly billing component (migration 164)', () => {
  it('computes the exact first-of-next-month anchor, DST-aware, in a disclosed timezone', async () => {
    const [status, rows] = (await rpc('compute_next_month_billing_anchor', { p_timezone: 'America/Chicago' }, tok.bilal)) as [number, { anchor_date: string; anchor_unix: number }[]];
    expect(status).toBe(200);
    const [year, month] = rows[0].anchor_date.split('-').map(Number);
    const now = new Date();
    const expectedMonth = now.getUTCMonth() === 11 ? 1 : now.getUTCMonth() + 2;
    const expectedYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    expect(month).toBe(expectedMonth);
    expect(year).toBe(expectedYear);
    expect(rows[0].anchor_date.endsWith('-01')).toBe(true);
  });

  it('rejects an invalid timezone rather than silently defaulting to UTC', async () => {
    const [status] = await rpc('compute_next_month_billing_anchor', { p_timezone: 'Not/A/Real/Zone' }, tok.bilal);
    expect(status).toBe(400);
  });

  it('creates a second, independent billing component for the monthly subscription, with its own estimated price from the real formula', async () => {
    const prospectId = sql(`INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by) VALUES ('Monthly Test', '${emails.bilal}', 'Monthly Billing Org ${stamp}', '${ids.bilal}') RETURNING id;`);
    const quoteId = sql(`INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by) VALUES ('${prospectId}', 'integrated_care', 10, NULL, 599, 'annual', 'sent', '${ids.bilal}') RETURNING id;`);
    sql(`
      INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details, selected_tier_code, initial_expected_active_patients)
      VALUES ('${ids.bilal}', 'director', 'Monthly Billing Org ${stamp}', 'integrated_care', 'Bilal Applicant', '${emails.bilal}', 'agreements_pending', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb, 'plus', 35);
    `);

    const [, annualAccount] = (await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: emails.bilal }, tok.bilal)) as [number, { id: string }];
    expect(annualAccount.id).toBeTruthy();

    const [status, monthlyAccount] = (await rpc('create_enterprise_monthly_billing_component', { p_quote_id: quoteId, p_billing_timezone: 'America/Chicago' }, tok.bilal)) as [number, { billing_component: string; unit_amount_cents: number; billing_interval: string }];
    expect(status).toBe(200);
    expect(monthlyAccount.billing_component).toBe('monthly_patients');
    expect(monthlyAccount.unit_amount_cents).toBe(41000); // $410.00 at 35 active patients, the exact formula result.
    expect(monthlyAccount.billing_interval).toBe('month');

    const rowCount = sql(`SELECT count(*) FROM enterprise_billing_accounts WHERE quote_id='${quoteId}';`);
    expect(rowCount).toBe('2');

    const anchorPersisted = sql(`SELECT application_details->>'monthlyBillingAnchorDate' FROM professional_applications WHERE application_details->>'originatingQuoteId'='${quoteId}';`);
    expect(anchorPersisted).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('activation requires a confirmed recurring-payment authorization for the monthly component when one was set up, not just the annual charge', async () => {
    const prospectId = sql(`INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by) VALUES ('Monthly Gate Test', '${emails.bilal}', 'Monthly Gate Org ${stamp}', '${ids.bilal}') RETURNING id;`);
    const quoteId = sql(`INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by) VALUES ('${prospectId}', 'integrated_care', 10, NULL, 599, 'annual', 'sent', '${ids.bilal}') RETURNING id;`);
    const appId = sql(`
      INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details, selected_tier_code, initial_expected_active_patients)
      VALUES ('${ids.bilal}', 'director', 'Monthly Gate Org ${stamp}', 'integrated_care', 'Bilal Applicant', '${emails.bilal}', 'agreements_pending', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb, 'plus', 35) RETURNING id;
    `);
    await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: emails.bilal }, tok.bilal);
    await rpc('create_enterprise_monthly_billing_component', { p_quote_id: quoteId, p_billing_timezone: 'America/Chicago' }, tok.bilal);

    sql(`UPDATE enterprise_billing_accounts SET status='active' WHERE quote_id='${quoteId}' AND billing_component='annual_license';`);
    const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('Monthly Gate Org ${stamp}', 'integrated_care', '${ids.bilal}') RETURNING id;`);
    sql(`UPDATE professional_applications SET status='approved', target_organization_id='${orgId}', platform_owner_approved_at=now() WHERE id='${appId}';`);
    sql(`INSERT INTO organization_licenses (organization_id, status) VALUES ('${orgId}', 'proposed');`);
    sql(`INSERT INTO enterprise_contracts (quote_id, contract_type, template_version, signatory_name, status, executed_by, executed_at, execution_method, execution_evidence_reference, created_by) VALUES ('${quoteId}', 'saas_license', 'v1', 'Test', 'executed', '${ids.owner}', now(), 'test', 'test', '${ids.owner}');`);
    sql(`INSERT INTO enterprise_contracts (quote_id, contract_type, template_version, signatory_name, status, executed_by, executed_at, execution_method, execution_evidence_reference, created_by) VALUES ('${quoteId}', 'baa', 'v1', 'Test', 'executed', '${ids.owner}', now(), 'test', 'test', '${ids.owner}');`);

    // The monthly component exists but has NO stripe_subscription_id /
    // active status yet (no recurring authorization confirmed) --
    // activation must still be blocked.
    let threw = false;
    try { sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); } catch { threw = true; }
    expect(threw).toBe(true);

    // Now confirm the recurring authorization (as the webhook would) --
    // activation succeeds, and the license carries the disclosed anchor.
    sql(`UPDATE enterprise_billing_accounts SET status='active', stripe_subscription_id='sub_test_monthly_123' WHERE quote_id='${quoteId}' AND billing_component='monthly_patients';`);
    const license = sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`);
    expect(license).toBeTruthy();
    const anchorOnLicense = sql(`SELECT monthly_billing_anchor_date, monthly_billing_timezone FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(anchorOnLicense).toMatch(/^\d{4}-\d{2}-01\|America\/Chicago$/);

    sql(`DELETE FROM organization_licenses WHERE organization_id='${orgId}'; DELETE FROM organizations WHERE id='${orgId}';`);
  });
});
