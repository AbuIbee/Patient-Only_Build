#!/usr/bin/env node
// MMA-P1-CODEX-002 P1-04 — "Automatic archival... a manual archival
// function alone does not satisfy this requirement." This script is the
// ONLY place in this repository that enables pg_cron and schedules
// archive_eligible_closed_patients() to run automatically. It is
// deliberately NOT part of supabase/migrations/ -- enabling an extension
// and scheduling a recurring job is a real platform-configuration
// action, not a plain additive schema change, and the directive requires
// implementing it "without enabling it on a protected environment."
//
// *** DISPOSABLE/TEST ENVIRONMENT ONLY ***
// Never run this against Enterprise staging (axurszlibxwwptkczztt) or
// consumer production (ktehhvmmwnsbcvpjcmzt) without separate, explicit
// Platform Owner deployment authorization. Reuses the exact same
// fail-closed target validation tests/integration/_runtime.ts/
// _targetValidation.ts already uses for every mutating test in this
// repository: refuses to run unless MMA_TEST_DB_CONTAINER is explicitly
// set, is not the owner's real container name, and does not carry the
// owner's real Supabase CLI project label.
//
// Usage:
//   MMA_TEST_DB_CONTAINER=supabase_db_mma-ent-caregiver-master-003 \
//     node scripts/disposable_archival_scheduler.mjs enable   # pg_cron + a 1-minute sweep tick
//   MMA_TEST_DB_CONTAINER=supabase_db_mma-ent-caregiver-master-003 \
//     node scripts/disposable_archival_scheduler.mjs disable  # unschedule + reset the interval override
import { execFileSync, execSync } from 'node:child_process';

const FORBIDDEN_CONTAINER_NAMES = new Set(['supabase_db_repo']);
const FORBIDDEN_CLI_PROJECT_LABELS = new Set(['repo']);

const container = process.env.MMA_TEST_DB_CONTAINER;
if (!container || !container.trim()) {
  console.error('MMA_TEST_DB_CONTAINER must be explicitly set. There is no default -- this never silently targets the owner\'s real database.');
  process.exit(1);
}
if (FORBIDDEN_CONTAINER_NAMES.has(container)) {
  console.error(`MMA_TEST_DB_CONTAINER ("${container}") is the owner's real persistent database. Refusing to run.`);
  process.exit(1);
}
let label;
try {
  label = execSync(`docker inspect ${container} --format "{{index .Config.Labels \\"com.supabase.cli.project\\"}}"`).toString().trim();
} catch (err) {
  console.error(`Could not verify MMA_TEST_DB_CONTAINER ("${container}") is a disposable stack: ${err.message}. Failing closed.`);
  process.exit(1);
}
if (FORBIDDEN_CLI_PROJECT_LABELS.has(label)) {
  console.error(`MMA_TEST_DB_CONTAINER ("${container}") carries the owner's real project label ("${label}"). Refusing to run.`);
  process.exit(1);
}

function psql(sql) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
  }).toString().trim();
}

const cmd = process.argv[2];
if (cmd === 'enable') {
  // "Approved test configuration: five minutes after closure" --
  // close_patient_coverage() (migration 153) reads this exact GUC via
  // public.archival_interval(); it cannot be set by any PostgREST/RPC
  // caller, only by this direct superuser session.
  psql(`ALTER DATABASE postgres SET app.settings.archival_test_interval = '5 minutes';`);
  psql(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
  // 1-minute tick -- frequent enough to observe automatic archival
  // within roughly a minute of a row becoming eligible, without pg_cron's
  // own non-standard sub-minute syntax.
  psql(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
  psql(`SELECT cron.schedule('mma-archival-sweep', '* * * * *', 'SELECT public.archive_eligible_closed_patients();');`);
  console.log(`[disposable_archival_scheduler] enabled on ${container}: 5-minute test interval, 1-minute cron sweep tick.`);
} else if (cmd === 'disable') {
  psql(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mma-archival-sweep';`);
  psql(`ALTER DATABASE postgres RESET app.settings.archival_test_interval;`);
  console.log(`[disposable_archival_scheduler] disabled on ${container}: sweep unscheduled, interval override reset to the 45-day default.`);
} else {
  console.error('Usage: MMA_TEST_DB_CONTAINER=<container> node scripts/disposable_archival_scheduler.mjs <enable|disable>');
  process.exit(1);
}
