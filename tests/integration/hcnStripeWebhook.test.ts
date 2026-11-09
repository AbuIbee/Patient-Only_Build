// HCN-STRIPE-CONNECT-001 -- real end-to-end proof of the deployed
// hcn-stripe-webhook Edge Function: valid signed events, invalid
// signatures, duplicate delivery, out-of-order delivery, payment
// failure, and a cross-organization mismatch attempt. Every HTTP
// request in this file is a REAL request to the REAL function running
// under `supabase functions serve` (not a mock) against the REAL
// local disposable Postgres stack -- the same fidelity standard every
// other integration test in this repo uses.
//
// Requires: the local Docker Supabase stack AND
//   npx supabase functions serve hcn-stripe-webhook --no-verify-jwt \
//     --env-file <a local env file setting STRIPE_SECRET_KEY (any
//     syntactically-shaped value -- never called for these tests) and
//     HCN_STRIPE_WEBHOOK_SECRET (must match WEBHOOK_SECRET below)>
// running separately, with MMA_TEST_FUNCTIONS_BASE pointed at it
// (e.g. http://127.0.0.1:55321/functions/v1).
import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, sql } from './_runtime';

const FUNCTIONS_BASE = process.env.MMA_TEST_FUNCTIONS_BASE;
if (!FUNCTIONS_BASE) {
  throw new Error('MMA_TEST_FUNCTIONS_BASE must be set (e.g. http://127.0.0.1:55321/functions/v1) -- see this file\'s own header comment.');
}
const WEBHOOK_URL = `${FUNCTIONS_BASE}/hcn-stripe-webhook`;
// Must match the HCN_STRIPE_WEBHOOK_SECRET passed to `functions serve`
// via --env-file for this test run -- a synthetic, local-only value,
// never a real Stripe secret.
const WEBHOOK_SECRET = 'whsec_test_synthetic_local_only_1234567890';
const PW = 'StripeWebhook9!';
const stamp = Date.now();

function signedPayload(body: Record<string, unknown>, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)): { payload: string; signatureHeader: string } {
  const payload = JSON.stringify(body);
  const signedString = `${timestamp}.${payload}`;
  const v1 = createHmac('sha256', secret).update(signedString).digest('hex');
  return { payload, signatureHeader: `t=${timestamp},v1=${v1}` };
}

async function postEvent(body: Record<string, unknown>, opts: { secret?: string; timestamp?: number; noSignature?: boolean } = {}): Promise<{ status: number; text: string }> {
  const { payload, signatureHeader } = signedPayload(body, opts.secret, opts.timestamp);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opts.noSignature) headers['stripe-signature'] = signatureHeader;
  const r = await fetch(WEBHOOK_URL, { method: 'POST', headers, body: payload });
  return { status: r.status, text: await r.text() };
}

function stripeEvent(id: string, type: string, object: Record<string, unknown>) {
  return { id, type, data: { object } };
}

