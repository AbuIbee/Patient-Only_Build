// MMA-P1-FINAL-CLOSURE Priority 4 — "Do not use a backdated deadline as
// a substitute for this final elapsed-time acceptance test." Every
// prior archival test (codex002P104ArchivalScheduler.test.ts) backdated
// scheduled_archival_at to prove the cron tick fires and separately
// proved the 5-minute VALUE by arithmetic -- both real, but neither is a
// genuine end-to-end "close now, wait the real interval, observe
// automatic archival" run. This file is that run: a real
// close_patient_coverage() call through the real RPC, a REAL wait of
// the actual configured 5-minute interval (no manual archive_eligible_
// closed_patients() call, no backdated timestamp), covering all ten
// required items in the same lifecycle:
//   1. synthetic coverage relationship created
//   2. closed through the authorized workflow
//   3. scheduled archival time confirmed (real, ~5 min out)
//   4. the real interval is allowed to elapse (genuine wall-clock wait)
//   5. automatic archival verified without manually invoking the sweep
//   6. archival audit record verified
//   7. legal-hold behavior verified (a second, held patient closed at
//      the same time is NOT archived when the sweep runs)
//   8. idempotency verified (sweep re-run causes no double-transition)
//   9. multi-organization isolation verified (a third patient, covered
//      by a SECOND org, is unaffected by the first org's closure/archival)
//  10. the production interval cannot accidentally become 5 minutes --
//      verified directly: a fourth org/patient closed with NO override
//      active schedules the real 45-day production interval.
//
// *** REAL ~5-6 MINUTE TEST. Isolation warning as in
// codex002P104ArchivalScheduler.test.ts: run standalone
// (--fileParallelism=false) -- this file alters database-level state
// (the test-interval GUC, a scheduled cron job) global to the whole
// disposable instance for its duration, and restores both in afterAll.
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, sql, SERVICE, DB_CONTAINER } from './_runtime';

function sqlAdmin(statement: string): string {
  return execSync(
    `docker exec -i -e PGPASSWORD=${process.env.MMA_TEST_DB_ADMIN_PASSWORD || 'postgres'} ${DB_CONTAINER} psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1`,
    { input: statement },
  ).toString().trim();
}

const PW = 'ClosureP4RealFix9!';
const stamp = Date.now();
const ORG_A = 'f0158201-2101-4201-8101-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_B = 'f0158202-2102-4202-8102-' + String(stamp).padStart(12, '0').slice(-12);
const ORG_C = 'f0158203-2103-4203-8103-' + String(stamp).padStart(12, '0').slice(-12);

const emails = { director: `closurep4-director-${stamp}@local.test` };
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let patientMain: string; // ORG_A — the real end-to-end wait
let patientHeld: string; // ORG_A — closed at the same time, under legal hold
let patientShared: string; // covered by ORG_A AND ORG_B — multi-org isolation
let patientNoOverride: string; // ORG_C — closed with NO test-interval override active

beforeAll(async () => {
  ids.director = await authSignUp(emails.director, PW);
  patientMain = await authSignUp(`closurep4-patientMain-${stamp}@local.test`, PW);
  patientHeld = await authSignUp(`closurep4-patientHeld-${stamp}@local.test`, PW);
  patientShared = await authSignUp(`closurep4-patientShared-${stamp}@local.test`, PW);
  patientNoOverride = await authSignUp(`closurep4-patientNoOverride-${stamp}@local.test`, PW);

  sql(`
    UPDATE profiles SET must_change_password=false, provisioning_status='complete'
    WHERE id IN ('${ids.director}','${patientMain}','${patientHeld}','${patientShared}','${patientNoOverride}');
    -- Reused as both Director and Platform Owner for this test's legal-
    -- hold step only -- place_patient_legal_hold() requires
    -- is_platform_owner(), which no Director holds by default.
    UPDATE profiles SET role='admin' WHERE id='${ids.director}';
    BEGIN;
    INSERT INTO organizations(id,name,package_type,created_by) VALUES
      ('${ORG_A}','Closure P4 Org A ${stamp}','integrated_care','${ids.director}'),
      ('${ORG_B}','Closure P4 Org B ${stamp}','integrated_care','${ids.director}'),
      ('${ORG_C}','Closure P4 Org C ${stamp}','integrated_care','${ids.director}');
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES
      ('${ORG_A}',10,10,999,'active'),('${ORG_B}',10,10,999,'active'),('${ORG_C}',10,10,999,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES
      ('${ORG_A}','${ids.director}','director','active'),
      ('${ORG_B}','${ids.director}','director','active'),
      ('${ORG_C}','${ids.director}','director','active');
    INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES
      ('${patientMain}','ClosureP4','Main','ClosureP4 Main','1 Ave','Facility'),
      ('${patientHeld}','ClosureP4','Held','ClosureP4 Held','1 Ave','Facility'),
      ('${patientShared}','ClosureP4','Shared','ClosureP4 Shared','1 Ave','Facility'),
      ('${patientNoOverride}','ClosureP4','NoOverride','ClosureP4 NoOverride','1 Ave','Facility');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status) VALUES
      ('${ORG_A}','${patientMain}','active'),
      ('${ORG_A}','${patientHeld}','active'),
      ('${ORG_A}','${patientShared}','active'),
      ('${ORG_B}','${patientShared}','active'),
      ('${ORG_C}','${patientNoOverride}','active');
    COMMIT;
  `);
  for (const [name, email] of Object.entries(emails)) tok[name] = await login(email, PW);

  // Isolated test interval, exactly as scripts/disposable_archival_
  // scheduler.mjs's "enable" command -- NOT active yet for the Item-10
  // no-override check below, which runs BEFORE this.
}, 30000);

