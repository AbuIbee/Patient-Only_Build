// MMA-CODEX-011 finding 011-05 (F-09/ENT-013, P1) — independent audit:
// inspecting organization_licenses' columns and the license configuration
// UI found only a single pooled seat count (licensed_seats); no mechanism
// existed to cap any one office/role's headcount separately within that
// pool. Migration 140 adds four optional per-role cap columns (NULL = no
// separate cap, aggregate-only, unchanged from before) and enforces them
// in invite_org_member()/director_approve_application() alongside the
// existing, unweakened aggregate check -- and locks the organization's
// license row in invite_org_member() (it never did before), closing the
// same last-seat race migration 097 already closed for the approval path.
//
// Only 'caregiver' and 'billing_admin' are reachable through
// invite_org_member() at all (migration 124/131 already require
// therapist/medical_professional to go through the credential-verified
// professional_applications pipeline instead) -- these tests exercise
// invite_org_member()'s caregiver/billing_admin per-role caps, and the
// org's license is seeded 'proposed' (not 'active') so org_configure_
// license()'s unrelated migration-129 "active license is locked" guard
// doesn't mask the per-role-headcount check being tested here.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';

const PW = 'Codex011RoleCaps9!';
const stamp = Date.now();
const ORG = 'f0777777-7777-4777-8777-777777777777';

const emails = {
  director: `codex011cap-director-${stamp}@local.test`,
  caregiverA: `codex011cap-caregiverA-${stamp}@local.test`,
  caregiverB: `codex011cap-caregiverB-${stamp}@local.test`,
  billingA: `codex011cap-billingA-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','Codex011 Role Cap Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,max_caregiver_seats) VALUES('${ORG}',10,20,9999,'proposed',1);
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('MMA-CODEX-011 011-05 (F-09/ENT-013, P1) — per-role license seat caps (migration 140)', () => {
  it('a per-role cap of 1 caregiver allows the first caregiver invite and rejects the second, while billing_admin (uncapped role) is still invitable', async () => {
    const [statusA] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiverA, p_org_role: 'caregiver' }, tok.director);
    expect(statusA).toBe(200);

    const [statusB, bodyB] = (await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.caregiverB, p_org_role: 'caregiver' }, tok.director)) as [number, { message?: string }];
    expect(statusB).toBeGreaterThanOrEqual(400);
    expect(bodyB.message).toContain('No licensed caregiver seats are available');

    // Cross-role independence: the aggregate pool (10 seats, 2 used so
    // far) still has room, and billing_admin has no per-role cap
    // configured -- this invite must succeed, proving the new per-role
    // gate didn't accidentally tighten the shared aggregate pool for
    // every role.
    const [statusBilling] = await rpc('invite_org_member', { p_org_id: ORG, p_email: emails.billingA, p_org_role: 'billing_admin' }, tok.director);
    expect(statusBilling).toBe(200);
  });

  it('org_configure_license is unreachable by an authenticated Director at all (PACKAGE 1 migration 143) -- the per-role-cap-below-headcount business rule still exists in the function body but is no longer client-exercisable', async () => {
    // caregiverA is already invited above -- one caregiver headcount exists.
    // Before PACKAGE 1 migration 143 revoked the authenticated EXECUTE
    // grant entirely, this call would reach the function body's own
    // "cannot be set below the current caregiver headcount" check
    // (>=400, business-logic rejection). Now it is rejected purely on
    // authorization grounds (403, insufficient_privilege) before the
    // function body ever runs -- that business rule remains real and
    // correct (defense in depth for any future service_role-driven
    // caller) but has no authenticated-client-reachable test surface
    // left to exercise it through.
    const [status] = (await rpc('org_configure_license', {
      p_org_id: ORG, p_licensed_seats: 10, p_covered_patient_capacity: 20, p_annual_license_fee: 9999,
      p_max_caregiver_seats: 0,
    }, tok.director)) as [number, { message?: string }];
    expect(status).toBe(403);
  });

  it('a concurrent invite racing for the SAME last per-role seat blocks on the real license-row lock, then correctly fails once the seat is gone', async () => {
    // Fresh org, licensed_seats generously high (so only the per-role cap
    // is the binding constraint being raced), max_caregiver_seats=1.
    const raceOrg = 'f0776666-6666-4666-8666-666666666666';
    const raceEmails = {
      director: `codex011cap-race-director-${stamp}@local.test`,
      caregiverA: `codex011cap-race-caregiverA-${stamp}@local.test`,
      caregiverB: `codex011cap-race-caregiverB-${stamp}@local.test`,
    };
    const raceIds: Record<string, string> = {};
    for (const [name, email] of Object.entries(raceEmails)) raceIds[name] = await authSignUp(email, PW);
    sql(`
      UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(raceIds).join("','")}');
      DELETE FROM organizations WHERE id='${raceOrg}';
      BEGIN;
      INSERT INTO organizations(id,name,package_type,created_by) VALUES('${raceOrg}','Codex011 Role Cap Race Org','integrated_care','${raceIds.director}');
      INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status,max_caregiver_seats) VALUES('${raceOrg}',10,20,9999,'proposed',1);
      INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${raceOrg}','${raceIds.director}','director','active');
      COMMIT;
    `);
    const raceTok = await login(raceEmails.director, PW);

    const statement = `SET application_name='codex011-cap-race'; BEGIN;
SELECT id FROM public.organization_licenses WHERE organization_id='${raceOrg}' FOR UPDATE;
SELECT pg_sleep(2);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','${raceIds.director}',true);
SELECT (public.invite_org_member('${raceOrg}','${raceEmails.caregiverA}','caregiver')).status;
COMMIT;`;
    const proc = spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${process.env.MMA_TEST_DB_ADMIN_PASSWORD || 'postgres'}`, DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(statement);
    proc.stdin.end();
    let stderrBuf = '';
    proc.stderr.on('data', (d) => (stderrBuf += d));

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='codex011-cap-race' AND wait_event='PgSleep');") === 't') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const inviteBPromise = rpc('invite_org_member', { p_org_id: raceOrg, p_email: raceEmails.caregiverB, p_org_role: 'caregiver' }, raceTok);

    await new Promise<void>((resolve) => proc.on('close', () => resolve()));
    expect(stderrBuf).toBe('');

    const [statusB, bodyB] = (await inviteBPromise) as [number, { message?: string }];
    expect(statusB).toBeGreaterThanOrEqual(400);
    expect(bodyB.message).toContain('No licensed caregiver seats are available');

    const caregiverCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${raceOrg}' AND org_role='caregiver';`);
    expect(caregiverCount).toBe('1'); // caregiverA (background session) only

    sql(`DELETE FROM organizations WHERE id='${raceOrg}';`);
    for (const id of Object.values(raceIds)) await authDeleteUser(id);
  }, 15000);
});
