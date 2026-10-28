// MMA-PROF-ONBOARD-004 P0-2 Phase 1 -- the commercial catalog (migration
// 161): three license tiers, two WELCOME coupons, the monthly
// active-patient pricing formula, and coupon redemption integrity
// (one-per-application, concurrency-safe, limits/expiry/pause/revoke
// all enforced server-side). Requires the local Docker Supabase stack.
// Run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANON, authDeleteUser, authSignUp, http, login, rpc, sql } from './_runtime';

const PW = 'Catalog9!';
const stamp = Date.now();
const emails = {
  owner: `catalog-owner-${stamp}@local.test`,
  bilal: `catalog-bilal-${stamp}@local.test`,
  outsider: `catalog-outsider-${stamp}@local.test`,
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
    DELETE FROM enterprise_coupon_redemptions WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN ('${ids.bilal}','${ids.outsider}'));
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.bilal}','${ids.outsider}');
    DELETE FROM promo_coupon_catalog WHERE code LIKE 'TESTCOUP%';
    DELETE FROM license_tier_catalog_history WHERE superseded_by = '${ids.owner}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

async function makeApplication(userId: string, token: string, orgName: string): Promise<string> {
  const id = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required)
    VALUES ('${userId}', 'director', '${orgName}', 'integrated_care', 'Catalog Test Applicant', '${emails.bilal}', 'pending_review', true)
    RETURNING id;
  `);
  return id;
}

describe('MMA-PROF-ONBOARD-004 commercial catalog (migration 161)', () => {
  it('publishes the three exact owner-approved tiers, readable by an anonymous visitor', async () => {
    const [status, body] = await http('GET', '/rest/v1/license_tier_catalog?select=tier_code,annual_fee_cents,specialist_slot_count&order=annual_fee_cents.asc', undefined, ANON);
    expect(status).toBe(200);
    expect(body).toEqual([
      { tier_code: 'essential', annual_fee_cents: 39900, specialist_slot_count: 0 },
      { tier_code: 'plus', annual_fee_cents: 59900, specialist_slot_count: 1 },
      { tier_code: 'complete', annual_fee_cents: 79900, specialist_slot_count: 2 },
    ]);
  });

  it('computes the exact monthly active-patient fee at every required boundary', async () => {
    const cases: [number, number | null][] = [
      [0, 25000], [15, 25000], [16, 25800], [50, 53000], [51, 53500],
      [250, 153000], [251, 153400], [500, 253000], [501, 253250], [1000, 378000], [1001, null],
    ];
    for (const [n, expected] of cases) {
      const [, result] = await rpc('calculate_monthly_patient_fee_cents', { p_active_patients: n }, tok.bilal);
      expect(result, `n=${n}`).toBe(expected);
    }
  });

  it('rejects a negative active-patient count rather than guessing', async () => {
    const [status] = await rpc('calculate_monthly_patient_fee_cents', { p_active_patients: -1 }, tok.bilal);
    expect(status).toBe(400);
  });

  it('computes the exact annual charge for every tier under both coupons', async () => {
    const matrix: [string, string | null, number][] = [
      ['essential', null, 39900], ['essential', 'WELCOME100', 0], ['essential', 'WELCOME50', 19900],
      ['plus', null, 59900], ['plus', 'WELCOME100', 0], ['plus', 'WELCOME50', 29900],
      ['complete', null, 79900], ['complete', 'WELCOME100', 0], ['complete', 'WELCOME50', 39900],
    ];
    for (const [tier, coupon, expected] of matrix) {
      const [, result] = (await rpc('calculate_annual_license_charge', { p_tier_code: tier, p_coupon_code: coupon }, tok.bilal)) as [number, { final_cents: number }[]];
      expect(result[0].final_cents, `${tier}/${coupon}`).toBe(expected);
    }
  });

  it('a bad or inactive coupon code falls back to full price with a clear reason, never an error or a silent discount', async () => {
    const [, result] = (await rpc('calculate_annual_license_charge', { p_tier_code: 'essential', p_coupon_code: 'NOT-A-REAL-CODE' }, tok.bilal)) as [number, { final_cents: number; coupon_rejected_reason: string }[]];
    expect(result[0].final_cents).toBe(39900);
    expect(result[0].coupon_rejected_reason).toMatch(/not valid/i);
  });

  it('redeems WELCOME50 exactly once for an application, idempotently, and blocks a second application from reusing it beyond its limit', async () => {
    sql(`INSERT INTO promo_coupon_catalog (code, discount_kind, max_redemptions_total, created_by) VALUES ('TESTCOUP-LIMIT1', 'half_off_minus_fifty_cents', 1, '${ids.owner}');`);
    const appId = await makeApplication(ids.bilal, tok.bilal, `Catalog Org Bilal ${stamp}`);
    const otherAppId = await makeApplication(ids.outsider, tok.outsider, `Catalog Org Outsider ${stamp}`);

    const [status1, redemption1] = (await rpc('redeem_coupon_for_application', { p_application_id: appId, p_tier_code: 'plus', p_coupon_code: 'TESTCOUP-LIMIT1' }, tok.bilal)) as [number, { final_cents: number }];
    expect(status1).toBe(200);
    expect(redemption1.final_cents).toBe(29900);

    // Idempotent retry: same application, same coupon -- returns the
    // SAME redemption, does not consume a second slot.
    const [status2, redemption2] = (await rpc('redeem_coupon_for_application', { p_application_id: appId, p_tier_code: 'plus', p_coupon_code: 'TESTCOUP-LIMIT1' }, tok.bilal)) as [number, { final_cents: number }];
    expect(status2).toBe(200);
    expect(redemption2.final_cents).toBe(29900);
    const usedAfterRetry = sql(`SELECT redemptions_used FROM promo_coupon_catalog WHERE code='TESTCOUP-LIMIT1';`);
    expect(usedAfterRetry).toBe('1');

    // A DIFFERENT application hits the exhausted limit and is rejected.
    const [status3] = await rpc('redeem_coupon_for_application', { p_application_id: otherAppId, p_tier_code: 'plus', p_coupon_code: 'TESTCOUP-LIMIT1' }, tok.outsider);
    expect(status3).toBe(400);
  });

  it('two different applications racing for the SAME single remaining redemption slot: exactly one wins, never both', async () => {
    sql(`INSERT INTO promo_coupon_catalog (code, discount_kind, max_redemptions_total, created_by) VALUES ('TESTCOUP-RACE', 'full_waiver', 1, '${ids.owner}');`);
    const appA = await makeApplication(ids.bilal, tok.bilal, `Catalog Race A ${stamp}`);
    const appB = await makeApplication(ids.outsider, tok.outsider, `Catalog Race B ${stamp}`);

    const [resultA, resultB] = await Promise.all([
      rpc('redeem_coupon_for_application', { p_application_id: appA, p_tier_code: 'essential', p_coupon_code: 'TESTCOUP-RACE' }, tok.bilal),
      rpc('redeem_coupon_for_application', { p_application_id: appB, p_tier_code: 'essential', p_coupon_code: 'TESTCOUP-RACE' }, tok.outsider),
    ]);
    const statuses = [resultA[0], resultB[0]].sort();
    expect(statuses).toEqual([200, 400]);

    const usedCount = sql(`SELECT redemptions_used FROM promo_coupon_catalog WHERE code='TESTCOUP-RACE';`);
    expect(usedCount).toBe('1');
    const redemptionRows = sql(`SELECT count(*) FROM enterprise_coupon_redemptions WHERE coupon_code='TESTCOUP-RACE';`);
    expect(redemptionRows).toBe('1');
  });

  it('a paused coupon cannot be redeemed, but resumes working once set back to active', async () => {
    sql(`INSERT INTO promo_coupon_catalog (code, discount_kind, created_by) VALUES ('TESTCOUP-PAUSE', 'full_waiver', '${ids.owner}');`);
    const appId = await makeApplication(ids.bilal, tok.bilal, `Catalog Org Pause ${stamp}`);

    await rpc('platform_owner_set_coupon_status', { p_code: 'TESTCOUP-PAUSE', p_status: 'paused' }, tok.owner);
    const [statusPaused] = await rpc('redeem_coupon_for_application', { p_application_id: appId, p_tier_code: 'essential', p_coupon_code: 'TESTCOUP-PAUSE' }, tok.bilal);
    expect(statusPaused).toBe(400);

    await rpc('platform_owner_set_coupon_status', { p_code: 'TESTCOUP-PAUSE', p_status: 'active' }, tok.owner);
    const [statusActive, redemption] = (await rpc('redeem_coupon_for_application', { p_application_id: appId, p_tier_code: 'essential', p_coupon_code: 'TESTCOUP-PAUSE' }, tok.bilal)) as [number, { final_cents: number }];
    expect(statusActive).toBe(200);
    expect(redemption.final_cents).toBe(0);
  });

  it('an expired coupon cannot be redeemed', async () => {
    sql(`INSERT INTO promo_coupon_catalog (code, discount_kind, expires_at, created_by) VALUES ('TESTCOUP-EXPIRED', 'full_waiver', now() - interval '1 day', '${ids.owner}');`);
    const appId = await makeApplication(ids.bilal, tok.bilal, `Catalog Org Expired ${stamp}`);
    const [status] = await rpc('redeem_coupon_for_application', { p_application_id: appId, p_tier_code: 'essential', p_coupon_code: 'TESTCOUP-EXPIRED' }, tok.bilal);
    expect(status).toBe(400);
  });

  it('an ordinary authenticated user cannot read the coupon catalog or change tier prices (Platform-Owner-only surfaces)', async () => {
    const [listStatus, rows] = await http('GET', '/rest/v1/promo_coupon_catalog?select=code', undefined, tok.bilal);
    expect(listStatus).toBe(200);
    expect(rows).toEqual([]);

    const [priceChangeStatus] = await rpc('platform_owner_set_license_tier_price', { p_tier_code: 'essential', p_display_name: 'Essential', p_annual_fee_cents: 1, p_specialist_slot_count: 0 }, tok.bilal);
    expect(priceChangeStatus).toBe(400);
  });

  it('the Platform Owner changing a tier price preserves the prior version in history, never silently losing it', async () => {
    const before = sql(`SELECT version FROM license_tier_catalog WHERE tier_code='essential';`);
    const [status] = await rpc('platform_owner_set_license_tier_price', { p_tier_code: 'essential', p_display_name: 'Essential', p_annual_fee_cents: 39900, p_specialist_slot_count: 0 }, tok.owner);
    expect(status).toBe(200);
    const after = sql(`SELECT version FROM license_tier_catalog WHERE tier_code='essential';`);
    expect(Number(after)).toBe(Number(before) + 1);
    const historyCount = sql(`SELECT count(*) FROM license_tier_catalog_history WHERE tier_code='essential' AND superseded_by='${ids.owner}';`);
    expect(Number(historyCount)).toBeGreaterThan(0);
  });
});
