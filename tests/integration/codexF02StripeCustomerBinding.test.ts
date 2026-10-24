// CODEX F-02 (P0, release-blocking) — "Cross-organization Stripe
// customer association." Independent audit
// MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md, target commit
// b362e119. Fixed in migration 121 (resolve_enterprise_billing_customer)
// and create-enterprise-checkout-session/index.ts, which now calls it
// instead of searching Stripe globally by caller-supplied email.
//
// The Edge Function itself cannot be driven end-to-end in this
// environment (no real STRIPE_SECRET_KEY is configured here, same
// documented boundary as every other Stripe-touching path in this
// engagement) -- but the actual security-critical decision ("which
// Stripe customer id, if any, is safe to reuse") now lives entirely in
// this real, independently callable, ownership-checked RPC, so it is
// fully testable on its own merits without any Stripe network call.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'CodexF02Fix9!';
const stamp = Date.now();
const ORG_B = 'f0222222-0202-4f02-8f02-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  owner: `f02-owner-${stamp}@local.test`,
  applicantA: `f02-applicant-a-${stamp}@local.test`, // brand-new org, no Stripe history yet
  directorB: `f02-director-b-${stamp}@local.test`, // existing org WITH a real prior Stripe customer
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let quoteIdA: string; // Org A's brand-new application quote
let quoteIdB1: string; // Org B's ORIGINAL quote (already has a stored stripe_customer_id)
let quoteIdB2: string; // Org B's SECOND (renewal/amendment) quote -- legitimate reuse case
const ORG_B_STRIPE_CUSTOMER = `cus_f02_real_org_b_${stamp}`;

async function makeSentQuote(orgName: string, fee: number): Promise<{ prospectId: string; quoteId: string }> {
  const [, prospect] = (await rpc('platform_owner_create_prospect', {
    p_contact_name: 'F02 Test', p_contact_email: `f02-contact-${stamp}@local.test`, p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null,
  }, tok.owner)) as [number, { id: string }];
  const [, quote] = (await rpc('platform_owner_create_quote', {
    p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
    p_proposed_covered_patient_capacity: 20, p_annual_license_fee: fee, p_billing_cadence: 'annual',
    p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  return { prospectId: prospect.id, quoteId: quote.id };
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  // Org A: a brand-new Director application, nothing approved yet --
  // no organization exists, so there is nothing of Org A's own to
  // reuse (the correct, safe starting state).
  const qa = await makeSentQuote(`F02 Org A ${stamp}`, 10000);
  quoteIdA = qa.quoteId;
  sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
    VALUES ('${ids.applicantA}', 'director', 'F02 Org A ${stamp}', 'integrated_care', 'Applicant A', '${emails.applicantA}', 'pending_review', true, '{"originatingQuoteId":"${quoteIdA}"}'::jsonb);
  `);

  // Org B: an EXISTING, already-approved organization with a REAL
  // prior Stripe customer on its original billing account.
  const qb1 = await makeSentQuote(`F02 Org B ${stamp}`, 15000);
  quoteIdB1 = qb1.quoteId;
  sql(`
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG_B}','F02 Org B ${stamp}','integrated_care','${ids.directorB}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG_B}','${ids.directorB}','director','active');
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details, target_organization_id)
    VALUES ('${ids.directorB}', 'director', 'F02 Org B ${stamp}', 'integrated_care', 'Director B', '${emails.directorB}', 'approved', true, '{"originatingQuoteId":"${quoteIdB1}"}'::jsonb, '${ORG_B}');
    INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, stripe_customer_id, status, created_by)
    VALUES ('${quoteIdB1}', '${emails.directorB}', 'usd', 1500000, 'year', '${ORG_B_STRIPE_CUSTOMER}', 'active', '${ids.directorB}');
  `);

  // Org B's SECOND quote -- a legitimate renewal/expansion amendment
  // for the SAME organization. Resolving this quote should offer Org
  // B's OWN existing customer id for reuse.
  const qb2 = await makeSentQuote(`F02 Org B Renewal ${stamp}`, 20000);
  quoteIdB2 = qb2.quoteId;
  const [, request] = (await rpc('director_request_organization_amendment', {
    p_organization_id: ORG_B, p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null,
  }, tok.directorB)) as [number, { id: string }];
  sql(`UPDATE organization_amendment_requests SET status='quoted', resulting_quote_id='${quoteIdB2}' WHERE id='${request.id}';`);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM enterprise_billing_accounts WHERE quote_id IN ('${quoteIdA}','${quoteIdB1}','${quoteIdB2}');
    DELETE FROM organization_amendment_requests WHERE organization_id='${ORG_B}';
    DELETE FROM organization_memberships WHERE organization_id='${ORG_B}';
    DELETE FROM organizations WHERE id='${ORG_B}';
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.applicantA}','${ids.directorB}');
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('CODEX F-02 FIX (migration 121) — resolve_enterprise_billing_customer never leaks another organization\'s Stripe customer', () => {
  it('a brand-new application (no organization yet) resolves to no organization and no reusable customer -- nothing to bind to, nothing to leak', async () => {
    const [status, rows] = (await rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteIdA }, tok.applicantA)) as [number, { organization_id: string | null; reusable_stripe_customer_id: string | null }[]];
    expect(status).toBe(200);
    expect(rows[0]?.organization_id).toBeNull();
    expect(rows[0]?.reusable_stripe_customer_id).toBeNull();
  });

  it('FIX: Org A\'s applicant cannot discover or reuse Org B\'s real Stripe customer, even knowing Org B\'s own quote id directly', async () => {
    const [status, body] = await rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteIdB1 }, tok.applicantA);
    // Not Org A's quote at all -- the ownership check must reject it outright.
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('do not have an application or amendment request referencing this quote');
  });

  it('legitimate same-organization reuse: Org B\'s OWN renewal quote correctly offers Org B\'s own prior Stripe customer', async () => {
    const [status, rows] = (await rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteIdB2 }, tok.directorB)) as [number, { organization_id: string; reusable_stripe_customer_id: string }[]];
    expect(status).toBe(200);
    expect(rows[0]?.organization_id).toBe(ORG_B);
    expect(rows[0]?.reusable_stripe_customer_id).toBe(ORG_B_STRIPE_CUSTOMER);
  });

  it('a revoked director of Org B can no longer resolve (or reuse) Org B\'s billing identity', async () => {
    sql(`UPDATE organization_memberships SET status='revoked' WHERE organization_id='${ORG_B}' AND user_id='${ids.directorB}';`);
    const [status] = await rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteIdB2 }, tok.directorB);
    expect(status).toBe(400);
    sql(`UPDATE organization_memberships SET status='active' WHERE organization_id='${ORG_B}' AND user_id='${ids.directorB}';`);
  });

  it('an outsider with no application or amendment request anywhere cannot resolve any quote', async () => {
    const [status] = await rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteIdB1 }, tok.owner);
    expect(status).toBe(400);
  });
});
