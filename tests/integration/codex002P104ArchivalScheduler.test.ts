// MMA-P1-CODEX-002 P1-04 -- "Automatic archival and isolated five-minute
// mode." Migration 153 (public.archival_interval()) + scripts/
// disposable_archival_scheduler.mjs (pg_cron enablement, kept OUT of the
// migration stream -- see that file's header for why).
//
// Reproduces the SAME two commands that script runs (ALTER DATABASE ...
// SET / CREATE EXTENSION pg_cron / cron.schedule) directly via sql() so
// this test is self-contained, then proves TWO separate things:
//   1. close_patient_coverage() computes scheduled_archival_at exactly
//      5 minutes after closed_at when the test-interval override is
//      active (verified by direct interval arithmetic -- no waiting
//      required for this part).
//   2. The pg_cron-scheduled sweep ACTUALLY fires on its own and
//      archives an eligible row -- this test never calls
//      archive_eligible_closed_patients() itself for this case. A real
//      wait (up to ~70s, bounded by the cron tick's 1-minute cadence) is
//      used; this is the genuine "scheduler invokes the processing
//      function" proof the audit specifically requires ("a manual
//      archival function alone does not satisfy this requirement").
//
// *** ISOLATION WARNING, read before running ***
// ALTER DATABASE ... SET and a scheduled cron job are GLOBAL to this
// disposable Postgres instance, not scoped to this test file's
// connections. Run this file in isolation from the rest of the
// integration suite (e.g. `--fileParallelism=false --maxWorkers=1`, the
// same flags the independent Codex audit's own regression command
// already uses) to avoid racing migration 146's test, which asserts the
// real 45-day production default. afterAll always disables the override
// and unschedules the job before this file's run completes.
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, DB_CONTAINER } from './_runtime';

// `ALTER DATABASE ... SET` of a custom GUC and `CREATE EXTENSION` both
// require real Postgres superuser privilege -- confirmed empirically
// this session: the plain `postgres` role sql() otherwise uses is NOT a
// superuser in this Supabase Docker image and is refused with
// "permission denied to set parameter" / extension creation failures.
// supabase_admin IS the real superuser; it requires a password even
// though the `postgres` connection does not (same documented local-only
// demo password every other admin-role helper in this file already
// uses -- see _runtime.ts's own getSeatRaceHolder()).
function sqlAdmin(statement: string): string {
  return execSync(
    `docker exec -i -e PGPASSWORD=${process.env.MMA_TEST_DB_ADMIN_PASSWORD || 'postgres'} ${DB_CONTAINER} psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1`,
    { input: statement },
  ).toString().trim();
}

const PW = 'Codex002P104Fix9!';
const stamp = Date.now();
const ORG_INTERVAL = 'f0153101-1001-4101-8101-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_AUTO = 'f0153102-1002-4102-8102-' + String(stamp).padStart(12, '0').slice(-12);

const emails = {
  director: `codex002p104-director-${stamp}@local.test`,
};
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientInterval: string;
let patientAuto: string;

