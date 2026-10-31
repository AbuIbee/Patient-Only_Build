// Owner-approved first-of-month billing rollover correction, Issue #3
// approval comment, 2026-10-31. Pure SQL -- no Stripe call needed at
// all, since compute_next_month_billing_anchor() never talks to
// Stripe. Uses the new optional p_reference_instant parameter
// (migration 20261031000300) to deterministically exercise boundaries
// without waiting for the real calendar. Requires the local Docker
// Supabase stack; run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc } from './_runtime';

const PW = 'AnchorRollover9!';
const stamp = Date.now();
const email = `anchor-rollover-${stamp}@local.test`;
let userId: string;
let token: string;

beforeAll(async () => {
  userId = await authSignUp(email, PW);
  token = await login(email, PW);
}, 30000);

afterAll(async () => {
  await authDeleteUser(userId);
});

type Anchor = { anchor_date: string; anchor_instant: string; anchor_unix: number; rolled_over_to_month_after_next: boolean };

async function computeAnchor(referenceInstant: string, timezone = 'America/Chicago'): Promise<Anchor> {
  const [status, body] = (await rpc('compute_next_month_billing_anchor', { p_timezone: timezone, p_reference_instant: referenceInstant }, token)) as [number, Anchor[]];
  expect(status, JSON.stringify(body)).toBe(200);
  return (body as unknown as Anchor[])[0];
}

describe('compute_next_month_billing_anchor — first-of-month rollover correction (Issue #3, 2026-10-31)', () => {
  it('October 15 -> November 1 (owner example): plenty of lead time, no rollover', async () => {
    const a = await computeAnchor('2026-10-15 12:00:00-05');
    expect(a.anchor_date).toBe('2026-11-01');
    expect(a.rolled_over_to_month_after_next).toBe(false);
  });

  it('October 30 -> December 1 (owner example): next-month anchor is only 36h out, rolls over', async () => {
    const a = await computeAnchor('2026-10-30 12:00:00-05');
    expect(a.anchor_date).toBe('2026-12-01');
    expect(a.rolled_over_to_month_after_next).toBe(true);
  });

  it('October 31 -> December 1 (owner example): next-month anchor is only 12h out, rolls over', async () => {
    const a = await computeAnchor('2026-10-31 12:00:00-05');
    expect(a.anchor_date).toBe('2026-12-01');
    expect(a.rolled_over_to_month_after_next).toBe(true);
  });

  it('exactly at the 48h05m boundary rolls over (fail-safe side), one second earlier does not', async () => {
    // Nov 1 2026 00:00 America/Chicago is BEFORE that day's DST
    // fall-back (which happens at 2am local on Nov 1 2026), so it is
    // still CDT (UTC-5) = 2026-11-01T05:00:00Z. 48h05m before that is
    // 2026-10-30T04:55:00Z.
    const justInside = await computeAnchor('2026-10-30T04:56:00Z'); // 48h04m lead -- below minimum, must roll over
    expect(justInside.rolled_over_to_month_after_next).toBe(true);
    const justOutside = await computeAnchor('2026-10-30T04:54:00Z'); // 48h06m lead -- above minimum, must not roll over
    expect(justOutside.rolled_over_to_month_after_next).toBe(false);
    expect(justOutside.anchor_date).toBe('2026-11-01');
  });

  it('December 29 -> January 1 (Dec-to-Jan boundary, far enough out): no rollover needed', async () => {
    const a = await computeAnchor('2026-12-29 00:00:00-06');
    expect(a.anchor_date).toBe('2027-01-01');
    expect(a.rolled_over_to_month_after_next).toBe(false);
  });

  it('December 30 -> February 1 (Dec-to-Jan-to-Feb double rollover, non-leap year 2027)', async () => {
    const a = await computeAnchor('2026-12-30 12:00:00-06');
    expect(a.anchor_date).toBe('2027-02-01');
    expect(a.rolled_over_to_month_after_next).toBe(true);
  });

  it('December 30, 2027 -> February 1, 2028 (same double rollover, into a LEAP year February)', async () => {
    const a = await computeAnchor('2027-12-30 12:00:00-06');
    expect(a.anchor_date).toBe('2028-02-01');
    expect(a.rolled_over_to_month_after_next).toBe(true);
  });

  it('crosses a DST spring-forward transition correctly: rollover anchor lands at true local midnight, not a UTC-offset artifact', async () => {
    // America/Chicago DST begins 2026-03-08 02:00 local (CST -06 -> CDT
    // -05). Reference Feb 27 noon CST; "first of next month" (March 1,
    // still CST) is only 36h out -> rolls to April 1, which is AFTER
    // the spring-forward, so April 1 00:00 local is CDT (-05 = 05:00Z).
    const a = await computeAnchor('2026-02-27 12:00:00-06');
    expect(a.anchor_date).toBe('2026-04-01');
    expect(a.rolled_over_to_month_after_next).toBe(true);
    expect(a.anchor_instant.startsWith('2026-04-01T05:00:00')).toBe(true);
  });

  it('a stable (non-boundary) month mid-year never rolls over, confirming normal months are unaffected', async () => {
    const a = await computeAnchor('2026-06-10 09:00:00-05');
    expect(a.anchor_date).toBe('2026-07-01');
    expect(a.rolled_over_to_month_after_next).toBe(false);
  });

  it('rejects an invalid timezone (fails closed, same as before this change)', async () => {
    const [status] = await rpc('compute_next_month_billing_anchor', { p_timezone: 'Not/ARealZone', p_reference_instant: '2026-10-30 12:00:00-05' }, token);
    expect(status).toBe(400);
  });
});
