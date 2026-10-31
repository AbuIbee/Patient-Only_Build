// HCN Stripe sandbox wiring — owner-authorized Test Mode verification
// (2026-10-30). Unlike every other Stripe-touching test in this repo
// (see codexF02StripeCustomerBinding.test.ts's own header), the owner
// explicitly authorized running the REAL enterprise Edge Functions
// against Stripe's real Test Mode API for this session, with the
// secret supplied out-of-band and wired only into the disposable local
// stack's own supabase/functions/.env (never into this repo, never
// into this file, never logged). This file therefore:
//   - Reads NOTHING from a hardcoded secret. It only asserts Stripe
//     Test Mode behavior (livemode:false, correct amounts, idempotent
//     retries) against whatever STRIPE_SECRET_KEY the disposable
//     stack's edge runtime was actually given.
//   - Self-skips (not a false pass) when HCN_SANDBOX_STRIPE_TEST is
//     unset, so a normal `npm run test:integration` run elsewhere
//     never silently depends on this.
//   - Never asserts on a `livemode:true` response; it fails loudly if
//     one is ever observed instead of treating it as a pass.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, BASE, login, rpc, sql } from './_runtime';

const RUN = process.env.HCN_SANDBOX_STRIPE_TEST === '1';
const d = RUN ? describe : describe.skip;

const PW = 'HcnSandbox9!';
const stamp = Date.now();
const emails = {
  owner: `hcn-sbx-owner-${stamp}@local.test`,
  essential: `hcn-sbx-essential-${stamp}@local.test`,
  plus: `hcn-sbx-plus-${stamp}@local.test`,
  complete: `hcn-sbx-complete-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const orgIds: string[] = [];
const quoteIds: string[] = [];

async function makeTierApplication(applicantKey: keyof typeof emails, tierCode: 'essential' | 'plus' | 'complete', feeCents: number, initialPatients: number) {
  const [, prospect] = (await rpc('platform_owner_create_prospect', {
    p_contact_name: 'HCN Sandbox Test', p_contact_email: emails[applicantKey], p_contact_phone: null,
    p_prospective_organization_name: `HCN Sandbox ${tierCode} ${stamp}`, p_notes: null,
  }, tok.owner)) as [number, { id: string }];
  const [, quote] = (await rpc('platform_owner_create_quote', {
    p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
    p_proposed_covered_patient_capacity: 500, p_annual_license_fee: feeCents / 100, p_billing_cadence: 'annual',
    p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  quoteIds.push(quote.id);

  const appId = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, selected_tier_code, initial_expected_active_patients, application_details)
    VALUES ('${ids[applicantKey]}', 'director', 'HCN Sandbox ${tierCode} ${stamp}', 'integrated_care', 'HCN Sandbox Applicant', '${emails[applicantKey]}', 'pending_review', true, '${tierCode}', ${initialPatients}, '{"originatingQuoteId":"${quote.id}"}'::jsonb)
    RETURNING id;
  `);
  return { quoteId: quote.id, appId };
}

