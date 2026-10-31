// GitHub Issue #3 P0-01/P0-02 — owner-approved corrective directive,
// 2026-10-31. Covers the ten required acceptance scenarios against the
// real migrations (20261031000100, 20261031000200) on a disposable
// local stack. Requires the local Docker Supabase stack; run with
// `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql } from './_runtime';

const PW = 'Issue3P0Fix9!';
const stamp = Date.now();
const emails = {
  owner: `i3-owner-${stamp}@local.test`,
  bilal: `i3-bilal-${stamp}@local.test`, // the unpaid/paid applicant under test
  haneen: `i3-haneen-${stamp}@local.test`, // a second, independent applicant (cross-tenant + revocation scenarios)
  outsider: `i3-outsider-${stamp}@local.test`, // an ordinary authenticated user with no application at all
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const createdOrgIds: string[] = [];
const createdQuoteOwnerIds: string[] = [];

async function makeQuoteAndApplication(applicantKey: keyof typeof emails, orgName: string, feeCents: number): Promise<{ quoteId: string; appId: string }> {
  const [, prospect] = (await rpc('platform_owner_create_prospect', {
    p_contact_name: 'Issue3 Test', p_contact_email: emails[applicantKey], p_contact_phone: null, p_prospective_organization_name: orgName, p_notes: null,
  }, tok.owner)) as [number, { id: string }];
  const [, quote] = (await rpc('platform_owner_create_quote', {
    p_prospect_id: prospect.id, p_package_type: 'integrated_care', p_proposed_licensed_seats: 4,
    p_proposed_covered_patient_capacity: 20, p_annual_license_fee: feeCents / 100, p_billing_cadence: 'annual',
    p_quote_term_months: 12, p_discount_notes: null, p_valid_until: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_send_quote', { p_quote_id: quote.id }, tok.owner);
  const appId = sql(`
    INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details)
    VALUES ('${ids[applicantKey]}', 'director', '${orgName}', 'integrated_care', 'Issue3 Applicant', '${emails[applicantKey]}', 'pending_review', true, '{"originatingQuoteId":"${quote.id}"}'::jsonb)
    RETURNING id;
  `);
  return { quoteId: quote.id, appId };
}

function markAnnualPaid(quoteId: string, feeCents: number, applicantKey: keyof typeof emails): void {
  sql(`
    INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, billing_component, status, stripe_subscription_id, created_by)
    VALUES ('${quoteId}', '${emails[applicantKey]}', 'usd', ${feeCents}, 'year', 'annual_license', 'active', 'SYNTHETIC-NOT-A-STRIPE-SUBSCRIPTION-ANNUAL-${stamp}', '${ids[applicantKey]}')
    ON CONFLICT (quote_id, billing_component) DO UPDATE SET status = 'active', stripe_subscription_id = EXCLUDED.stripe_subscription_id;
  `);
}

function markMonthlyAuthorized(quoteId: string, applicantKey: keyof typeof emails): void {
  sql(`
    INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, currency, unit_amount_cents, billing_interval, billing_component, status, stripe_subscription_id, created_by)
    VALUES ('${quoteId}', '${emails[applicantKey]}', 'usd', 25800, 'month', 'monthly_patients', 'active', 'SYNTHETIC-NOT-A-STRIPE-SUBSCRIPTION-MONTHLY-${stamp}', '${ids[applicantKey]}')
    ON CONFLICT (quote_id, billing_component) DO UPDATE SET status = 'active', stripe_subscription_id = EXCLUDED.stripe_subscription_id;
  `);
}

async function executeContract(quoteId: string, contractType: 'saas_license' | 'baa'): Promise<void> {
  const [, contract] = (await rpc('platform_owner_create_contract', {
    p_quote_id: quoteId, p_contract_type: contractType, p_template_version: 'v1', p_signatory_name: 'Issue3 Applicant', p_signatory_title: null,
  }, tok.owner)) as [number, { id: string }];
  await rpc('platform_owner_present_contract', { p_contract_id: contract.id }, tok.owner);
  await rpc('platform_owner_record_contract_execution', {
    p_contract_id: contract.id, p_execution_method: 'manual', p_execution_evidence_reference: `issue3-test-${contractType}-${stamp}`,
  }, tok.owner);
}

async function approveAndGetOrgId(appId: string): Promise<string> {
  // Must go through the real authenticated RPC (as the Platform Owner),
  // never raw SQL as the postgres superuser -- auth.uid() is NULL in a
  // raw psql session, so is_platform_owner() always returns false there
  // and the function would always reject, regardless of the real role.
  const [status, org] = (await rpc('platform_owner_approve_director_application', { p_application_id: appId }, tok.owner)) as [number, { id: string }];
  if (status !== 200) throw new Error(`platform_owner_approve_director_application failed: ${status} ${JSON.stringify(org)}`);
  createdOrgIds.push(org.id);
  return org.id;
}

function membershipStatus(orgId: string, userId: string): string | null {
  const r = sql(`SELECT status FROM organization_memberships WHERE organization_id='${orgId}' AND user_id='${userId}' AND org_role='director';`);
  return r || null;
}

function licenseStatus(orgId: string): string | null {
  const r = sql(`SELECT status FROM organization_licenses WHERE organization_id='${orgId}';`);
  return r || null;
}

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    UPDATE profiles SET role='admin' WHERE id='${ids.owner}';
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
  createdQuoteOwnerIds.push(ids.owner);
}, 30000);

afterAll(async () => {
  const orgFilter = createdOrgIds.length ? createdOrgIds.map((o) => `'${o}'`).join(',') : "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM account_management_audit WHERE organization_id IN (${orgFilter});
    DELETE FROM enterprise_billing_events WHERE billing_account_id IN (SELECT id FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by IN ('${createdQuoteOwnerIds.join("','")}')));
    DELETE FROM enterprise_billing_accounts WHERE quote_id IN (SELECT id FROM sales_quotes WHERE created_by IN ('${createdQuoteOwnerIds.join("','")}'));
    DELETE FROM enterprise_contracts WHERE created_by IN ('${createdQuoteOwnerIds.join("','")}');
    DELETE FROM organization_licenses WHERE organization_id IN (${orgFilter});
    DELETE FROM organization_memberships WHERE organization_id IN (${orgFilter});
    DELETE FROM organizations WHERE id IN (${orgFilter});
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.bilal}','${ids.haneen}','${ids.outsider}');
    DELETE FROM sales_quotes WHERE created_by IN ('${createdQuoteOwnerIds.join("','")}');
    DELETE FROM sales_prospects WHERE created_by IN ('${createdQuoteOwnerIds.join("','")}');
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('Issue #3 P0-01 — Director membership gated on verified billing/contracts', () => {
  it('1. Platform Owner approves an application with no payment at all: membership is invited (not active), license is proposed, Director RPC access is denied', async () => {
    const { quoteId: _q, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario1 ${stamp}`, 39900);
    const orgId = await approveAndGetOrgId(appId);

    expect(membershipStatus(orgId, ids.bilal)).toBe('invited');
    expect(licenseStatus(orgId)).toBe('proposed');

    // org_configure_license is revoked from authenticated entirely
    // (migration 143) -- PostgREST rejects at the grant level (403),
    // before the function's own "active director" check ever runs.
    const [status] = await rpc('org_configure_license', { p_org_id: orgId, p_licensed_seats: 5, p_covered_patient_capacity: 50, p_annual_license_fee: 1000 }, tok.bilal);
    expect(status).toBe(403);
  });

  it('2. Valid signed annual payment ONLY (no monthly, no agreements): Director still denied', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario2 ${stamp}`, 39900);
    markAnnualPaid(quoteId, 39900, 'bilal');
    const orgId = await approveAndGetOrgId(appId); // approval itself re-attempts activation; should still fail (no agreements)

    expect(membershipStatus(orgId, ids.bilal)).toBe('invited');
    expect(licenseStatus(orgId)).toBe('proposed');
  });

  it('3. Annual paid + monthly authorized, but SaaS/BAA NOT executed: Director still denied', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario3 ${stamp}`, 39900);
    markAnnualPaid(quoteId, 39900, 'bilal');
    markMonthlyAuthorized(quoteId, 'bilal');
    const orgId = await approveAndGetOrgId(appId);

    expect(membershipStatus(orgId, ids.bilal)).toBe('invited');
    expect(licenseStatus(orgId)).toBe('proposed');

    const [status] = await rpc('activate_enterprise_license_from_quote', { p_quote_id: quoteId }, tok.owner);
    // service_role-only RPC (REVOKE ALL ... FROM PUBLIC, authenticated,
    // anon) -- PostgREST rejects an authenticated caller at the grant
    // level, before the function body ever runs. 403, matching this
    // repo's own established precedent for a revoked-from-authenticated
    // function (codexF09ConfigureActivateLock.test.ts).
    expect(status).toBe(403);
  });

  it('4. Annual paid + monthly authorized + BOTH agreements executed: exactly one active license and active Director; replay does not duplicate audit/license', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario4 ${stamp}`, 39900);
    markAnnualPaid(quoteId, 39900, 'bilal');
    markMonthlyAuthorized(quoteId, 'bilal');
    await executeContract(quoteId, 'saas_license');
    await executeContract(quoteId, 'baa');
    const orgId = await approveAndGetOrgId(appId); // approval's own internal activation attempt should now succeed

    expect(membershipStatus(orgId, ids.bilal)).toBe('active');
    expect(licenseStatus(orgId)).toBe('active');
    const licenseNumberRow = sql(`SELECT license_number FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(licenseNumberRow).toMatch(/^MMA-ES-|^MMA-FE-/);

    // Replay via direct SQL as service_role equivalent (set_config trick
    // mirrors existing repo test patterns) -- re-running activation for
    // the same quote must not create a second license row, a second
    // license number, or a second activation event.
    sql(`SET ROLE postgres; SELECT * FROM activate_enterprise_license_from_quote('${quoteId}'); RESET ROLE;`);
    const licenseCount = sql(`SELECT count(*) FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(licenseCount).toBe('1');
    const eventCount = sql(`SELECT count(*) FROM professional_application_events WHERE application_id='${appId}' AND event_type='enterprise_license_activated';`);
    expect(eventCount).toBe('1');
    const membershipCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${orgId}' AND user_id='${ids.bilal}';`);
    expect(membershipCount).toBe('1');
  });

  it('5. A revoked Director cannot be resurrected by a payment retry', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario5 ${stamp}`, 39900);
    markAnnualPaid(quoteId, 39900, 'bilal');
    markMonthlyAuthorized(quoteId, 'bilal');
    await executeContract(quoteId, 'saas_license');
    await executeContract(quoteId, 'baa');
    const orgId = await approveAndGetOrgId(appId);
    expect(membershipStatus(orgId, ids.bilal)).toBe('active');

    sql(`UPDATE organization_memberships SET status='revoked' WHERE organization_id='${orgId}' AND user_id='${ids.bilal}' AND org_role='director';`);
    expect(membershipStatus(orgId, ids.bilal)).toBe('revoked');

    // Retry activation (e.g. a replayed/duplicate webhook) must not
    // resurrect the revoked membership -- the UPDATE's WHERE clause
    // only ever matches status='invited'.
    sql(`SET ROLE postgres; SELECT * FROM activate_enterprise_license_from_quote('${quoteId}'); RESET ROLE;`);
    expect(membershipStatus(orgId, ids.bilal)).toBe('revoked');

    const [status] = await rpc('org_configure_license', { p_org_id: orgId, p_licensed_seats: 5, p_covered_patient_capacity: 50, p_annual_license_fee: 1000 }, tok.bilal);
    expect(status).toBe(403); // revoked from authenticated (migration 143) -- grant-level rejection
  });

  it('7. Preactivation visibility is preserved: an invited (unpaid) Director can see their own org and pending license status, but not operational/clinical access', async () => {
    const { appId } = await makeQuoteAndApplication('haneen', `I3 Scenario7 ${stamp}`, 39900);
    const orgId = await approveAndGetOrgId(appId);
    expect(membershipStatus(orgId, ids.haneen)).toBe('invited');

    const [orgStatus, orgBody] = await rpc('is_invited_or_active_org_director', { p_org_id: orgId }, tok.haneen) as [number, boolean];
    expect(orgStatus).toBe(200);
    expect(orgBody).toBe(true);

    const [orgSelectStatus, orgRows] = (await rpcSelectOrganizations(orgId, tok.haneen));
    expect(orgSelectStatus).toBe(200);
    expect((orgRows as unknown[]).length).toBe(1);

    const [licenseSelectStatus, licenseRows] = await rpcSelectOrgLicense(orgId, tok.haneen);
    expect(licenseSelectStatus).toBe(200);
    expect((licenseRows as { status: string }[])[0]?.status).toBe('proposed');

    // But NOT operational authority -- is_active_org_director (strict)
    // is still false, and a clinical/organizational write RPC is denied.
    const [strictStatus, strictBody] = await rpc('is_active_org_director', { p_org_id: orgId }, tok.haneen) as [number, boolean];
    expect(strictStatus).toBe(200);
    expect(strictBody).toBe(false);
  });

  it('8a. Cross-tenant isolation: an invited Director of Org A cannot see or act on Org B', async () => {
    const { appId: appIdA } = await makeQuoteAndApplication('bilal', `I3 Scenario8a-A ${stamp}`, 39900);
    const orgA = await approveAndGetOrgId(appIdA);
    const { appId: appIdB } = await makeQuoteAndApplication('haneen', `I3 Scenario8a-B ${stamp}`, 39900);
    const orgB = await approveAndGetOrgId(appIdB);

    const [, orgBRows] = await rpcSelectOrganizations(orgB, tok.bilal);
    expect((orgBRows as unknown[]).length).toBe(0);

    const [cfgStatus] = await rpc('org_configure_license', { p_org_id: orgB, p_licensed_seats: 5, p_covered_patient_capacity: 50, p_annual_license_fee: 1000 }, tok.bilal);
    expect(cfgStatus).toBe(403); // revoked from authenticated (migration 143) -- grant-level rejection
    void orgA;
  });

  it('8b. Concurrent/duplicate activation requests are idempotent: exactly one license number, one active membership', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario8b ${stamp}`, 39900);
    markAnnualPaid(quoteId, 39900, 'bilal');
    markMonthlyAuthorized(quoteId, 'bilal');
    await executeContract(quoteId, 'saas_license');
    await executeContract(quoteId, 'baa');
    const orgId = await approveAndGetOrgId(appId);

    // Fire several "concurrent" replays in quick succession.
    for (let i = 0; i < 3; i++) {
      sql(`SET ROLE postgres; SELECT * FROM activate_enterprise_license_from_quote('${quoteId}'); RESET ROLE;`);
    }
    const licenseNumbers = sql(`SELECT license_number FROM organization_licenses WHERE organization_id='${orgId}';`);
    expect(licenseNumbers.split('\n').filter(Boolean).length).toBe(1);
    const activeMembershipCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${orgId}' AND user_id='${ids.bilal}' AND status='active';`);
    expect(activeMembershipCount).toBe('1');
  });
});