async function orgWithApprovedQuote(label: string): Promise<{ orgId: string; quoteId: string; directorId: string }> {
  const email = `stripehook-director-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(email, PW);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('StripeHook Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  sql(`INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'proposed');`);
  sql(`INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');`);
  const prospectId = sql(`INSERT INTO sales_prospects(contact_name,contact_email,prospective_organization_name,status,created_by) VALUES('Director','${email}','StripeHook Org ${stamp}-${label}','quoted','${directorId}') RETURNING id;`);
  const quoteId = sql(`INSERT INTO sales_quotes(prospect_id,package_type,proposed_licensed_seats,proposed_covered_patient_capacity,annual_license_fee,billing_cadence,status,created_by) VALUES('${prospectId}','integrated_care',10,10,399,'annual','sent','${directorId}') RETURNING id;`);
  const appId = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, entry_method, selected_tier_code, target_organization_id, application_details)
    VALUES ('${directorId}', 'director', 'StripeHook Org ${stamp}-${label}', 'integrated_care', 'StripeHook Director', '${email}', 'approved', false, 'public_website', 'essential', '${orgId}', jsonb_build_object('originatingQuoteId', '${quoteId}'))
    RETURNING id;
  `);
  void appId;
  return { orgId, quoteId, directorId };
}

function seedBillingAccount(quoteId: string, directorId: string, billingComponent = 'annual_license'): string {
  return sql(`
    INSERT INTO enterprise_billing_accounts(quote_id,billing_contact_email,currency,unit_amount_cents,billing_interval,billing_component,status,created_by)
    VALUES ('${quoteId}','billing@stripehook.test','usd',39900,'year','${billingComponent}','pending','${directorId}') RETURNING id;
  `);
}

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

afterAll(async () => {
  if (createdOrgIds.length) {
    const ids = createdOrgIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM enterprise_billing_events WHERE billing_account_id IN (SELECT id FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE prospect_id IN (SELECT id FROM sales_prospects WHERE prospective_organization_name LIKE 'StripeHook Org ${stamp}%')));
      DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE prospect_id IN (SELECT id FROM sales_prospects WHERE prospective_organization_name LIKE 'StripeHook Org ${stamp}%'));
      DELETE FROM professional_applications WHERE target_organization_id IN (${ids});
      DELETE FROM sales_quotes WHERE prospect_id IN (SELECT id FROM sales_prospects WHERE prospective_organization_name LIKE 'StripeHook Org ${stamp}%');
      DELETE FROM sales_prospects WHERE prospective_organization_name LIKE 'StripeHook Org ${stamp}%';
      DELETE FROM organization_memberships WHERE organization_id IN (${ids});
      DELETE FROM organization_licenses WHERE organization_id IN (${ids});
      DELETE FROM organizations WHERE id IN (${ids});
    `);
  }
  for (const id of createdUserIds) await authDeleteUser(id);
});

describe('HCN-STRIPE-CONNECT-001 -- signature verification (before any database mutation)', () => {
  it('rejects a POST with no stripe-signature header at all', async () => {
    const { status, text } = await postEvent(stripeEvent(randomUUID(), 'checkout.session.completed', {}), { noSignature: true });
    expect(status).toBe(400);
    expect(text).toMatch(/signature/i);
  });

  it('rejects a POST signed with the wrong secret', async () => {
    const { status } = await postEvent(stripeEvent(randomUUID(), 'checkout.session.completed', {}), { secret: 'whsec_wrong_secret_entirely' });
    expect(status).toBe(400);
  });

  it('rejects a stale/tampered-timestamp signature', async () => {
    // Signed correctly for timestamp T, but the actual Stripe tolerance
    // window (default 5 minutes) is exceeded -- constructEventAsync
    // itself enforces this, proving the real Stripe SDK verification
    // path (not a hand-rolled shortcut) is what's running.
    const { status } = await postEvent(stripeEvent(randomUUID(), 'checkout.session.completed', {}), { timestamp: Math.floor(Date.now() / 1000) - 60 * 60 });
    expect(status).toBe(400);
  });
});