beforeAll(async () => {
  ids.director = await authSignUp(emails.director, PW);
  patientInterval = await authSignUp(`codex002p104-patientInterval-${stamp}@local.test`, PW);
  patientAuto = await authSignUp(`codex002p104-patientAuto-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
    WHERE id IN ('${ids.director}','${patientInterval}','${patientAuto}');
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_INTERVAL}','Codex002 P1-04 Interval Org ${stamp}','integrated_care','${ids.director}'),
      ('${ORG_AUTO}','Codex002 P1-04 Auto Org ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_INTERVAL}',10,10,999,'active'),('${ORG_AUTO}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_INTERVAL}','${ids.director}','director','active'),
      ('${ORG_AUTO}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${patientInterval}','Codex002','PatientInterval','Codex002 PatientInterval','1 Ave','Facility'),
      ('${patientAuto}','Codex002','PatientAuto','Codex002 PatientAuto','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
      ('${ORG_INTERVAL}','${patientInterval}','active'),
      ('${ORG_AUTO}','${patientAuto}','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  // Mirrors scripts/disposable_archival_scheduler.mjs's "enable" command
  // exactly.
  sqlAdmin(`ALTER DATABASE postgres SET app.settings.archival_test_interval = '5 minutes';`);
  sqlAdmin(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
  sqlAdmin(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
  sqlAdmin(`SELECT cron.schedule('mma-archival-sweep', '* * * * *', 'SELECT public.archive_eligible_closed_patients();');`);
}, 30000);

afterAll(async () => {
  // Mirrors the script's "disable" command -- always runs, restoring the
  // real 45-day default for every other test file.
  sqlAdmin(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
  sqlAdmin(`ALTER DATABASE postgres RESET app.settings.archival_test_interval;`);
  sql(`
    DELETE FROM account_management_audit WHERE organization_id IN ('${ORG_INTERVAL}','${ORG_AUTO}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_INTERVAL}','${ORG_AUTO}');
    DELETE FROM organizations WHERE id IN ('${ORG_INTERVAL}','${ORG_AUTO}');
    DELETE FROM patients WHERE id IN ('${patientInterval}','${patientAuto}');
  `);
  for (const id of [ids.director, patientInterval, patientAuto]) await authDeleteUser(id);
});

describe('MMA-P1-CODEX-002 P1-04 (migration 153 + disposable_archival_scheduler.mjs) — configurable archival interval and real automatic scheduling', () => {
  it('close_patient_coverage() schedules archival exactly 5 minutes out while the isolated test-interval override is active', async () => {
    // Called via a direct SQL session (fresh connection -- picks up the
    // database-level override immediately), not through the REST RPC:
    // PostgREST maintains its own long-lived connection pool that may
    // have been established before this file's ALTER DATABASE ran, and
    // an already-open session does not re-read a database-level default
    // mid-connection. SET ROLE authenticated + set_config() reproduces
    // the same authenticated identity/RLS context a real RPC call would
    // have (the same pattern codex011PerRoleLicenseCaps.test.ts's own
    // concurrency test already uses), so this still exercises the real
    // function under the real caller identity -- only the transport
    // differs.
    sql(`
      BEGIN;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${ids.director}', true);
      SELECT (public.close_patient_coverage('${ORG_INTERVAL}', '${patientInterval}', 'Interval verification', 'Checking the configured test interval.')).status;
      COMMIT;
    `);

    const diffSeconds = sql(`SELECT extract(epoch FROM (scheduled_archival_at - closed_at))::int FROM covered_patient_memberships WHERE organization_id='${ORG_INTERVAL}' AND patient_id='${patientInterval}';`);
    expect(Number(diffSeconds)).toBeGreaterThanOrEqual(295);
    expect(Number(diffSeconds)).toBeLessThanOrEqual(305);
  });

  it(
    'the pg_cron-scheduled sweep automatically archives an eligible row with no direct call to archive_eligible_closed_patients() from this test',
    async () => {
      const [closeStatus] = await rpc('close_patient_coverage', {
        p_org_id: ORG_AUTO, p_patient_id: patientAuto, p_reason: 'Automatic scheduling verification', p_notes: 'Backdating eligibility to observe the real cron tick.',
      }, tok.director);
      expect(closeStatus).toBe(200);

      // Independent of the exact interval VALUE (already proven above):
      // this half proves the SCHEDULER itself fires without any manual
      // invocation. Backdating only the eligibility timestamp, not
      // calling the archival function, isolates that claim.
      sql(`UPDATE covered_patient_memberships SET scheduled_archival_at = now() - INTERVAL '10 seconds' WHERE organization_id='${ORG_AUTO}' AND patient_id='${patientAuto}';`);

      const deadline = Date.now() + 70000;
      let finalStatus = 'closed';
      while (Date.now() < deadline) {
        finalStatus = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_AUTO}' AND patient_id='${patientAuto}';`);
        if (finalStatus === 'archived') break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      expect(finalStatus).toBe('archived');

      const jobRanAt = sqlAdmin(`SELECT count(*) FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='mma-archival-sweep') AND status='succeeded';`);
      expect(Number(jobRanAt)).toBeGreaterThan(0);
    },
    90000,
  );

  it('the real 45-day production default is unaffected after this file disables its own override', async () => {
    // Direct arithmetic check, independent of the afterAll hook timing,
    // proving the override is a true opt-in and not a permanent change
    // to archival_interval()'s own fallback behavior.
    sqlAdmin(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
    sqlAdmin(`ALTER DATABASE postgres RESET app.settings.archival_test_interval;`);
    const interval = sql(`SELECT public.archival_interval()::text;`);
    expect(interval).toBe('45 days');
    // Restore the override for any remaining tests/afterAll in this file.
    sqlAdmin(`ALTER DATABASE postgres SET app.settings.archival_test_interval = '5 minutes';`);
  });
});
