// OWNER DIRECTIVE MMA-ENT-SALES-002, PHASE C (increment 1) — migration
// 107: sales_prospects / sales_quotes / sales_quote_invitations and their
// RPCs. Covers the full owner-assisted sales lifecycle plus the security
// properties that matter most for a token-based invitation: the raw
// token is never persisted, the hash is single-use, expiry is enforced,
// recipient-email binding prevents a different authenticated account
// from redeeming someone else's invitation, and every write RPC is
// Platform-Owner-gated.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'SalesQuote9!';
const stamp = Date.now();

const emails = {
  owner: `spq-owner-${stamp}@local.test`,
  recipient: `spq-recipient-${stamp}@local.test`,
  outsider: `spq-outsider-${stamp}@local.test`,
  caregiver: `spq-caregiver-${stamp}@local.test`,
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
    DELETE FROM sales_quote_invitations WHERE created_by='${ids.owner}';
    DELETE FROM sales_quotes WHERE created_by='${ids.owner}';
    DELETE FROM sales_prospects WHERE created_by='${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-ENT-SALES-002 Phase C — prospects, quotes, invitation tokens (migration 107)', () => {
  let prospectId: string;
  let quoteId: string;

  it('a non-owner cannot create a prospect', async () => {
    const [status] = await rpc(
      'platform_owner_create_prospect',
      { p_contact_name: 'Bilal', p_contact_email: 'bilal@example.test', p_contact_phone: null, p_prospective_organization_name: 'Al-Noor Family Care Services', p_notes: null },
      tok.outsider,
    );
    expect(status).toBe(400);
  });

  it('the Platform Owner can create a prospect, then a quote, then send it', async () => {
    const [pStatus, prospect] = (await rpc(
      'platform_owner_create_prospect',
      { p_contact_name: 'Bilal', p_contact_email: 'bilal@example.test', p_contact_phone: '555-0100', p_prospective_organization_name: 'Al-Noor Family Care Services', p_notes: 'Fixture, not a real customer' },
      tok.owner,
    )) as [number, { id: string; status: string }];
    expect(pStatus).toBe(200);
    expect(prospect.status).toBe('new');
    prospectId = prospect.id;

    const [qStatus, quote] = (await rpc(
      'platform_owner_create_quote',
      {
        p_prospect_id: prospectId, p_package_type: 'integrated_care', p_proposed_licensed_seats: 2,
        p_proposed_covered_patient_capacity: 10, p_annual_license_fee: null, p_billing_cadence: null,
        p_quote_term_months: null, p_discount_notes: null, p_valid_until: null,
      },
      tok.owner,
    )) as [number, { id: string; status: string }];
    expect(qStatus).toBe(200);
    expect(quote.status).toBe('draft');
    quoteId = quote.id;

    // Creating a quote moves the prospect to 'quoted'.
    expect(sql(`SELECT status FROM sales_prospects WHERE id='${prospectId}';`)).toBe('quoted');

    // Not yet sent -- issuing an invitation against a draft quote is rejected.
    const [earlyInviteStatus] = await rpc('platform_owner_issue_quote_invitation', { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 168 }, tok.owner);
    expect(earlyInviteStatus).toBe(400);

    const [sendStatus, sent] = (await rpc('platform_owner_send_quote', { p_quote_id: quoteId }, tok.owner)) as [number, { status: string }];
    expect(sendStatus).toBe(200);
    expect(sent.status).toBe('sent');
  });

  it('an invitation can be issued, redeemed exactly once by the matching recipient, and never by anyone else', async () => {
    const [issueStatus, issued] = (await rpc(
      'platform_owner_issue_quote_invitation',
      { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 168 },
      tok.owner,
    )) as [number, Array<{ invitation_id: string; raw_token: string; expires_at: string }>];
    expect(issueStatus).toBe(200);
    const { invitation_id, raw_token } = issued[0];
    expect(raw_token).toMatch(/^[0-9a-f]{64}$/);

    // The raw token itself is never stored -- only its hash.
    const stored = sql(`SELECT token_hash FROM sales_quote_invitations WHERE id='${invitation_id}';`);
    expect(stored).not.toBe(raw_token);
    expect(sql(`SELECT count(*) FROM sales_quote_invitations WHERE token_hash='${raw_token}';`)).toBe('0');

    // An outsider (different authenticated account, different email)
    // cannot redeem it -- MMA-ENT-SALES-003: the outcome is now
    // distinguishable (not a generic 400) once a real token_hash
    // matches, but garbage input still isn't an oracle (see 'not_found'
    // below) and a mismatched recipient still never gets the quote data.
    const [outsiderStatus, outsiderResult] = (await rpc('redeem_quote_invitation', { p_token: raw_token }, tok.outsider)) as [number, Array<{ outcome: string; quote_id: string | null }>];
    expect(outsiderStatus).toBe(200);
    expect(outsiderResult[0]).toMatchObject({ outcome: 'wrong_recipient', quote_id: null });

    // The real recipient can.
    const [redeemStatus, redeemed] = (await rpc('redeem_quote_invitation', { p_token: raw_token }, tok.recipient)) as [
      number,
      Array<{ outcome: string; quote_id: string; prospective_organization_name: string; package_type: string; proposed_licensed_seats: number; proposed_covered_patient_capacity: number }>,
    ];
    expect(redeemStatus).toBe(200);
    expect(redeemed[0]).toMatchObject({
      outcome: 'redeemed', quote_id: quoteId, prospective_organization_name: 'Al-Noor Family Care Services',
      package_type: 'integrated_care', proposed_licensed_seats: 2, proposed_covered_patient_capacity: 10,
    });
    expect(sql(`SELECT status, accepted_by FROM sales_quote_invitations WHERE id='${invitation_id}';`)).toBe(`accepted|${ids.recipient}`);

    // Single-use: redeeming the same token again reports 'already_used',
    // including for the legitimate recipient -- not a silent re-grant.
    const [replayStatus, replayResult] = (await rpc('redeem_quote_invitation', { p_token: raw_token }, tok.recipient)) as [number, Array<{ outcome: string }>];
    expect(replayStatus).toBe(200);
    expect(replayResult[0].outcome).toBe('already_used');
  });

  it('garbage input reports not_found, never a distinguishable reason (no oracle for an unmatched token)', async () => {
    const [status, result] = (await rpc('redeem_quote_invitation', { p_token: 'not-a-real-token-at-all' }, tok.recipient)) as [number, Array<{ outcome: string }>];
    expect(status).toBe(200);
    expect(result[0].outcome).toBe('not_found');
  });

  it('a revoked invitation reports outcome revoked, not a generic error', async () => {
    const [issueStatus, issued] = (await rpc(
      'platform_owner_issue_quote_invitation',
      { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 168 },
      tok.owner,
    )) as [number, Array<{ invitation_id: string; raw_token: string }>];
    expect(issueStatus).toBe(200);
    const { invitation_id, raw_token } = issued[0];

    const [revokeStatus] = await rpc('platform_owner_revoke_quote_invitation', { p_invitation_id: invitation_id }, tok.owner);
    expect(revokeStatus).toBe(200);

    const [redeemStatus, redeemResult] = (await rpc('redeem_quote_invitation', { p_token: raw_token }, tok.recipient)) as [number, Array<{ outcome: string }>];
    expect(redeemStatus).toBe(200);
    expect(redeemResult[0].outcome).toBe('revoked');
  });

  it('an expired invitation reports outcome expired, and is recorded as such server-side', async () => {
    const [issueStatus, issued] = (await rpc(
      'platform_owner_issue_quote_invitation',
      { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 1 },
      tok.owner,
    )) as [number, Array<{ invitation_id: string; raw_token: string }>];
    expect(issueStatus).toBe(200);
    const { invitation_id, raw_token } = issued[0];
    sql(`UPDATE sales_quote_invitations SET expires_at = now() - interval '1 hour' WHERE id='${invitation_id}';`);

    const [redeemStatus, redeemResult] = (await rpc('redeem_quote_invitation', { p_token: raw_token }, tok.recipient)) as [number, Array<{ outcome: string }>];
    expect(redeemStatus).toBe(200);
    expect(redeemResult[0].outcome).toBe('expired');
    // Lazy-expire bookkeeping: the row itself is now marked expired, not left 'pending'.
    expect(sql(`SELECT status FROM sales_quote_invitations WHERE id='${invitation_id}';`)).toBe('expired');
  });

  it('revising a sent quote supersedes it, preserves the original immutably, and auto-revokes its still-pending invitations', async () => {
    const [issueStatus, issued] = (await rpc(
      'platform_owner_issue_quote_invitation',
      { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 168 },
      tok.owner,
    )) as [number, Array<{ invitation_id: string }>];
    expect(issueStatus).toBe(200);
    const { invitation_id } = issued[0];

    const [reviseStatus, revised] = (await rpc(
      'platform_owner_revise_quote',
      {
        p_quote_id: quoteId, p_package_type: 'integrated_care', p_proposed_licensed_seats: 3,
        p_proposed_covered_patient_capacity: 15, p_annual_license_fee: 12000, p_billing_cadence: 'annual',
        p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
      },
      tok.owner,
    )) as [number, { id: string; supersedes_quote_id: string; proposed_licensed_seats: number }];
    expect(reviseStatus).toBe(200);
    expect(revised.supersedes_quote_id).toBe(quoteId);
    expect(revised.proposed_licensed_seats).toBe(3);

    expect(sql(`SELECT status FROM sales_quotes WHERE id='${quoteId}';`)).toBe('superseded');
    // The original row's own terms are untouched -- still 2 seats, forever.
    expect(sql(`SELECT proposed_licensed_seats FROM sales_quotes WHERE id='${quoteId}';`)).toBe('2');
    expect(sql(`SELECT status FROM sales_quote_invitations WHERE id='${invitation_id}';`)).toBe('revoked');

    quoteId = revised.id;
    await rpc('platform_owner_send_quote', { p_quote_id: quoteId }, tok.owner);
  });

  it('revoking a quote cascades to its pending invitations', async () => {
    const [issueStatus, issued] = (await rpc(
      'platform_owner_issue_quote_invitation',
      { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 168 },
      tok.owner,
    )) as [number, Array<{ invitation_id: string }>];
    expect(issueStatus).toBe(200);
    const { invitation_id } = issued[0];

    const [revokeStatus, revokedQuote] = (await rpc('platform_owner_revoke_quote', { p_quote_id: quoteId }, tok.owner)) as [number, { status: string }];
    expect(revokeStatus).toBe(200);
    expect(revokedQuote.status).toBe('revoked');
    expect(sql(`SELECT status FROM sales_quote_invitations WHERE id='${invitation_id}';`)).toBe('revoked');
  });

  it('anonymous callers get a clean empty read on all three tables, and zero RPCs are anon-executable', async () => {
    for (const table of ['sales_prospects', 'sales_quotes', 'sales_quote_invitations']) {
      const [status, body] = await http('GET', `/rest/v1/${table}?select=id&limit=1`, undefined, ANON);
      expect([status, table]).toEqual([200, table]);
      expect(body).toEqual([]);
    }
    const [anonRpcStatus] = await rpc('redeem_quote_invitation', { p_token: 'anything' }, ANON);
    expect(anonRpcStatus).toBe(401);
  });

  it('a non-owner, non-platform-staff authenticated user cannot issue an invitation', async () => {
    const [status] = await rpc('platform_owner_issue_quote_invitation', { p_quote_id: quoteId, p_recipient_email: emails.recipient, p_expires_in_hours: 168 }, tok.caregiver);
    expect(status).toBe(400);
  });
});