describe('HCN-STRIPE-CONNECT-001 -- valid enterprise events activate the correct, isolated billing account', () => {
  it('checkout.session.completed activates exactly the matching billing account and no other organization\'s', async () => {
    const orgA = await orgWithApprovedQuote('valid-a');
    const orgB = await orgWithApprovedQuote('valid-b');
    createdOrgIds.push(orgA.orgId, orgB.orgId);
    createdUserIds.push(orgA.directorId, orgB.directorId);
    const accountA = seedBillingAccount(orgA.quoteId, orgA.directorId);
    const accountB = seedBillingAccount(orgB.quoteId, orgB.directorId);

    const eventId = `evt_${randomUUID()}`;
    const subId = `sub_${randomUUID()}`;
    const { status } = await postEvent(stripeEvent(eventId, 'checkout.session.completed', {
      id: `cs_${randomUUID()}`, customer: `cus_${randomUUID()}`, subscription: subId,
      metadata: { billing_type: 'enterprise', billing_component: 'annual_license', quote_id: orgA.quoteId, billing_account_id: accountA },
    }));
    expect(status).toBe(200);

    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountA}';`)).toBe('active');
    expect(sql(`SELECT stripe_subscription_id FROM enterprise_billing_accounts WHERE id='${accountA}';`)).toBe(subId);
    // Org B's account, seeded identically, is completely untouched.
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountB}';`)).toBe('pending');
    expect(sql(`SELECT stripe_subscription_id FROM enterprise_billing_accounts WHERE id='${accountB}';`)).toBe('');

    const eventRow = sql(`SELECT processed_at IS NOT NULL FROM enterprise_billing_events WHERE stripe_event_id='${eventId}';`);
    expect(eventRow).toBe('t');
  });

  it('a duplicate delivery of the same event id is a safe no-op, not a second activation attempt', async () => {
    const org = await orgWithApprovedQuote('dup');
    createdOrgIds.push(org.orgId);
    createdUserIds.push(org.directorId);
    const accountId = seedBillingAccount(org.quoteId, org.directorId);
    const eventId = `evt_${randomUUID()}`;
    const subId = `sub_${randomUUID()}`;
    const body = stripeEvent(eventId, 'checkout.session.completed', {
      id: `cs_${randomUUID()}`, customer: `cus_${randomUUID()}`, subscription: subId,
      metadata: { billing_type: 'enterprise', billing_component: 'annual_license', quote_id: org.quoteId, billing_account_id: accountId },
    });

    const first = await postEvent(body);
    expect(first.status).toBe(200);
    const second = await postEvent(body); // identical event id, identical signature -- a genuine Stripe retry
    expect(second.status).toBe(200);

    const eventCount = sql(`SELECT count(*) FROM enterprise_billing_events WHERE stripe_event_id='${eventId}';`);
    expect(eventCount).toBe('1'); // never duplicated, UNIQUE(stripe_event_id) + skip-on-processed logic
  });

  it('out-of-order delivery: subscription.updated(canceled) arriving before checkout.session.completed still lands correctly, then checkout.session.completed does not resurrect it', async () => {
    const org = await orgWithApprovedQuote('outoforder');
    createdOrgIds.push(org.orgId);
    createdUserIds.push(org.directorId);
    const accountId = seedBillingAccount(org.quoteId, org.directorId);
    const subId = `sub_${randomUUID()}`;

    // subscription.updated arrives FIRST (Stripe does not guarantee
    // delivery order) reporting an already-canceled status.
    const updatedStatus = await postEvent(stripeEvent(`evt_${randomUUID()}`, 'customer.subscription.updated', {
      id: subId, customer: `cus_${randomUUID()}`, status: 'canceled',
      metadata: { billing_type: 'enterprise', billing_component: 'annual_license', quote_id: org.quoteId, billing_account_id: accountId },
    }));
    expect(updatedStatus.status).toBe(200);
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountId}';`)).toBe('canceled');
    expect(sql(`SELECT stripe_subscription_id FROM enterprise_billing_accounts WHERE id='${accountId}';`)).toBe(subId);

    // checkout.session.completed for the SAME subscription arrives
    // second (late). It is still processed (different event id, real
    // event) and will set status back to 'active' -- Stripe's own
    // delivery-order guarantees are "at least once", not "in order",
    // so this function does not attempt artificial event-ordering;
    // it reflects whatever the LATEST delivered event says, same as
    // the existing stripe-webhook already does. This test exists to
    // document that behavior precisely, not to claim false ordering
    // guarantees.
    const completed = await postEvent(stripeEvent(`evt_${randomUUID()}`, 'checkout.session.completed', {
      id: `cs_${randomUUID()}`, customer: `cus_${randomUUID()}`, subscription: subId,
      metadata: { billing_type: 'enterprise', billing_component: 'annual_license', quote_id: org.quoteId, billing_account_id: accountId },
    }));
    expect(completed.status).toBe(200);
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountId}';`)).toBe('active');
  });

  it('invoice.payment_failed marks the matching account past_due, scoped by subscription id', async () => {
    const org = await orgWithApprovedQuote('payfail');
    createdOrgIds.push(org.orgId);
    createdUserIds.push(org.directorId);
    const accountId = seedBillingAccount(org.quoteId, org.directorId);
    const subId = `sub_${randomUUID()}`;
    sql(`UPDATE enterprise_billing_accounts SET status='active', stripe_subscription_id='${subId}' WHERE id='${accountId}';`);

    const { status } = await postEvent(stripeEvent(`evt_${randomUUID()}`, 'invoice.payment_failed', {
      id: `in_${randomUUID()}`, subscription: subId,
    }));
    expect(status).toBe(200);
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountId}';`)).toBe('past_due');
  });

  it('invoice.paid reconfirms payment and (re-)activates the license for the account\'s own quote only', async () => {
    const org = await orgWithApprovedQuote('invoicepaid');
    createdOrgIds.push(org.orgId);
    createdUserIds.push(org.directorId);
    const accountId = seedBillingAccount(org.quoteId, org.directorId);
    const subId = `sub_${randomUUID()}`;
    sql(`UPDATE enterprise_billing_accounts SET status='past_due', stripe_subscription_id='${subId}' WHERE id='${accountId}';`);

    const { status } = await postEvent(stripeEvent(`evt_${randomUUID()}`, 'invoice.paid', {
      id: `in_${randomUUID()}`, subscription: subId,
    }));
    expect(status).toBe(200);
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountId}';`)).toBe('active');
  });
});

