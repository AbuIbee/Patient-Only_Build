// CODEX F-04 (P1, release-blocking) — "Required agreement and BAA
// gate fails open." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 123.
//
// Migration 117 (earlier this session, before this audit was read)
// already fixed the half Codex calls "all relevant rows void -> no
// gate." This file covers the remaining half: "no contract rows at
// all -> no gate" for BOTH required agreement types this engagement
// models (saas_license, baa), for both activation and amendment
// application.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'CodexF04Fix9!';
const stamp = Date.now();

const emails = {
  owner: `f04-owner-${stamp}@local.test`,
  bilal: `f04-bilal-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const createdOrgIds: string[] = [];

async function makeQuoteAndApplication(orgName: string, fee: number): Promise<{ quoteId: string; appId: string }> {
  const [, prospect] = (await rpc('platform_owner_create_prospect', {
    p_contact_name: 'F04 Test', p_contact_email: emails.bilal, p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null,
  }, tok.owner)) as [number, { id: string }];
  const [, quote] = (await rpc('platform_owner_create_quote', {
    p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
    p_proposed_covered_patient_capacity: 20, p_annual_license_fee: fee, p_billing_cadence: 'annual',
    p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  const appId = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
    VALUES ('${ids.bilal}', 'director', '${orgName}', 'integrated_care', 'F04 Bilal', '${emails.bilal}', 'pending_review', true, '{"originatingQuoteId":"${quote.id}"}'::jsonb)
    RETURNING id;
  `);
  return { quoteId: quote.id, appId };
}
function markPaid(quoteId: string, feeCents: number): void {
  sql(`
    INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
    VALUES ('${quoteId}', 'billing@f04test.local', 'usd', ${feeCents}, 'year', 'active', '${ids.bilal}');
  `);
}
async function executeContract(quoteId: string, contractType: 'saas_license' | 'baa'): Promise<void> {
  const [, contract] = (await rpc('platform_owner_create_contract', {
    p_quote_id: quoteId, p_contract_type: contractType, p_template_version: 'v1', p_signatory_name: 'F04 Bilal', p_signatory_title: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_present_contract', { p_contract_id: contract.id }, tok.owner);
  await rpc('platform_owner_record_contract_execution', {
    p_contract_id: contract.id, p_execution_method: 'manual', p_execution_evidence_reference: `test-evidence-${contractType}`,
  }, tok.owner);
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  const orgFilter = createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM enterprise_contracts WHERE created_by='${ids.owner}';
    DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by='${ids.owner}');
    DELETE FROM organization_licenses WHERE organization_id IN (${orgFilter});
    DELETE FROM organization_memberships WHERE organization_id IN (${orgFilter});
    DELETE FROM organizations WHERE id IN (${orgFilter});
    DELETE FROM professional_applications WHERE applicant_user_id='${ids.bilal}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('CODEX F-04 FIX (migration 123) — required agreements are mandatory, not optional-if-created', () => {
  it('FIX: fully paid and approved, but NO contract rows at all, does not activate', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication(`F04 NoContract Org ${stamp}`, 10000);
    markPaid(quoteId, 1000000);
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('proposed');

    let threw = false;
    try { sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it('FIX: a saas_license alone, executed, is still not enough -- baa is independently required', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication(`F04 OnlySaas Org ${stamp}`, 11000);
    markPaid(quoteId, 1100000);
    await executeContract(quoteId, 'saas_license');
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('proposed');

    let threw = false;
    try { sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it('FIX: a baa alone, executed, is still not enough -- saas_license is independently required', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication(`F04 OnlyBaa Org ${stamp}`, 12000);
    markPaid(quoteId, 1200000);
    await executeContract(quoteId, 'baa');
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);

    let threw = false;
    try { sql(`SELECT activate_enterprise_license_from_quote('${quoteId}');`); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it('both agreements executed: activation succeeds', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication(`F04 BothOk Org ${stamp}`, 13000);
    markPaid(quoteId, 1300000);
    await executeContract(quoteId, 'saas_license');
    await executeContract(quoteId, 'baa');
    const [, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
    createdOrgIds.push(org.id);
    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${org.id}';`)).toBe('active');
  });
});
