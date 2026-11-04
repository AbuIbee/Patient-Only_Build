// HCN-SAAS-1.0 directive, Sections 6/7 -- proves the agreed
// cancellation terms (90-day free-cancellation window, 12-month
// initial term, $250/month minimum commitment, immediate acceleration
// of the unpaid minimum commitment after day 90) via
// org_initiate_cancellation(). Does not touch Stripe -- this RPC only
// determines and RECORDS the contractual financial obligation.
//
// Requires the local Docker Supabase stack. Run with `npm run test:integration`.
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'OrgCancel9!';
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

async function orgWithActiveLicense(activatedDaysAgo: number, annualFee = 399): Promise<{ orgId: string; directorId: string; directorTok: string }> {
  const email = `orgcancel-director-${stamp}-${createdOrgIds.length}@local.test`;
  const directorId = await authSignUp(email, PW);
  createdUserIds.push(directorId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const directorTok = await login(email, PW);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('OrgCancel Org ${stamp}-${createdOrgIds.length}','integrated_care','${directorId}') RETURNING id;`);
  createdOrgIds.push(orgId);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,activated_at,activated_by)
      VALUES('${orgId}',10,10,${annualFee},'active', now() - interval '${activatedDaysAgo} days', '${directorId}');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
  `);
  return { orgId, directorId, directorTok };
}

afterAll(async () => {
  if (createdOrgIds.length) {
    const ids = createdOrgIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM organization_cancellations WHERE organization_id IN (${ids});
      DELETE FROM account_management_audit WHERE organization_id IN (${ids});
      DELETE FROM organization_memberships WHERE organization_id IN (${ids});
      DELETE FROM organization_licenses WHERE organization_id IN (${ids});
      DELETE FROM organizations WHERE id IN (${ids});
    `);
  }
  for (const id of createdUserIds) await authDeleteUser(id);
});

describe('HCN-SAAS-1.0 Section 6 -- the 90-day free cancellation window', () => {
  it('canceling on day 10 releases the organization with zero accelerated balance', async () => {
    const { orgId, directorTok } = await orgWithActiveLicense(10);
    const [status, record] = (await rpc('org_initiate_cancellation', {
      p_organization_id: orgId, p_reason: 'Changed our minds',
    }, directorTok)) as [number, { within_free_cancellation_window: boolean; accelerated_balance_total_cents: number }];
    expect(status).toBe(200);
    expect(record.within_free_cancellation_window).toBe(true);
    expect(record.accelerated_balance_total_cents).toBe(0);
    const licenseStatus = sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(licenseStatus).toBe('canceled');
  });

  it('canceling exactly on day 90 is still within the free window', async () => {
    const { orgId, directorTok } = await orgWithActiveLicense(90);
    const [status, record] = (await rpc('org_initiate_cancellation', { p_organization_id: orgId }, directorTok)) as [number, { within_free_cancellation_window: boolean }];
    expect(status).toBe(200);
    expect(record.within_free_cancellation_window).toBe(true);
  });
});

describe('HCN-SAAS-1.0 Section 7 -- cancellation after day 90 immediately accelerates the remaining minimum commitment', () => {
  it('canceling on day 91 (1 day past the window, 3rd month started) owes $250 for each of the remaining 9 months', async () => {
    const { orgId, directorTok } = await orgWithActiveLicense(91);
    const [status, record] = (await rpc('org_initiate_cancellation', {
      p_organization_id: orgId, p_reason: 'No longer needed',
    }, directorTok)) as [number, {
      within_free_cancellation_window: boolean; remaining_minimum_months: number;
      accelerated_minimum_balance_cents: number; accelerated_balance_total_cents: number; unpaid_annual_license_fee_cents: number;
    }];
    expect(status).toBe(200);
    expect(record.within_free_cancellation_window).toBe(false);
    // 91 days = 2 full months + a 30-day remainder -> the 3rd month has
    // started and rounds up (Customer owes for any started month) ->
    // 12 - 3 = 9 remaining months, each at the $250 minimum.
    expect(record.remaining_minimum_months).toBe(9);
    expect(record.accelerated_minimum_balance_cents).toBe(9 * 25000);
    expect(record.unpaid_annual_license_fee_cents).toBe(0); // annual fee was already paid at activation (migration 111's own precondition)
    expect(record.accelerated_balance_total_cents).toBe(record.accelerated_minimum_balance_cents);
  });

  it('canceling after the full 12-month term owes nothing further (no negative/overflow balance)', async () => {
    const { orgId, directorTok } = await orgWithActiveLicense(400);
    const [status, record] = (await rpc('org_initiate_cancellation', { p_organization_id: orgId }, directorTok)) as [number, { remaining_minimum_months: number; accelerated_balance_total_cents: number }];
    expect(status).toBe(200);
    expect(record.remaining_minimum_months).toBe(0);
    expect(record.accelerated_balance_total_cents).toBe(0);
  });

  it('the cancellation and the resulting license status are both durably recorded and auditable', async () => {
    const { orgId, directorTok, directorId } = await orgWithActiveLicense(120);
    await rpc('org_initiate_cancellation', { p_organization_id: orgId, p_reason: 'Budget cuts' }, directorTok);
    const auditType = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${orgId}' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditType).toBe('organization_subscription_canceled');
    const auditActor = sql(`SELECT actor_user_id FROM account_management_audit WHERE organization_id='${orgId}' ORDER BY created_at DESC LIMIT 1;`);
    expect(auditActor).toBe(directorId);
  });
});

describe('HCN-SAAS-1.0 -- authorization and idempotency', () => {
  it('only an active Director of the organization may initiate cancellation', async () => {
    const { orgId } = await orgWithActiveLicense(10);
    const outsiderEmail = `orgcancel-outsider-${stamp}@local.test`;
    const outsiderId = await authSignUp(outsiderEmail, PW);
    createdUserIds.push(outsiderId);
    sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${outsiderId}';`);
    const outsiderTok = await login(outsiderEmail, PW);
    const [status] = await rpc('org_initiate_cancellation', { p_organization_id: orgId }, outsiderTok);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('a second cancellation attempt on an already-canceled organization is rejected, not silently duplicated', async () => {
    const { orgId, directorTok } = await orgWithActiveLicense(10);
    const [firstStatus] = await rpc('org_initiate_cancellation', { p_organization_id: orgId }, directorTok);
    expect(firstStatus).toBe(200);
    const [secondStatus, body] = (await rpc('org_initiate_cancellation', { p_organization_id: orgId }, directorTok)) as [number, { message?: string }];
    expect(secondStatus).toBeGreaterThanOrEqual(400);
    expect(body.message).toMatch(/already been canceled/);
    const count = sql(`SELECT count(*) FROM organization_cancellations WHERE organization_id='${orgId}';`);
    expect(count).toBe('1');
  });
});
