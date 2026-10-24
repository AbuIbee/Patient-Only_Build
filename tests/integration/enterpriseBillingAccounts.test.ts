// OWNER DIRECTIVE MMA-ENT-SALES-005 Phase F — enterprise organization
// billing backend (migration 110): create_enterprise_billing_account()
// / get_my_enterprise_billing_status(). Covers server-side amount/
// currency/interval derivation from the immutable quote (never trusting
// a client-supplied amount), ownership scoping, idempotent upsert, the
// cadence-mapping fail-closed path, and that this schema stays fully
// isolated from the pre-existing consumer `subscriptions` table.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'EntBilling9!';
const stamp = Date.now();

const emails = {
  owner: `ebill-owner-${stamp}@local.test`,
  applicant: `ebill-applicant-${stamp}@local.test`,
  outsider: `ebill-outsider-${stamp}@local.test`,
};
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
    DELETE FROM enterprise_billing_events WHERE billing_account_id IN (SELECT id FROM enterprise_billing_accounts WHERE created_by IN ('${ids.applicant}','${ids.outsider}'));
    DELETE FROM enterprise_billing_accounts WHERE created_by IN ('${ids.applicant}','${ids.outsider}');
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.applicant}','${ids.outsider}');
    DELETE FROM sales_quote_invitations WHERE created_by='${ids.owner}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

async function makeQuote(cadence: string | null, fee: number | null): Promise<string> {
  const [, prospect] = (await rpc(
    'platform_owner_create_prospect',
    { p_contact_name: 'Billing Test', p_contact_email: emails.applicant, p_contact_phone: null, p_prospective_organization_name: `Billing Org ${stamp}-${cadence}`, p_notes: null },
    tok.owner,
  )) as [number, { id: string }];
  const [, quote] = (await rpc(
    'platform_owner_create_quote',
    {
      p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
      p_proposed_covered_patient_capacity: 20, p_annual_license_fee: fee, p_billing_cadence: cadence,
      p_quote_term_months: null, p_discount_notes: null, p_valid_until: null,
    },
    tok.owner,
  )) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  return quote.id;
}
async function linkApplicantToQuote(userId: string, quoteId: string): Promise<void> {
  sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
    VALUES ('${userId}', 'director', 'Billing Link Org', 'integrated_care', 'Billing Applicant', 'billing-applicant@local.test', 'pending_review', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb);
  `);
}

describe('MMA-ENT-SALES-005 Phase F — enterprise billing accounts (migration 110)', () => {
  it('derives amount/currency/interval from the quote server-side -- a client-supplied amount is not even accepted as a parameter', async () => {
    const quoteId = await makeQuote('annual', 12000);
    await linkApplicantToQuote(ids.applicant, quoteId);

    const [status, account] = (await rpc(
      'create_enterprise_billing_account',
      { p_quote_id: quoteId, p_billing_contact_email: 'billing@alnoor.test' },
      tok.applicant,
    )) as [number, { quote_id: string; unit_amount_cents: number; currency: string; billing_interval: string; status: string }];
    expect(status).toBe(200);
    expect(account.quote_id).toBe(quoteId);
    expect(account.unit_amount_cents).toBe(1200000); // $12,000.00 -> cents, server-derived
    expect(account.currency).toBe('usd');
    expect(account.billing_interval).toBe('year');
    expect(account.status).toBe('pending');
  });

  it('calling it again for the same quote updates the one row, never creating a second billing account (idempotent upsert)', async () => {
    const quoteId = await makeQuote('monthly', 500);
    await linkApplicantToQuote(ids.applicant, quoteId);

    await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'first@alnoor.test' }, tok.applicant);
    const [status, account] = (await rpc(
      'create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'updated@alnoor.test' }, tok.applicant,
    )) as [number, { billing_contact_email: string; billing_interval: string }];
    expect(status).toBe(200);
    expect(account.billing_contact_email).toBe('updated@alnoor.test');
    expect(account.billing_interval).toBe('month');
    expect(sql(`SELECT count(*) FROM enterprise_billing_accounts WHERE quote_id='${quoteId}';`)).toBe('1');
  });

  it('an outsider with no application referencing this quote cannot create a billing account for it', async () => {
    const quoteId = await makeQuote('annual', 9000);
    await linkApplicantToQuote(ids.applicant, quoteId); // the quote belongs to the applicant, not the outsider
    const [status] = await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'hijack@test.local' }, tok.outsider);
    expect(status).toBe(400);
    expect(sql(`SELECT count(*) FROM enterprise_billing_accounts WHERE quote_id='${quoteId}';`)).toBe('0');
  });

  it('an unmappable billing cadence fails closed rather than guessing a Stripe interval', async () => {
    const quoteId = await makeQuote('quarterly', 3000); // Stripe recurring.interval has no "quarter" equivalent used here
    await linkApplicantToQuote(ids.applicant, quoteId);
    const [status] = await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'q@alnoor.test' }, tok.applicant);
    expect(status).toBe(400);
  });

  it('a quote with no price yet is rejected -- never defaults to a fabricated amount', async () => {
    const quoteId = await makeQuote('annual', null);
    await linkApplicantToQuote(ids.applicant, quoteId);
    const [status] = await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'nopricey@alnoor.test' }, tok.applicant);
    expect(status).toBe(400);
  });

  it('the applicant can read their own billing status; an outsider gets nothing (RLS + get_my_... both self-scope)', async () => {
    const quoteId = await makeQuote('annual', 15000);
    await linkApplicantToQuote(ids.applicant, quoteId);
    await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'read@alnoor.test' }, tok.applicant);

    const [mineStatus, mine] = (await rpc('get_my_enterprise_billing_status', { p_quote_id: quoteId }, tok.applicant)) as [number, unknown[]];
    expect(mineStatus).toBe(200);
    expect(mine).toHaveLength(1);

    const [outsiderStatus, outsiderResult] = (await rpc('get_my_enterprise_billing_status', { p_quote_id: quoteId }, tok.outsider)) as [number, unknown[]];
    expect(outsiderStatus).toBe(200);
    expect(outsiderResult).toEqual([]);

    // Direct table read (RLS), not just the RPC: same isolation.
    const [directStatus, directBody] = await http('GET', `/rest/v1/enterprise_billing_accounts?quote_id=eq.${quoteId}&select=id`, undefined, tok.outsider);
    expect(directStatus).toBe(200);
    expect(directBody).toEqual([]);
  });

  it('anonymous callers get a clean empty read, and zero RPCs here are anon-executable', async () => {
    const [status, body] = await http('GET', '/rest/v1/enterprise_billing_accounts?select=id&limit=1', undefined, ANON);
    expect(status).toBe(200);
    expect(body).toEqual([]);
    const [rpcStatus] = await rpc('create_enterprise_billing_account', { p_quote_id: '00000000-0000-0000-0000-000000000000', p_billing_contact_email: 'x@test.local' }, ANON);
    expect(rpcStatus).toBe(401);
  });

  it('this schema is fully isolated from the pre-existing consumer subscriptions table -- creating an enterprise billing account never touches it', async () => {
    const before = sql(`SELECT count(*) FROM subscriptions;`);
    const quoteId = await makeQuote('annual', 8000);
    await linkApplicantToQuote(ids.applicant, quoteId);
    await rpc('create_enterprise_billing_account', { p_quote_id: quoteId, p_billing_contact_email: 'isolated@alnoor.test' }, tok.applicant);
    const after = sql(`SELECT count(*) FROM subscriptions;`);
    expect(after).toBe(before);
  });
});
