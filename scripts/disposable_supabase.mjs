#!/usr/bin/env node
// MMA-ENT-CAREGIVER-MASTER-003, Phase D — "reproducible, secure
// non-production testing setup that does not depend on deleting or
// altering the owner's existing local database."
//
// supabase_db_repo (127.0.0.1:55321/55322) is the owner's own persistent
// local dev database -- confirmed to hold 1,190 real auth.users rows
// with migration history frozen at 104 before this branch's own
// migrations land on it. tests/integration/** has historically targeted
// it directly, which is exactly the risk this script removes: every
// command below operates ONLY on a throwaway project in a temp
// directory, on ports well clear of 55321-55329 (supabase_db_repo) and
// 54321-54329 (PAY2PAY), that is destroyed on `stop`.
//
// Usage:
//   node scripts/disposable_supabase.mjs start   # provision + db reset
//   node scripts/disposable_supabase.mjs stop    # tear down, --no-backup
//   node scripts/disposable_supabase.mjs env     # print the env vars to export
//
// After `start`, run the integration suite against it with:
//   MMA_TEST_API_BASE=http://127.0.0.1:57321 MMA_TEST_DB_CONTAINER=supabase_db_mma-ent-caregiver-master-003 \
//     npx vitest run --config vitest.integration.config.ts <files...>
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const PROJECT_ID = 'mma-ent-caregiver-master-003';
const WORKDIR = join(tmpdir(), PROJECT_ID);

// Deliberately far from supabase_db_repo's 55321-55329 and PAY2PAY's
// 54321-54329, and from the now-torn-down audit stack's 56321-56329.
const PORTS = {
  api: 57321,
  db: 57322,
  shadow: 57320,
  pooler: 57329,
  studio: 57323,
  inbucket: 57324,
  analytics: 57327,
  inspector: 58083,
};

// MMA-ENT-CAREGIVER-MASTER-004, Workstream D (H15): the owner's actual
// provision-caregiver-patient/regenerate-activation-link Edge Functions
// only ever generate an activation link for a callbackOrigin on their
// own hardcoded ALLOWED_REDIRECT_ORIGINS allowlist -- correctly, so a
// disposable test frontend is deliberately never on it. Their fallback
// is APP_URL, read from supabase/functions/.env by the LOCAL edge
// runtime (supabase start's own bundled container, not a separate
// `functions serve` process) -- this is the test-ENVIRONMENT-only fix
// the independent audit's H15 finding called for: "Correct the isolated
// test environment only... Do not modify production callback settings."
// No change to the committed Edge Function source or its allowlist.
// 5280 matches this project's own established `vite --port 5280`
// convention for pointing a local dev server at this disposable stack.
const TEST_FRONTEND_PORT = 5280;

function rewriteConfig(configText) {
  return configText
    .replace(/^project_id = ".*"$/m, `project_id = "${PROJECT_ID}"`)
    .replace(/^(port = )55321$/m, `$1${PORTS.api}`)
    .replace(/^(port = )55322$/m, `$1${PORTS.db}`)
    .replace(/^(shadow_port = )55320$/m, `$1${PORTS.shadow}`)
    .replace(/^(port = )55329$/m, `$1${PORTS.pooler}`)
    .replace(/^(port = )55323$/m, `$1${PORTS.studio}`)
    .replace(/^(port = )55324$/m, `$1${PORTS.inbucket}`)
    .replace(/^(port = )55327$/m, `$1${PORTS.analytics}`)
    .replace(/^(inspector_port = )8083$/m, `$1${PORTS.inspector}`);
}

function start() {
  // Windows occasionally holds a brief handle on the workdir right
  // after a prior `supabase stop` (antivirus scan / docker bind-mount
  // teardown lag) — observed as a transient EPERM here even though
  // nothing in this process itself has the directory open. maxRetries/
  // retryDelay (native to fs.rmSync) ride that out instead of failing
  // the whole reproducible-setup script on a race that isn't really an
  // error.
  rmSync(WORKDIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  mkdirSync(join(WORKDIR, 'supabase'), { recursive: true });
  cpSync(join(REPO_ROOT, 'supabase', 'migrations'), join(WORKDIR, 'supabase', 'migrations'), { recursive: true });
  if (existsSync(join(REPO_ROOT, 'supabase', 'functions'))) {
    cpSync(join(REPO_ROOT, 'supabase', 'functions'), join(WORKDIR, 'supabase', 'functions'), { recursive: true });
    // H15: APP_URL fallback for the activation-link Edge Functions —
    // see the comment on TEST_FRONTEND_PORT above. Written only into
    // this throwaway workdir's own copy, never into the repo's actual
    // supabase/functions/.
    writeFileSync(join(WORKDIR, 'supabase', 'functions', '.env'), `APP_URL=http://127.0.0.1:${TEST_FRONTEND_PORT}\n`);
  }
  const seedPath = join(REPO_ROOT, 'supabase', 'seed.sql');
  if (existsSync(seedPath)) cpSync(seedPath, join(WORKDIR, 'supabase', 'seed.sql'));

  const config = readFileSync(join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8');
  writeFileSync(join(WORKDIR, 'supabase', 'config.toml'), rewriteConfig(config));

  console.log(`[disposable_supabase] starting disposable project "${PROJECT_ID}" at ${WORKDIR}`);
  execFileSync('npx', ['supabase', 'start', '--workdir', WORKDIR], { stdio: 'inherit', shell: true });

  console.log(`[disposable_supabase] applying all repository migrations (db reset)`);
  execFileSync('npx', ['supabase', 'db', 'reset', '--workdir', WORKDIR, '--local'], { stdio: 'inherit', shell: true });

  console.log('\n[disposable_supabase] ready. Export before running integration tests:');
  console.log(`  MMA_TEST_API_BASE=http://127.0.0.1:${PORTS.api}`);
  console.log(`  MMA_TEST_DB_CONTAINER=supabase_db_${PROJECT_ID}`);
  console.log(`\n[disposable_supabase] for a browser session (H15 registration/activation, UI acceptance), run the frontend against this stack with:`);
  console.log(`  VITE_SUPABASE_URL=http://127.0.0.1:${PORTS.api} VITE_SUPABASE_ANON_KEY=<local demo anon key, see tests/integration/_runtime.ts> \\`);
  console.log(`    VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY=price_test npx vite --host 127.0.0.1 --port ${TEST_FRONTEND_PORT} --strictPort`);
}

function stop() {
  if (!existsSync(WORKDIR)) {
    console.log('[disposable_supabase] nothing to stop (no workdir found).');
    return;
  }
  spawnSync('npx', ['supabase', 'stop', '--workdir', WORKDIR, '--no-backup'], { stdio: 'inherit', shell: true });
  rmSync(WORKDIR, { recursive: true, force: true });
  console.log('[disposable_supabase] stopped and workdir removed.');
}

function printEnv() {
  console.log(`MMA_TEST_API_BASE=http://127.0.0.1:${PORTS.api}`);
  console.log(`MMA_TEST_DB_CONTAINER=supabase_db_${PROJECT_ID}`);
}

const cmd = process.argv[2];
if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'env') printEnv();
else {
  console.error('Usage: node scripts/disposable_supabase.mjs <start|stop|env>');
  process.exit(1);
}
