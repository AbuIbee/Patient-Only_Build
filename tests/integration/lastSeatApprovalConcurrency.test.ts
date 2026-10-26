// Codex MMA-CODEX-09 — "simultaneous last-seat approvals." Reproduces
// the exact race migration 097 closes: director_approve_application()
// locks the application row being approved, but two DIFFERENT
// applications competing for the SAME organization's last licensed
// seat are two different rows -- that lock never serialized them
// against each other, and the seat-capacity count itself took no lock
// at all.
//
// Technique: the organization's license is set to exactly 1 remaining
// seat (licensed_seats = active_count + 1). A background session holds
// FOR UPDATE on the organization_licenses row, sleeps, then approves
// applicant A and commits -- simulating "director X is mid-transaction
// approving the last seat." The foreground RPC call approves a
// DIFFERENT applicant B for the SAME org while that lock is held; with
// migration 097's fix it must BLOCK until the background session
// commits, then correctly see zero remaining seats and fail, rather
// than racing through to create a second active membership beyond
// capacity.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';

const PW = 'LastSeatRace9!';
const stamp = Date.now();
const ORG = 'c0333333-3333-4333-8333-333333333333';

const emails = {
  director: `lsc-director-${stamp}@local.test`,
  applicantA: `lsc-applicantA-${stamp}@local.test`,
  applicantB: `lsc-applicantB-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let appA: string;
let appB: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','LSC Org','integrated_care','${ids.director}');
    -- Exactly one seat remaining: 1 active (the director) + 1 licensed headroom.
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',2,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${ORG}','${ids.director}','director','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  const [, appAbody] = (await rpc('submit_professional_application', {
    p_requested_office: 'caregiver', p_target_organization_id: ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
    p_legal_name: 'LSC Applicant A', p_preferred_name: null, p_contact_email: emails.applicantA, p_contact_phone: null,
    p_professional_title: 'Caregiver', p_profession_category: 'caregiver', p_application_details: {},
  }, tok.applicantA)) as [number, { id: string }];
  appA = appAbody.id;
  const [, appBbody] = (await rpc('submit_professional_application', {
    p_requested_office: 'caregiver', p_target_organization_id: ORG, p_proposed_organization_name: null, p_proposed_package_type: null,
    p_legal_name: 'LSC Applicant B', p_preferred_name: null, p_contact_email: emails.applicantB, p_contact_phone: null,
    p_professional_title: 'Caregiver', p_profession_category: 'caregiver', p_application_details: {},
  }, tok.applicantB)) as [number, { id: string }];
  appB = appBbody.id;

  await rpc('record_credential_verification', { p_application_id: appA, p_decision: 'independently_verified', p_evidence_reference: 'test' }, tok.director);
  await rpc('record_credential_verification', { p_application_id: appB, p_decision: 'independently_verified', p_evidence_reference: 'test' }, tok.director);
}, 30000);

afterAll(async () => {
  sql(`
    DELETE FROM public.professional_application_events WHERE application_id IN ('${appA}','${appB}');
    DELETE FROM public.professional_applications WHERE id IN ('${appA}','${appB}');
    DELETE FROM organizations WHERE id='${ORG}';
  `);
  for (const id of Object.values(ids)) await authDeleteUser(id);
});

describe('Codex MMA-CODEX-09 — director_approve_application() is serialized per organization against the last licensed seat (migration 097)', () => {
  it('a concurrent approval racing for the SAME last seat blocks on the real license-row lock, then correctly fails once the seat is gone', async () => {
    // Hold the lock as the actual director identity so the SQL session
    // genuinely represents "director mid-transaction approving appA".
    const statement = `SET application_name='lsc-approve-race'; BEGIN;
SELECT id FROM public.organization_licenses WHERE organization_id='${ORG}' FOR UPDATE;
SELECT pg_sleep(2);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','${ids.director}',true);
SELECT (public.director_approve_application('${appA}')).status;
COMMIT;`;
    // MMA-ENTERPRISE-ULTIMATE-MASTER-010 Section 3.3/16.4 — this hardcoded
    // 'supabase_db_repo' regardless of MMA_TEST_DB_CONTAINER, so running
    // this suite against a disposable stack silently spawned a second
    // psql session against the OWNER'S REAL persistent database instead
    // (confirmed running concurrently during this investigation) rather
    // than the intended disposable target -- the exact thing this
    // engagement's standing rules absolutely prohibit. No real row was
    // at risk (the organization/quote UUIDs only exist in the disposable
    // stack, so the FOR UPDATE matched zero rows there), but the
    // connection itself should never have been made. Fixed to use the
    // same env-aware DB_CONTAINER every other helper in this file uses.
    const proc = spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${process.env.MMA_TEST_DB_ADMIN_PASSWORD || 'postgres'}`, DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(statement);
    proc.stdin.end();
    let stderrBuf = '';
    proc.stderr.on('data', (d) => (stderrBuf += d));

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='lsc-approve-race' AND wait_event='PgSleep');") === 't') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Issued while the background session holds the license row lock
    // and is mid-sleep, BEFORE it has approved appA or committed.
    const approveBPromise = rpc('director_approve_application', { p_application_id: appB }, tok.director);

    await new Promise<void>((resolve) => proc.on('close', () => resolve()));
    expect(stderrBuf).toBe('');

    const [statusB, bodyB] = (await approveBPromise) as [number, { message?: string }];
    expect(statusB).toBeGreaterThanOrEqual(400);
    expect(bodyB.message).toContain('no remaining licensed seats');

    // appA (approved by the background session) succeeded; appB
    // (blocked, then correctly rejected) did not consume a seat.
    const activeCount = sql(`SELECT count(*) FROM organization_memberships WHERE organization_id='${ORG}' AND status='active';`);
    expect(activeCount).toBe('2'); // director + applicantA only
    const appBStatus = sql(`SELECT status FROM professional_applications WHERE id='${appB}';`);
    expect(appBStatus).toBe('pending_review');
  }, 15000);
});
