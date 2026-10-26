// Codex MMA-CODEX-03/09 — "serialize conflicting assignment/removal
// operations." Reproduces the exact race migration 095 closes:
// assign_staff_to_patient() previously read organization_memberships
// via a plain SELECT (no lock), so a concurrent revocation landing in
// the gap between that read and the INSERT could leave an active
// staff_patient_assignments row for a membership that was, by the time
// the transaction committed, already revoked.
//
// Technique: a background session holds FOR UPDATE on the exact
// membership row, sleeps, then revokes it and commits -- simulating a
// concurrent remove_org_member() mid-flight. The foreground RPC call
// (assign_staff_to_patient, as a real director) is issued while that
// lock is held; with migration 095's fix it must BLOCK until the
// background session commits, then see the now-revoked status and
// fail closed -- never racing through to create an active assignment
// against a membership that no longer exists in active standing.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';

const PW = 'AssignRace9!';
const stamp = Date.now();
const ORG = 'ac111111-1111-4111-8111-111111111111';

const emails = {
  director: `arc-director-${stamp}@local.test`,
  staff: `arc-staff-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `arc-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','ARC Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.staff}','caregiver','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','ARC','Patient','ARC Patient','1 ARC Ave','ARC Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

function holdMembershipLockThenRevoke(orgId: string, userId: string, sleepSeconds: number) {
  const statement = `SET application_name='arc-revoke-race'; BEGIN;
SELECT id FROM public.organization_memberships WHERE organization_id='${orgId}' AND user_id='${userId}' FOR UPDATE;
SELECT pg_sleep(${sleepSeconds});
UPDATE public.organization_memberships SET status='revoked', updated_at=now() WHERE organization_id='${orgId}' AND user_id='${userId}';
COMMIT;`;
  // MMA-ENTERPRISE-ULTIMATE-MASTER-010 Section 3.3/16.4: see
  // lastSeatApprovalConcurrency.test.ts for the full rationale -- this
  // hardcoded 'supabase_db_repo' regardless of MMA_TEST_DB_CONTAINER,
  // spawning an unwanted session (including an UPDATE statement,
  // matching zero real rows only because the UUIDs are synthetic)
  // against the owner's real database whenever it happened to be
  // running. Fixed to use DB_CONTAINER.
  const proc = spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${process.env.MMA_TEST_DB_ADMIN_PASSWORD || 'postgres'}`, DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stdin.write(statement);
  proc.stdin.end();
  let stderrBuf = '';
  proc.stderr.on('data', (d) => (stderrBuf += d));
  return {
    waitForSleep: async (timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='arc-revoke-race' AND wait_event='PgSleep');") === 't') return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('No synchronized revoke pause observed within ' + timeoutMs + 'ms');
    },
    waitForExit: () => new Promise<void>((resolve) => proc.on('close', () => resolve())),
    stderr: () => stderrBuf,
  };
}

describe('Codex MMA-CODEX-03/09 — assign_staff_to_patient() is serialized against a concurrent revocation (migration 095)', () => {
  it('a concurrent remove-equivalent revocation holding the row lock wins the race; the blocked assignment attempt then correctly fails on the now-revoked membership', async () => {
    const race = holdMembershipLockThenRevoke(ORG, ids.staff, 2);
    await race.waitForSleep(5000);

    // Issued WHILE the background session holds FOR UPDATE and is
    // still sleeping. Pre-migration-095, this would have read the
    // membership as active (no lock contention on a plain SELECT) and
    // raced ahead to INSERT an active assignment. Post-fix, this call
    // must block on the SAME row lock until the background session's
    // revocation commits.
    const assignPromise = rpc('assign_staff_to_patient', { p_org_id: ORG, p_user_id: ids.staff, p_patient_id: patientId, p_org_role: 'caregiver' }, tok.director);

    await race.waitForExit();
    const [status, body] = (await assignPromise) as [number, { message?: string }];

    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.message).toContain('not an active');

    const assignmentCount = sql(`SELECT count(*) FROM staff_patient_assignments WHERE organization_id='${ORG}' AND user_id='${ids.staff}' AND patient_id='${patientId}' AND is_active=true;`);
    expect(assignmentCount).toBe('0');

    expect(race.stderr()).toBe('');
  }, 15000);

  it('restoring the membership to active lets assignment succeed normally (the lock change has no effect on ordinary sequential behavior)', async () => {
    sql(`UPDATE organization_memberships SET status='active' WHERE organization_id='${ORG}' AND user_id='${ids.staff}';`);
    const [status] = await rpc('assign_staff_to_patient', { p_org_id: ORG, p_user_id: ids.staff, p_patient_id: patientId, p_org_role: 'caregiver' }, tok.director);
    expect(status).toBe(200);
  });
});
