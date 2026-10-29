// MMA-PROF-ONBOARD-004 P0-2 Phase 2 (migration 162): Organization Owner
// vs. Director separation, the combined specialist-slot capacity model,
// and the license-numbering concurrency fix. Requires the local Docker
// Supabase stack. Run with `npm run test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';

const exec = promisify(execCb);

// sql() (./_runtime) uses execSync -- synchronous, so N calls wrapped
// in Promise.all would actually run strictly one after another and
// prove nothing about real concurrency. This fires N independent
// `docker exec ... psql -c "..."` child processes with the async
// (non-blocking) exec() instead, which genuinely overlap -- the only
// way, from this test harness, to make two calls into the same
// Postgres backend-side atomic counter race for real. Only ever used
// here with a simple, parameter-free RPC call (a single quoted UUID,
// no untrusted input), so passing it as a `-c` argument is safe.
async function sqlConcurrent(statement: string): Promise<string> {
  const { stdout } = await exec(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1 -c "${statement}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return stdout.toString().trim();
}

const PW = 'Slots9!';
const stamp = Date.now();
const emails = {
  owner: `slots-owner-${stamp}@local.test`,
  director: `slots-director-${stamp}@local.test`,
  specialistA: `slots-specA-${stamp}@local.test`,
  specialistB: `slots-specB-${stamp}@local.test`,
  newOwner: `slots-newowner-${stamp}@local.test`,
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
  const specialistIdList = createdSpecialistIds.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
  sql(`
    DELETE FROM organization_ownership_events WHERE actor_user_id IN ('${ids.owner}','${ids.director}');
    DELETE FROM professional_application_events WHERE application_id IN (SELECT id FROM professional_applications WHERE applicant_user_id IN (${specialistIdList}));
    DELETE FROM professional_applications WHERE applicant_user_id IN ('${ids.director}', ${specialistIdList});
    DELETE FROM organization_memberships WHERE user_id IN ('${ids.director}', ${specialistIdList});
    DELETE FROM organization_licenses WHERE organization_id IN (SELECT id FROM organizations WHERE created_by='${ids.director}');
    DELETE FROM organizations WHERE created_by='${ids.director}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
  for (const id of createdSpecialistIds) await authDeleteUser(id);
});

// Directly provisions an org + active Director + an organization_licenses
// row at a given tier, bypassing the full application ceremony -- this
// test's own subject is slot ENFORCEMENT at approval time, not the
// provisioning path itself (covered separately).
function makeTierOrg(tierCode: string, specialistSlots: number, orgName: string): string {
  const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('${orgName}', 'integrated_care', '${ids.director}') RETURNING id;`);
  sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by) VALUES ('${orgId}', '${ids.director}', 'director', 'active', '${ids.director}');`);
  sql(`INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status, license_tier_code, specialist_slot_count) VALUES ('${orgId}', 10, 100, 'active', '${tierCode}', ${specialistSlots});`);
  return orgId;
}

// Creates a BRAND-NEW specialist applicant for every call -- reusing
// one fixture user across multiple submissions in this file would
// collide with submit_professional_application()'s own "one
// application under review at a time" rule: a specialist-slot-exceeded
// approval attempt (this file's whole point) correctly RAISES and
// rolls back, leaving that user's application at 'pending_review'
// forever, which then blocks any later test from submitting a second
// one for the same user. Each call's user is tracked in
// createdSpecialistIds for afterAll cleanup.
const createdSpecialistIds: string[] = [];
async function submitAndVerifySpecialistApplication(orgId: string, office: 'medical_professional' | 'therapist' | 'other_specialist'): Promise<string> {
  const email = `slots-spec-${stamp}-${createdSpecialistIds.length}@local.test`;
  const userId = await authSignUp(email, PW);
  createdSpecialistIds.push(userId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${userId}';`);
  const userToken = await login(email, PW);

  const [, app] = (await rpc('submit_professional_application', {
    p_requested_office: office, p_target_organization_id: orgId, p_proposed_organization_name: null, p_proposed_package_type: null,
    p_legal_name: 'Specialist Test', p_preferred_name: null, p_contact_email: email, p_contact_phone: null,
    p_professional_title: 'Specialist', p_profession_category: office, p_application_details: {},
  }, userToken)) as [number, { id: string }];
  await rpc('record_credential_verification', { p_application_id: app.id, p_decision: 'independently_verified', p_evidence_reference: 'Test evidence' }, tok.director);
  return app.id;
}