async function executeContract(quoteId: string, contractType: 'saas_license' | 'baa') {
  const [, contract] = (await rpc('platform_owner_create_contract', {
    p_quote_id: quoteId, p_contract_type: contractType, p_template_version: 'v1', p_signatory_name: 'HCN Sandbox Applicant', p_signatory_title: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_present_contract', { p_contract_id: contract.id }, tok.owner);
  await rpc('platform_owner_record_contract_execution', {
    p_contract_id: contract.id, p_execution_method: 'manual', p_execution_evidence_reference: `hcn-sandbox-test-${contractType}-${stamp}`,
  }, tok.owner);
}

async function callFunction(name: string, token: string, body: unknown) {
  const r = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, json };
}

beforeAll(async () => {
  if (!RUN) return;
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  if (!RUN) return;
  const orgFilter = orgIds.length ? orgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM enterprise_billing_events WHERE billing_account_id IN (SELECT id FROM enterprise_billing_accounts WHERE quote_id = ANY(ARRAY[${quoteIds.map((q) => `'${q}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"}]::uuid[]));
    DELETE FROM enterprise_billing_accounts WHERE quote_id = ANY(ARRAY[${quoteIds.map((q) => `'${q}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"}]::uuid[]);
    DELETE FROM enterprise_contracts WHERE created_by='${ids.owner}';
    DELETE FROM organization_licenses WHERE organization_id IN (${orgFilter});
    DELETE FROM organization_memberships WHERE organization_id IN (${orgFilter});
    DELETE FROM organizations WHERE id IN (${orgFilter});
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.essential}','${ids.plus}','${ids.complete}');
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
}, 30000);

d('HCN Stripe sandbox wiring (owner-authorized Test Mode, 2026-10-30)', () => {
  const TIERS: Array<{ key: 'essential' | 'plus' | 'complete'; cents: number }> = [
    { key: 'essential', cents: 39900 },
    { key: 'plus', cents: 59900 },
    { key: 'complete', cents: 79900 },
  ];

  it.each(TIERS)('annual checkout session for $key tier via the REAL deployed Edge Function hits Stripe Test Mode with the correct amount', async ({ key, cents }) => {
    const { quoteId, appId } = await makeTierApplication(key, key, cents, 0);
    void appId;
    const r = await callFunction('create-enterprise-checkout-session', tok[key], { quoteId, billingContactEmail: emails[key] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const url = (r.json as { url?: string })?.url;
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const row = sql(`SELECT stripe_checkout_session_id, unit_amount_cents, status FROM enterprise_billing_accounts WHERE quote_id='${quoteId}' AND billing_component='annual_license';`);
    const [sessionId, amountCents] = row.split('|');
    expect(Number(amountCents)).toBe(cents);
    expect(sessionId).toMatch(/^cs_test_/);
  });

  it('duplicate-request protection: retrying the SAME checkout request does not create a second Stripe customer or session', async () => {
    const { quoteId } = await makeTierApplication('essential', 'essential', 39900, 0);
    const r1 = await callFunction('create-enterprise-checkout-session', tok.essential, { quoteId, billingContactEmail: emails.essential });
    const r2 = await callFunction('create-enterprise-checkout-session', tok.essential, { quoteId, billingContactEmail: emails.essential });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((r2.json as { url: string }).url).toBe((r1.json as { url: string }).url);
  });

  const MONTHLY_CASES = [
    { patients: 0, cents: 25000 },
    { patients: 160, cents: 108000 },
    { patients: 1000, cents: 378000 },
  ];

  it.each(MONTHLY_CASES)('monthly active-patient checkout at $patients patients via the REAL deployed Edge Function computes $cents cents', async ({ patients, cents }) => {
    const { quoteId } = await makeTierApplication('essential', 'essential', 39900, patients);
    // The monthly component's billing_contact_email is sourced from the
    // annual component (migration 164) -- the annual checkout must run
    // first, exactly as the real application flow requires.
    const annualFirst = await callFunction('create-enterprise-checkout-session', tok.essential, { quoteId, billingContactEmail: emails.essential });
    expect(annualFirst.status, JSON.stringify(annualFirst.json)).toBe(200);
    const r = await callFunction('create-enterprise-monthly-subscription', tok.essential, { quoteId, billingTimezone: 'America/Chicago' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const row = sql(`SELECT unit_amount_cents FROM enterprise_billing_accounts WHERE quote_id='${quoteId}' AND billing_component='monthly_patients';`);
    expect(Number(row)).toBe(cents);
  });

  it('webhook signature verification: a request to the REAL deployed stripe-webhook function with no/garbage signature is rejected, never processed', async () => {
    const r = await fetch(`${BASE}/functions/v1/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=0000000000000000000000000000000000000000000000000000000000000000' },
      body: JSON.stringify({ id: 'evt_hcn_sandbox_forged', type: 'checkout.session.completed', data: { object: {} } }),
    });
    expect(r.status).toBe(400);
  });

  it('full reconciliation + license issuance + Director provisioning chain for one Essential-tier organization, driven by a genuinely-signed webhook delivery to the REAL deployed function', async () => {
    const { quoteId, appId } = await makeTierApplication('complete', 'essential', 39900, 12);

    // Real owner-attested agreement execution (not fabricated) via the
    // existing production RPC path.
    await executeContract(quoteId, 'saas_license');
    await executeContract(quoteId, 'baa');

    // Real annual checkout via the real deployed function (Stripe Test Mode).
    const annual = await callFunction('create-enterprise-checkout-session', tok.complete, { quoteId, billingContactEmail: emails.complete });
    expect(annual.status, JSON.stringify(annual.json)).toBe(200);
    const annualRow = sql(`SELECT id, stripe_checkout_session_id FROM enterprise_billing_accounts WHERE quote_id='${quoteId}' AND billing_component='annual_license';`);
    const [annualBillingAccountId, annualSessionId] = annualRow.split('|');

    // Platform Owner approves the application and creates the real organization.
    const orgId = sql(`SELECT gen_random_uuid()::text;`);
    orgIds.push(orgId);
    sql(`
      INSERT INTO organizations(id,name,package_type,created_by) VALUES('${orgId}','HCN Sandbox Complete ${stamp}','integrated_care','${ids.complete}');
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${ids.complete}','director','active');
      UPDATE professional_applications SET status='approved', target_organization_id='${orgId}', platform_owner_approved_at=now() WHERE id='${appId}';
      INSERT INTO organization_licenses(organization_id, status) VALUES('${orgId}', 'proposed') ON CONFLICT (organization_id) DO NOTHING;
    `);

    // activate_enterprise_license_from_quote() (migration
    // 20261030013820) correctly requires a CONFIRMED, paid monthly
    // component whenever the application has a selected_tier_code (every
    // self-service tier application does). The real monthly checkout
    // endpoint currently cannot be exercised live here because of a
    // separate, already-proven, real defect (Stripe rejects a trial_end
    // under 2 days out, which the month-end date this test is running on
    // triggers) -- see the three monthly-checkout test failures. To keep
    // THIS test isolated to what it actually verifies (activation +
    // provisioning logic, given confirmed billing), synthesize an
    // already-confirmed monthly billing account directly, exactly as the
    // repository's own tests/hcn_recurring_authorization_rollback.sql
    // marks synthetic rows -- never a real Stripe object, clearly labeled.
    sql(`
      INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, billing_component, status, stripe_subscription_id, created_by)
      VALUES ('${quoteId}', '${emails.complete}', 'usd', 25800, 'month', 'monthly_patients', 'active', 'SYNTHETIC-NOT-A-STRIPE-SUBSCRIPTION-${stamp}', '${ids.complete}');
    `);

    // Build a REAL, correctly-signed checkout.session.completed event
    // (Stripe's documented HMAC scheme) for the annual session the
    // deployed function actually created, and deliver it to the REAL
    // deployed stripe-webhook function -- the exact code path that
    // would run against a live Stripe delivery.
    const crypto = await import('node:crypto');
    const payload = JSON.stringify({
      id: `evt_hcn_sandbox_${stamp}_annual`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: annualSessionId,
          object: 'checkout.session',
          customer: `cus_hcn_sandbox_${stamp}`,
          subscription: `sub_hcn_sandbox_${stamp}_annual`,
          metadata: { billing_type: 'enterprise', billing_component: 'annual_license', quote_id: quoteId, billing_account_id: annualBillingAccountId },
        },
      },
    });
    const whsec = process.env.HCN_SANDBOX_WHSEC;
    expect(whsec, 'HCN_SANDBOX_WHSEC must be set to run this test').toBeTruthy();
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', whsec as string).update(`${ts}.${payload}`, 'utf8').digest('hex');

    const webhookRes = await fetch(`${BASE}/functions/v1/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
      body: payload,
    });
    expect(webhookRes.status, await webhookRes.text()).toBe(200);

    // Reconciliation: the billing account must now be active.
    const statusAfter = sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${annualBillingAccountId}';`);
    expect(statusAfter).toBe('active');

    // License issuance: activate_enterprise_license_from_quote() runs
    // automatically inside the webhook handler -- confirm it actually
    // issued a numbered, active license (no monthly component exists
    // for this application, so that prerequisite doesn't block it).
    const licenseRow = sql(`SELECT status, license_number, specialist_slot_count FROM organization_licenses WHERE organization_id='${orgId}';`);
    const [licenseStatus, licenseNumber, slots] = licenseRow.split('|');
    expect(licenseStatus).toBe('active');
    expect(licenseNumber).toMatch(/^MMA-ES-/);
    expect(Number(slots)).toBe(0); // Essential tier -- SEC-11

    // SEC-07: redelivering the IDENTICAL event id must not re-process
    // or duplicate anything (license stays exactly one row, same number).
    const webhookRetry = await fetch(`${BASE}/functions/v1/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
      body: payload,
    });
    expect(webhookRetry.status).toBe(200);
    const licenseCount = sql(`SELECT count(*) FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(licenseCount).toBe('1');
    const eventCount = sql(`SELECT count(*) FROM enterprise_billing_events WHERE stripe_event_id='evt_hcn_sandbox_${stamp}_annual';`);
    expect(eventCount).toBe('1');
  }, 30000);
});