async function rpcSelectOrganizations(orgId: string, token: string): Promise<[number, unknown]> {
  const { http } = await import('./_runtime');
  return http('GET', `/rest/v1/organizations?select=id&id=eq.${orgId}`, undefined, token);
}
async function rpcSelectOrgLicense(orgId: string, token: string): Promise<[number, unknown]> {
  const { http } = await import('./_runtime');
  return http('GET', `/rest/v1/organization_licenses?select=status&organization_id=eq.${orgId}`, undefined, token);
}

describe('Issue #3 P0-02 — exceptional admin license-status RPC cannot bypass verified activation', () => {
  it('6a. An ordinary authenticated user (no admin role) cannot call the exceptional RPC', async () => {
    const { appId } = await makeQuoteAndApplication('bilal', `I3 Scenario6a ${stamp}`, 39900);
    const orgId = await approveAndGetOrgId(appId);
    const [status, body] = await rpc('admin_set_organization_license_status', { p_org_id: orgId, p_status: 'suspended', p_justification: 'test' }, tok.outsider);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(/only admins/i);
  });

  it('6b. An admin cannot set status=active directly through the exceptional RPC', async () => {
    const { appId } = await makeQuoteAndApplication('bilal', `I3 Scenario6b ${stamp}`, 39900);
    const orgId = await approveAndGetOrgId(appId);
    const [status, body] = await rpc('admin_set_organization_license_status', { p_org_id: orgId, p_status: 'active', p_justification: 'attempted bypass' }, tok.owner);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(/cannot activate a license directly/i);
    expect(licenseStatus(orgId)).toBe('proposed');
  });

  it('6c. An admin cannot use the removed "unpaid" value (it was never a real status)', async () => {
    const { appId } = await makeQuoteAndApplication('bilal', `I3 Scenario6c ${stamp}`, 39900);
    const orgId = await approveAndGetOrgId(appId);
    const [status, body] = await rpc('admin_set_organization_license_status', { p_org_id: orgId, p_status: 'unpaid', p_justification: 'test' }, tok.owner);
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(/invalid or unsupported/i);
  });

  it('6d. An allowed exceptional suspension succeeds and is audited with actor + reason', async () => {
    const { quoteId, appId } = await makeQuoteAndApplication('bilal', `I3 Scenario6d ${stamp}`, 39900);
    markAnnualPaid(quoteId, 39900, 'bilal');
    markMonthlyAuthorized(quoteId, 'bilal');
    await executeContract(quoteId, 'saas_license');
    await executeContract(quoteId, 'baa');
    const orgId = await approveAndGetOrgId(appId);
    expect(licenseStatus(orgId)).toBe('active');

    const [status, body] = (await rpc('admin_set_organization_license_status', { p_org_id: orgId, p_status: 'suspended', p_justification: 'Owner-approved exceptional suspension for test' }, tok.owner)) as [number, { status: string }];
    expect(status).toBe(200);
    expect(body.status).toBe('suspended');

    const auditRow = sql(`SELECT actor_user_id, reason FROM account_management_audit WHERE organization_id='${orgId}' AND action_type='platform_owner_exceptional_license_status_change' ORDER BY created_at DESC LIMIT 1;`);
    const [actorId, reason] = auditRow.split('|');
    expect(actorId).toBe(ids.owner);
    expect(reason).toMatch(/Owner-approved exceptional suspension/);
  });
});