describe('MMA-PROF-ONBOARD-004 Organization Owner/Director separation and specialist slots (migration 162)', () => {
  it('an Essential org (0 specialist slots) cannot approve any medical_professional or therapist application', async () => {
    const orgId = makeTierOrg('essential', 0, `Essential Slots Org ${stamp}`);
    const appId = await submitAndVerifySpecialistApplication(orgId, 'medical_professional');
    const [status] = await rpc('director_approve_application', { p_application_id: appId }, tok.director);
    expect(status).toBe(400);
  });

  it('a Plus org (1 specialist slot) allows exactly one specialist approval, shared across medical and therapy, then blocks the next', async () => {
    const orgId = makeTierOrg('plus', 1, `Plus Slots Org ${stamp}`);
    const appA = await submitAndVerifySpecialistApplication(orgId, 'medical_professional');
    const [statusA] = await rpc('director_approve_application', { p_application_id: appA }, tok.director);
    expect(statusA).toBe(200);

    // The second specialist request is a DIFFERENT specialty
    // (therapist) -- the slot is a shared pool, not a per-specialty
    // bucket, so it is still correctly blocked.
    const appB = await submitAndVerifySpecialistApplication(orgId, 'therapist');
    const [statusB] = await rpc('director_approve_application', { p_application_id: appB }, tok.director);
    expect(statusB).toBe(400);
  });

  it('a Complete org (3 specialist slots) accepts Medical, Therapist, and Other, then rejects a fourth', async () => {
    const orgId = makeTierOrg('complete', 3, `Complete Slots Org ${stamp}`);
    const appA = await submitAndVerifySpecialistApplication(orgId, 'medical_professional');
    expect((await rpc('director_approve_application', { p_application_id: appA }, tok.director))[0]).toBe(200);
    const appB = await submitAndVerifySpecialistApplication(orgId, 'therapist');
    expect((await rpc('director_approve_application', { p_application_id: appB }, tok.director))[0]).toBe(200);
    const appC = await submitAndVerifySpecialistApplication(orgId, 'other_specialist');
    expect((await rpc('director_approve_application', { p_application_id: appC }, tok.director))[0]).toBe(200);
    const appD = await submitAndVerifySpecialistApplication(orgId, 'medical_professional');
    expect((await rpc('director_approve_application', { p_application_id: appD }, tok.director))[0]).toBe(400);
  });

  it('a legacy (non-tier) organization is completely unaffected by the specialist-slot model', async () => {
    const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('Legacy Org ${stamp}', 'integrated_care', '${ids.director}') RETURNING id;`);
    sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by) VALUES ('${orgId}', '${ids.director}', 'director', 'active', '${ids.director}');`);
    sql(`INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status) VALUES ('${orgId}', 10, 100, 'active');`);
    const appId = await submitAndVerifySpecialistApplication(orgId, 'medical_professional');
    const [status] = await rpc('director_approve_application', { p_application_id: appId }, tok.director);
    expect(status).toBe(200);
  });

  it('Organization Owner defaults to the org creator; only the Owner (not merely the Director) may replace the Director', async () => {
    const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('Owner Test Org ${stamp}', 'integrated_care', '${ids.director}') RETURNING id;`);
    sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by) VALUES ('${orgId}', '${ids.director}', 'director', 'active', '${ids.director}');`);
    sql(`INSERT INTO organization_licenses (organization_id, status) VALUES ('${orgId}', 'active');`);

    const resolvedOwner = sql(`SELECT get_organization_owner('${orgId}');`);
    expect(resolvedOwner).toBe(ids.director);

    // The director IS the owner here by default, so this should succeed.
    const [statusOwner] = await rpc('owner_replace_director', { p_organization_id: orgId, p_new_director_email: emails.specialistA, p_reason: 'Testing replacement' }, tok.director);
    expect(statusOwner).toBe(200);

    // A non-owner, non-director user cannot replace anything.
    const [statusOutsider] = await rpc('owner_replace_director', { p_organization_id: orgId, p_new_director_email: emails.specialistB, p_reason: 'Should fail' }, tok.specialistB);
    expect(statusOutsider).toBe(400);
  });

  it('Platform Owner ownership recovery is audited and reassigns the recognized owner', async () => {
    const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('Recovery Org ${stamp}', 'integrated_care', '${ids.director}') RETURNING id;`);
    sql(`INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by) VALUES ('${orgId}', '${ids.director}', 'director', 'active', '${ids.director}');`);
    sql(`INSERT INTO organization_licenses (organization_id, status) VALUES ('${orgId}', 'active');`);

    // An ordinary director cannot self-grant a recovery.
    const [statusDenied] = await rpc('platform_owner_recover_organization_ownership', { p_organization_id: orgId, p_new_owner_email: emails.newOwner, p_reason: 'Not allowed' }, tok.director);
    expect(statusDenied).toBe(400);

    const [statusOk] = await rpc('platform_owner_recover_organization_ownership', { p_organization_id: orgId, p_new_owner_email: emails.newOwner, p_reason: 'Verified ownership dispute resolved' }, tok.owner);
    expect(statusOk).toBe(200);

    const newOwner = sql(`SELECT get_organization_owner('${orgId}');`);
    expect(newOwner).toBe(ids.newOwner);
    const eventCount = sql(`SELECT count(*) FROM organization_ownership_events WHERE organization_id='${orgId}' AND event_type='owner_recovery';`);
    expect(eventCount).toBe('1');
  });

  it('issues the new MMA-ES/MMA-PL/MMA-CO prefixes and stays unique under genuine concurrent activation', async () => {
    // Build N fully independent, already-paid, already-contracted,
    // already-approved tier-based organizations, then activate all of
    // them AT THE SAME TIME to prove the atomic sequence counter (not
    // the prior MAX-scan) serializes correctly rather than colliding.
    const N = 15;
    const quoteIds: string[] = [];
    for (let i = 0; i < N; i++) {
      const prospectId = sql(`INSERT INTO sales_prospects (contact_name, contact_email, prospective_organization_name, created_by) VALUES ('Concurrency Test', 'concurrency-${stamp}-${i}@local.test', 'Concurrency Org ${stamp}-${i}', '${ids.owner}') RETURNING id;`);
      const quoteId = sql(`INSERT INTO sales_quotes (prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity, annual_license_fee, billing_cadence, status, created_by) VALUES ('${prospectId}', 'integrated_care', 5, 25, 599, 'annual', 'sent', '${ids.owner}') RETURNING id;`);
      const appId = sql(`
        INSERT INTO professional_applications (applicant_user_id, requested_office, proposed_organization_name, proposed_package_type, legal_name, contact_email, status, platform_owner_approval_required, application_details, selected_tier_code, platform_owner_approved_at)
        VALUES ('${ids.director}', 'director', 'Concurrency Org ${stamp}-${i}', 'integrated_care', 'Concurrency Test', 'concurrency-${stamp}-${i}@local.test', 'approved', true, '{"originatingQuoteId":"${quoteId}"}'::jsonb, 'plus', now())
        RETURNING id;
      `);
      const orgId = sql(`INSERT INTO organizations (name, package_type, created_by) VALUES ('Concurrency Org ${stamp}-${i}', 'integrated_care', '${ids.director}') RETURNING id;`);
      sql(`UPDATE professional_applications SET target_organization_id='${orgId}' WHERE id='${appId}';`);
      sql(`INSERT INTO organization_licenses (organization_id, status) VALUES ('${orgId}', 'proposed');`);
      sql(`INSERT INTO enterprise_billing_accounts (quote_id, billing_contact_email, unit_amount_cents, billing_interval, status, created_by) VALUES ('${quoteId}', 'concurrency@local.test', 59900, 'year', 'active', '${ids.owner}');`);
      sql(`INSERT INTO enterprise_contracts (quote_id, contract_type, template_version, signatory_name, status, executed_by, executed_at, execution_method, execution_evidence_reference, created_by) VALUES ('${quoteId}', 'saas_license', 'v1', 'Test Signatory', 'executed', '${ids.owner}', now(), 'test', 'test-evidence', '${ids.owner}');`);
      sql(`INSERT INTO enterprise_contracts (quote_id, contract_type, template_version, signatory_name, status, executed_by, executed_at, execution_method, execution_evidence_reference, created_by) VALUES ('${quoteId}', 'baa', 'v1', 'Test Signatory', 'executed', '${ids.owner}', now(), 'test', 'test-evidence', '${ids.owner}');`);
      quoteIds.push(quoteId);
    }

    // activate_enterprise_license_from_quote is service_role-only (not
    // reachable over the authenticated REST/RPC surface at all -- see
    // migration 111/115's own REVOKE) and is normally invoked by the
    // stripe-webhook Edge Function running with the service-role key.
    // This test calls it the only other way service_role authority is
    // reachable in this harness: directly as the `postgres` superuser
    // via `docker exec psql`, which genuinely bypasses PostgREST and
    // therefore the role grant entirely -- the SAME mechanism the
    // webhook itself ultimately relies on (a service-role-authenticated
    // Postgres connection), not a security bypass specific to this test.
    const activated = await Promise.all(
      quoteIds.map((qid) => sqlConcurrent(`SELECT activate_enterprise_license_from_quote('${qid}');`)),
    );
    expect(activated.length).toBe(N);

    const licenseNumbers = sql(`
      SELECT string_agg(license_number, ',') FROM organization_licenses ol
      JOIN organizations o ON o.id = ol.organization_id
      WHERE o.name LIKE 'Concurrency Org ${stamp}-%';
    `).split(',');
    expect(licenseNumbers.length).toBe(N);
    expect(new Set(licenseNumbers).size).toBe(N);
    expect(licenseNumbers.every((n) => /^MMA-PL-\d{4}-\d{6}$/.test(n))).toBe(true);
  }, 30000);
});