afterAll(async () => {
  sqlAdmin(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
  sqlAdmin(`ALTER DATABASE postgres RESET app.settings.archival_test_interval;`);
  sql(`
    DELETE FROM account_management_audit WHERE organization_id IN ('${ORG_A}','${ORG_B}','${ORG_C}');
    DELETE FROM patient_legal_holds WHERE patient_id IN ('${patientMain}','${patientHeld}','${patientShared}','${patientNoOverride}');
    DELETE FROM covered_patient_memberships WHERE organization_id IN ('${ORG_A}','${ORG_B}','${ORG_C}');
    DELETE FROM organizations WHERE id IN ('${ORG_A}','${ORG_B}','${ORG_C}');
    DELETE FROM patients WHERE id IN ('${patientMain}','${patientHeld}','${patientShared}','${patientNoOverride}');
  `);
  for (const id of [ids.director, patientMain, patientHeld, patientShared, patientNoOverride]) await authDeleteUser(id);
});

describe('MMA-P1-FINAL-CLOSURE Priority 4 — real, non-backdated end-to-end archival', () => {
  it('Item 10: with NO test-interval override active, closing coverage schedules the real 45-day production interval', async () => {
    const [status] = await rpc('close_patient_coverage', {
      p_org_id: ORG_C, p_patient_id: patientNoOverride, p_reason: 'Production-interval check', p_notes: 'No override active at this point in the test.',
    }, tok.director);
    expect(status).toBe(200);
    const diffDays = sql(`SELECT extract(day FROM (scheduled_archival_at - closed_at))::int FROM covered_patient_memberships WHERE organization_id='${ORG_C}' AND patient_id='${patientNoOverride}';`);
    expect(diffDays).toBe('45');
  });

  it(
    '1-9: a real coverage relationship, closed now, under the real 5-minute interval, is automatically archived after a genuine wall-clock wait -- with legal-hold and multi-org isolation verified in the same run',
    async () => {
      // Enable the isolated test interval + real pg_cron sweep NOW --
      // after Item 10's no-override check, so that check is genuinely
      // unaffected by this file's own override.
      sqlAdmin(`ALTER DATABASE postgres SET app.settings.archival_test_interval = '5 minutes';`);
      sqlAdmin(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
      sqlAdmin(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
      sqlAdmin(`SELECT cron.schedule('mma-archival-sweep', '* * * * *', 'SELECT public.archive_eligible_closed_patients();');`);

      // Item 1 + 2: real coverage relationships, closed through the
      // real authorized workflow (not backdated). Called via direct SQL
      // (fresh connection per call -- picks up the database-level
      // override immediately), NOT the REST RPC: PostgREST's own
      // long-lived connection pool may have been established before
      // this test's ALTER DATABASE ran, and an already-open session
      // does not re-read a database-level default mid-connection --
      // confirmed empirically this session (the first attempt via
      // rpc() silently scheduled the real 45-day default instead of the
      // 5-minute override). SET ROLE authenticated + set_config()
      // reproduces the same authenticated identity/RLS context a real
      // RPC call would have.
      const closedAtBefore = Date.now();
      sql(`
        BEGIN;
        SET ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${ids.director}', true);
        SELECT (public.close_patient_coverage('${ORG_A}', '${patientMain}', 'Real end-to-end archival test', 'Genuine wall-clock wait, no backdating.')).status;
        COMMIT;
      `);

      sql(`
        BEGIN;
        SET ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${ids.director}', true);
        SELECT (public.close_patient_coverage('${ORG_A}', '${patientHeld}', 'Legal-hold isolation check', 'Closed at the same time as the main patient; must not auto-archive while held.')).status;
        COMMIT;
      `);
      const [holdStatus] = await rpc('place_patient_legal_hold', { p_patient_id: patientHeld, p_reason: 'Pending review' }, tok.director);
      expect(holdStatus).toBeLessThan(300);

      sql(`
        BEGIN;
        SET ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${ids.director}', true);
        SELECT (public.close_patient_coverage('${ORG_A}', '${patientShared}', 'Multi-org isolation check', 'Org B must retain active coverage of this same patient throughout.')).status;
        COMMIT;
      `);

      // Item 3: scheduled archival time confirmed real (~5 minutes from
      // now, not a backdated/past timestamp).
      // Avoid JS Date string-parsing of Postgres' timestamptz::text
      // output entirely (its "+00" two-digit offset with no colon is
      // NOT valid ISO 8601 and silently parses to NaN in Node) --
      // compute the epoch directly in SQL instead.
      const scheduledEpochMs = Number(sql(`SELECT (extract(epoch FROM scheduled_archival_at) * 1000)::bigint FROM covered_patient_memberships WHERE organization_id='${ORG_A}' AND patient_id='${patientMain}';`));
      const scheduledMs = scheduledEpochMs;
      const deltaSeconds = (scheduledMs - closedAtBefore) / 1000;
      expect(deltaSeconds).toBeGreaterThan(280);
      expect(deltaSeconds).toBeLessThan(320);

      // Item 4 + 5: GENUINE wall-clock wait for the real interval to
      // elapse and the real pg_cron tick to pick it up -- no manual
      // archive_eligible_closed_patients() call anywhere in this test.
      const deadline = scheduledMs + 90_000; // interval + one cron tick + margin
      let finalStatus = 'closed';
      while (Date.now() < deadline) {
        finalStatus = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_A}' AND patient_id='${patientMain}';`);
        if (finalStatus === 'archived') break;
        await new Promise((r) => setTimeout(r, 15_000));
      }
      if (finalStatus !== 'archived') {
        // Do not waive or shorten the actual wall-clock archival requirement.
        // Surface pg_cron execution evidence so a CI failure distinguishes an
        // inactive schedule, worker failure, permission denial or archive logic.
        const cronJob = sqlAdmin(`SELECT COALESCE(string_agg(jobid::text || ':active=' || active::text, ', '), 'none')
          FROM cron.job WHERE jobname='mma-archival-sweep';`);
        const recentRuns = sqlAdmin(`SELECT COALESCE(string_agg(status || ': ' || COALESCE(return_message, ''), ' | '), 'none')
          FROM (SELECT status, return_message FROM cron.job_run_details
          WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='mma-archival-sweep')
          ORDER BY start_time DESC LIMIT 8) runs;`);
        throw new Error(`Real archival incomplete: status=${finalStatus}, cronJob=${cronJob}, cronRuns=${recentRuns}`);
      }
      expect(finalStatus).toBe('archived');

      // Item 6: archival audit record.
      const auditRow = sql(`SELECT action_type FROM account_management_audit WHERE organization_id='${ORG_A}' AND target_user_id='${patientMain}' AND action_type='patient_coverage_archived' ORDER BY created_at DESC LIMIT 1;`);
      expect(auditRow).toBe('patient_coverage_archived');

      // Item 7: the held patient, closed at the same moment, is past its
      // own 5-minute deadline by now too, but must remain 'closed', not
      // 'archived' -- the real sweep already ran multiple times by this
      // point and correctly skipped it.
      const heldFinal = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_A}' AND patient_id='${patientHeld}';`);
      expect(heldFinal).toBe('closed');
      const heldSkipAudit = sql(`SELECT count(*) FROM account_management_audit WHERE organization_id='${ORG_A}' AND target_user_id='${patientHeld}' AND action_type='patient_archival_skipped_legal_hold';`);
      expect(Number(heldSkipAudit)).toBeGreaterThan(0);

      // Item 9: multi-org isolation -- Org B's coverage of the SAME
      // patient was never touched by Org A's closure/archival.
      const orgBStatus = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_B}' AND patient_id='${patientShared}';`);
      expect(orgBStatus).toBe('active');

      // Item 8: idempotency -- re-running the real sweep (service_role,
      // the only grant on this RPC) now causes no double-transition and
      // no error.
      const [sweepStatus] = await rpc('archive_eligible_closed_patients', {}, SERVICE);
      expect(sweepStatus).toBe(200);
      const stillArchived = sql(`SELECT status FROM covered_patient_memberships WHERE organization_id='${ORG_A}' AND patient_id='${patientMain}';`);
      expect(stillArchived).toBe('archived');
    },
    400_000,
  );
});