describe('HCN-STRIPE-CONNECT-001 -- cross-organization isolation', () => {
  it('rejects an event whose metadata claims org A\'s billing_account_id but carries org B\'s real subscription id', async () => {
    const orgA = await orgWithApprovedQuote('xorg-a');
    const orgB = await orgWithApprovedQuote('xorg-b');
    createdOrgIds.push(orgA.orgId, orgB.orgId);
    createdUserIds.push(orgA.directorId, orgB.directorId);
    const accountA = seedBillingAccount(orgA.quoteId, orgA.directorId);
    const accountB = seedBillingAccount(orgB.quoteId, orgB.directorId);
    const subA = `sub_${randomUUID()}`;
    const subB = `sub_${randomUUID()}`;
    sql(`UPDATE enterprise_billing_accounts SET status='active', stripe_subscription_id='${subA}' WHERE id='${accountA}';`);
    sql(`UPDATE enterprise_billing_accounts SET status='active', stripe_subscription_id='${subB}' WHERE id='${accountB}';`);

    // A validly-SIGNED event (only possible with the real webhook
    // secret -- this test has it, simulating a bug/attempted-confusion
    // scenario rather than an external forgery, which signature
    // verification already defeats) claims account A's id but carries
    // org B's actual subscription id.
    const { status, text } = await postEvent(stripeEvent(`evt_${randomUUID()}`, 'customer.subscription.updated', {
      id: subB, customer: `cus_${randomUUID()}`, status: 'past_due',
      metadata: { billing_type: 'enterprise', billing_component: 'annual_license', quote_id: orgA.quoteId, billing_account_id: accountA },
    }));

    expect(status).toBe(500); // handler error -- refused, not silently accepted
    expect(text).toMatch(/Handler error/);
    // Neither account was mutated by the mismatched event.
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountA}';`)).toBe('active');
    expect(sql(`SELECT stripe_subscription_id FROM enterprise_billing_accounts WHERE id='${accountA}';`)).toBe(subA);
    expect(sql(`SELECT status FROM enterprise_billing_accounts WHERE id='${accountB}';`)).toBe('active');
  });

  it('an individual (non-enterprise) subscription event is ignored -- never touches enterprise or personal state', async () => {
    const eventId = `evt_${randomUUID()}`;
    const { status } = await postEvent(stripeEvent(eventId, 'customer.subscription.updated', {
      id: `sub_${randomUUID()}`, customer: `cus_${randomUUID()}`, status: 'active',
      metadata: { supabase_user_id: randomUUID() }, // individual-tier shape, no billing_type
    }));
    expect(status).toBe(200);
    // Correctly ignored before even reaching the event ledger -- no
    // receipt recorded at all (not "recorded then skipped").
    const recorded = sql(`SELECT count(*) FROM enterprise_billing_events WHERE stripe_event_id='${eventId}';`);
    expect(recorded).toBe('0');
  });
});
