// Codex MMA-CODEX-09 — "concurrent official care-plan replacement."
// Reproduces the exact race migration 096 closes: record_patient_care_plan()
// previously computed the next version via a plain `SELECT max(version)+1`
// and superseded the prior plan via a plain UPDATE, with no lock of any
// kind — two concurrent callers for the SAME patient could both compute
// the same next version and both insert with is_current=true,
// violating the "exactly one current plan per patient" invariant.
//
// Technique: a background session holds an EXPLICIT pg_advisory_xact_lock
// on the exact same key record_patient_care_plan() now takes internally
// (hashtextextended('patient_care_plans:<patient_id>', 0)), sleeps, then
// calls the real RPC and commits — simulating "professional A is
// mid-transaction recording a plan." The foreground RPC call (as
// professional B) is issued while that lock is held; with migration
// 096's fix it must BLOCK until the background session's transaction
// commits, then compute the correct NEXT version rather than racing to
// the same one.
//
// Requires the local Docker Supabase stack. Run with
// `npm run test:integration`.
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';

const PW = 'CarePlanRace9!';
const stamp = Date.now();
const ORG = 'c0222222-2222-4222-8222-222222222222';

const emails = {
  director: `cpc-director-${stamp}@local.test`,
  medicalA: `cpc-medicalA-${stamp}@local.test`,
  medicalB: `cpc-medicalB-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientId: string;

beforeAll(async () => {
  for (const [name, email] of Object.entries(emails)) ids[name] = await authSignUp(email, PW);
  const patientEmail = `cpc-patient-${stamp}@local.test`;
  patientId = await authSignUp(patientEmail, PW);
  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id IN ('${Object.values(ids).join("','")}','${patientId}');
    DELETE FROM organizations WHERE id='${ORG}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES('${ORG}','CPC Org','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${ORG}',20,20,9999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG}','${ids.director}','director','active'),
      ('${ORG}','${ids.medicalA}','medical_professional','active'),
      ('${ORG}','${ids.medicalB}','medical_professional','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES('${patientId}','CPC','Patient','CPC Patient','1 CPC Ave','CPC Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${ORG}','${patientId}','active','${ids.director}');
    INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES
      ('${ORG}','${ids.medicalA}','${patientId}','medical_professional',true,'${ids.director}'),
      ('${ORG}','${ids.medicalB}','${patientId}','medical_professional',true,'${ids.director}');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);
}, 30000);

afterAll(async () => {
  sql(`DELETE FROM public.patients WHERE id='${patientId}'; DELETE FROM organizations WHERE id='${ORG}';`);
  for (const id of [...Object.values(ids), patientId]) await authDeleteUser(id);
});

function holdAdvisoryLockThenRecordPlan(patientIdForLock: string, sleepSeconds: number) {
  const statement = `SET application_name='cpc-plan-race'; BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('patient_care_plans:${patientIdForLock}', 0));
SELECT pg_sleep(${sleepSeconds});
COMMIT;`;
  // MMA-ENTERPRISE-ULTIMATE-MASTER-010 Section 3.3/16.4: see
  // lastSeatApprovalConcurrency.test.ts for the full rationale -- this
  // hardcoded 'supabase_db_repo' regardless of MMA_TEST_DB_CONTAINER,
  // spawning an unwanted session against the owner's real database
  // whenever it happened to be running. Fixed to use DB_CONTAINER.
  const proc = spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${process.env.MMA_TEST_DB_ADMIN_PASSWORD || 'postgres'}`, DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stdin.write(statement);
  proc.stdin.end();
  let stderrBuf = '';
  proc.stderr.on('data', (d) => (stderrBuf += d));
  return {
    waitForSleep: async (timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='cpc-plan-race' AND wait_event='PgSleep');") === 't') return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('No synchronized pause observed within ' + timeoutMs + 'ms');
    },
    waitForExit: () => new Promise<void>((resolve) => proc.on('close', () => resolve())),
    stderr: () => stderrBuf,
  };
}

describe('Codex MMA-CODEX-09 — record_patient_care_plan() is serialized per patient (migration 096)', () => {
  it('a concurrent call for the SAME patient blocks on the real RPC\'s own advisory lock until the first holder releases it, then gets the correct next version and exactly one current plan', async () => {
    const race = holdAdvisoryLockThenRecordPlan(patientId, 2);
    await race.waitForSleep(5000);

    // Issued while the advisory lock is held by the background
    // session. Pre-migration-096, this would have had nothing to wait
    // on at all (no lock existed in the RPC) and would have run
    // immediately, independent of any other concurrent caller.
    const planPromise = rpc('record_patient_care_plan', { p_patient_id: patientId, p_goals: 'Plan from medicalA', p_permitted_tasks: null, p_effective_date: '2026-01-01' }, tok.medicalA);

    await race.waitForExit();
    const [status, body] = (await planPromise) as [number, { version: number; is_current: boolean }];
    expect(status).toBe(200);
    expect(body.version).toBe(1);
    expect(body.is_current).toBe(true);
    expect(race.stderr()).toBe('');

    // A real second plan, issued normally (no artificial lock) right
    // after, must see the correct, already-incremented version — not
    // a repeat of version 1.
    const [status2, body2] = (await rpc('record_patient_care_plan', { p_patient_id: patientId, p_goals: 'Plan from medicalB', p_permitted_tasks: null, p_effective_date: '2026-01-01' }, tok.medicalB)) as [number, { version: number; is_current: boolean }];
    expect(status2).toBe(200);
    expect(body2.version).toBe(2);

    const currentCount = sql(`SELECT count(*) FROM patient_care_plans WHERE patient_id='${patientId}' AND is_current=true;`);
    expect(currentCount).toBe('1'); // the unique index's own invariant, confirmed directly

    sql(`DELETE FROM patient_care_plans WHERE patient_id='${patientId}';`);
  }, 15000);

  it('the partial unique index itself rejects a direct attempt to force two simultaneously current plans', async () => {
    sql(`INSERT INTO patient_care_plans (patient_id, goals, version, author_id, is_current) VALUES ('${patientId}', 'Direct plan 1', 1, '${ids.medicalA}', true);`);
    expect(() => sql(`INSERT INTO patient_care_plans (patient_id, goals, version, author_id, is_current) VALUES ('${patientId}', 'Direct plan 2', 2, '${ids.medicalB}', true);`)).toThrow();
    sql(`DELETE FROM patient_care_plans WHERE patient_id='${patientId}';`);
  });
});
