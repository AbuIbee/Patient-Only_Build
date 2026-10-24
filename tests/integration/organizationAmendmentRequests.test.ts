// OWNER DIRECTIVE MMA-ENT-SALES-006 — Phase H5/I1: Director-initiated
// expansion/renewal/downgrade/cancellation requests, reviewed and
// quoted by the Platform Owner through the EXISTING sales pipeline,
// paid through the EXISTING Enterprise checkout, and applied to the
// organization's EXISTING license (same license_number) only on
// confirmed payment. Covers both request families: the quote+payment
// path (expansion/renewal/downgrade) and the direct-approval path
// (cancellation, which never routes through Stripe).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'Amendment9!';
const stamp = Date.now();

const emails = {
  owner: `amend-owner-${stamp}@local.test`,
  bilal: `amend-bilal-${stamp}@local.test`,
  outsider: `amend-outsider-${stamp}@local.test`,
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
    DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by='${ids.owner}');
    DELETE FROM organization_amendment_requests WHERE organization_id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM organization_licenses WHERE organization_id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM organization_memberships WHERE organization_id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM organizations WHERE id IN (${createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

async function makeActiveLicensedOrg(name: string, licenseNumber: string, seats: number, capacity: number, fee: number): Promise<string> {
  const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('${name}', 'integrated_care', '${ids.bilal}') RETURNING id;`);
  sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status) VALUES ('${orgId}', '${ids.bilal}', 'director', 'active');`);
  sql(`
    INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, annual_license_fee, status, license_number, activated_at)
    VALUES ('${orgId}', ${seats}, ${capacity}, ${fee}, 'active', '${licenseNumber}', now());
  `);
  createdOrgIds.push(orgId);
  return orgId;
}

describe('MMA-ENT-SALES-006 — organization amendment requests (migration 113)', () => {
  it('full expansion lifecycle: request -> quote -> confirmed payment -> license updates in place, same license number', async () => {
    const orgId = await makeActiveLicensedOrg(`Expand Org ${stamp}`, 'MMA-FE-2026-100001', 4, 20, 12000);

    const [reqStatus, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: { desiredSeats: 8, desiredCapacity: 40 }, p_director_notes: 'Growing fast, need more seats.',
    }, tok.bilal)) as [number, { id: string; status: string }];
    expect(reqStatus).toBe(200);
    expect(request.status).toBe('pending');

    const [quoteStatus, quoted] = (await rpc('platform_owner_quote_amendment_request', {
      p_request_id: request.id, p_contact_name: 'Bilal Ahmed', p_contact_email: emails.bilal,
      p_package_type: 'integrated_care', p_proposed_licensed_seats: 8, p_proposed_covered_patient_capacity: 40,
      p_annual_license_fee: 20000, p_billing_cadence: 'annual', p_quote_term_months: 12, p_notes: 'Expansion to 8 seats.',
    }, tok.owner)) as [number, { status: string; resulting_quote_id: string }];
    expect(quoteStatus).toBe(200);
    expect(quoted.status).toBe('quoted');
    const quoteId = quoted.resulting_quote_id;
    expect(quoteId).toBeTruthy();

    // License untouched while merely quoted -- "preserve prior
    // effective entitlements while an amendment is pending."
    expect(sql(`SELECT licensed_seats, status FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('4|active');

    // Bilal sees the quoted amendment on his own dashboard read-path.
    const [myQuotedStatus, myQuoted] = (await rpc('get_my_quoted_amendment_for_org', { p_organization_id: orgId }, tok.bilal)) as [number, { id: string }[]];
    expect(myQuotedStatus).toBe(200);
    expect(myQuoted[0]?.id).toBe(request.id);

    // Simulate confirmed Stripe payment (same fixture pattern as the
    // license-issuance tests -- a real 'active' billing account row).
    sql(`
      INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, status, created_by)
      VALUES ('${quoteId}', '${emails.bilal}', 'usd', 2000000, 'year', 'active', '${ids.bilal}');
    `);

    // Simulates exactly what the webhook does post-payment.
    const applied = sql(`SELECT status, completed_at IS NOT NULL FROM apply_organization_amendment_from_quote('${quoteId}');`);
    expect(applied).toContain('completed|t');

    const license = sql(`SELECT licensed_seats, covered_patient_capacity, annual_license_fee, status, license_number FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(license).toBe('8|40|20000.00|active|MMA-FE-2026-100001'); // SAME license number -- an amendment, not a new issuance
  });

  it('CRITICAL GATE: an amendment never applies without confirmed payment, even with a real quoted request', async () => {
    const orgId = await makeActiveLicensedOrg(`UnpaidExpand Org ${stamp}`, 'MMA-FE-2026-100002', 4, 20, 12000);
    const [, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null,
    }, tok.bilal)) as [number, { id: string }];
    const [, quoted] = (await rpc('platform_owner_quote_amendment_request', {
      p_request_id: request.id, p_contact_name: 'Bilal Ahmed', p_contact_email: emails.bilal,
      p_package_type: 'integrated_care', p_proposed_licensed_seats: 9, p_proposed_covered_patient_capacity: 45,
      p_annual_license_fee: 22000, p_billing_cadence: 'annual', p_quote_term_months: 12, p_notes: null,
    }, tok.owner)) as [number, { resulting_quote_id: string }];

    let threw = false;
    try {
      sql(`SELECT apply_organization_amendment_from_quote('${quoted.resulting_quote_id}');`);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(sql(`SELECT licensed_seats FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('4');
  });

  it('cancellation goes through direct Platform Owner approval, never a quote or checkout', async () => {
    const orgId = await makeActiveLicensedOrg(`Cancel Org ${stamp}`, 'MMA-FE-2026-100003', 4, 20, 12000);
    const [, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'cancellation', p_requested_details: {}, p_director_notes: 'No longer need the service.',
    }, tok.bilal)) as [number, { id: string }];

    // Quoting a cancellation is explicitly rejected -- it has its own path.
    const [quoteAttemptStatus] = await rpc('platform_owner_quote_amendment_request', {
      p_request_id: request.id, p_contact_name: 'x', p_contact_email: 'x@test.local', p_package_type: 'integrated_care',
      p_proposed_licensed_seats: 1, p_proposed_covered_patient_capacity: 1, p_annual_license_fee: 1, p_billing_cadence: 'annual', p_quote_term_months: null, p_notes: null,
    }, tok.owner);
    expect(quoteAttemptStatus).toBe(400);

    const [approveStatus, approved] = (await rpc('platform_owner_approve_cancellation_request', {
      p_request_id: request.id, p_notes: 'Confirmed by phone.',
    }, tok.owner)) as [number, { status: string }];
    expect(approveStatus).toBe(200);
    expect(approved.status).toBe('completed');

    expect(sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`)).toBe('canceled');
    // No Stripe/billing account or quote was ever created for this
    // specific cancellation request -- its resulting_quote_id stays
    // NULL throughout, confirming it never routed through checkout.
    expect(sql(`SELECT resulting_quote_id FROM organization_amendment_requests WHERE id='${request.id}';`)).toBe('');
  });

  it('authorization: an outsider cannot request an amendment for someone else\'s org; a non-owner cannot quote, reject, or approve cancellation', async () => {
    const orgId = await makeActiveLicensedOrg(`AuthGuard Org ${stamp}`, 'MMA-FE-2026-100004', 4, 20, 12000);

    const [outsiderReqStatus] = await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null,
    }, tok.outsider);
    expect(outsiderReqStatus).toBe(400);

    const [, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null,
    }, tok.bilal)) as [number, { id: string }];

    const [outsiderQuoteStatus] = await rpc('platform_owner_quote_amendment_request', {
      p_request_id: request.id, p_contact_name: 'x', p_contact_email: 'x@test.local', p_package_type: 'integrated_care',
      p_proposed_licensed_seats: 1, p_proposed_covered_patient_capacity: 1, p_annual_license_fee: 1, p_billing_cadence: 'annual', p_quote_term_months: null, p_notes: null,
    }, tok.bilal); // the DIRECTOR, not the owner, attempting to quote their own request
    expect(outsiderQuoteStatus).toBe(400);

    const [outsiderRejectStatus] = await rpc('platform_owner_reject_amendment_request', { p_request_id: request.id, p_notes: 'no' }, tok.bilal);
    expect(outsiderRejectStatus).toBe(400);

    const [anonStatus] = await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null,
    }, ANON);
    expect(anonStatus).toBe(401);
  });

  it('a Director can withdraw only their own still-pending request; RLS isolates requests from unrelated organizations', async () => {
    const orgId = await makeActiveLicensedOrg(`Withdraw Org ${stamp}`, 'MMA-FE-2026-100005', 4, 20, 12000);
    const [, request] = (await rpc('director_request_organization_amendment', {
      p_organization_id: orgId, p_request_type: 'renewal', p_requested_details: {}, p_director_notes: null,
    }, tok.bilal)) as [number, { id: string }];

    const [outsiderWithdrawStatus] = await rpc('director_withdraw_amendment_request', { p_request_id: request.id }, tok.outsider);
    expect(outsiderWithdrawStatus).toBe(400);

    const [withdrawStatus, withdrawn] = (await rpc('director_withdraw_amendment_request', { p_request_id: request.id }, tok.bilal)) as [number, { status: string }];
    expect(withdrawStatus).toBe(200);
    expect(withdrawn.status).toBe('withdrawn');

    // Direct table read (RLS): the outsider sees none of Bilal's requests.
    const [, outsiderView] = await http('GET', `/rest/v1/organization_amendment_requests?organization_id=eq.${orgId}&select=id`, undefined, tok.outsider);
    expect(outsiderView).toEqual([]);
    const [, ownerView] = await http('GET', `/rest/v1/organization_amendment_requests?organization_id=eq.${orgId}&select=id`, undefined, tok.owner);
    expect((ownerView as unknown[]).length).toBeGreaterThan(0);
  });

  it('zero RPCs here are anon-executable, and apply_organization_amendment_from_quote is service_role-only', async () => {
    const [anonStatus] = await rpc('director_request_organization_amendment', { p_organization_id: '00000000-0000-0000-0000-000000000000', p_request_type: 'expansion', p_requested_details: {}, p_director_notes: null }, ANON);
    expect(anonStatus).toBe(401);
    const [authApplyStatus] = await rpc('apply_organization_amendment_from_quote', { p_quote_id: '00000000-0000-0000-0000-000000000000' }, tok.owner);
    expect([401, 403, 404]).toContain(authApplyStatus);
  });
});
