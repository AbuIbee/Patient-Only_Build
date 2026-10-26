// MMA-SUPABASE-RECONCILIATION-AND-EXECUTION-012 Section 7 — pure,
// side-effect-free fail-closed target validation, split out of
// _runtime.ts specifically so it can be imported and exercised by a
// permanent test (_runtimeFailClosedTargetValidation.test.ts) WITHOUT
// that import itself triggering _runtime.ts's own module-level
// `requireEnv()` calls (which read process.env the moment that module
// is imported). Importing _runtime.ts to test its own safety check
// would mean the test's required negative cases -- env vars unset,
// env vars pointed at the owner's real database -- could never
// actually be exercised, because the module import would already have
// thrown (or silently passed) before the test body ran.
import { execSync } from 'node:child_process';

export const FORBIDDEN_CONTAINER_NAMES = new Set(['supabase_db_repo']);
// The Supabase CLI's own compose/project label for the owner's
// persistent stack is literally 'repo' (derived from this repository's
// own directory name) -- checked independently of the container NAME
// so that an alias, rename, or a differently-named container that is
// still actually the owner's real project gets caught too.
export const FORBIDDEN_CLI_PROJECT_LABELS = new Set(['repo']);

export function requireEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  const value = env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `${name} must be explicitly set to run tests/integration/**. There is no default. ` +
        'This is deliberate (MMA-SUPABASE-RECONCILIATION-AND-EXECUTION-012 Section 7): a default here ' +
        "previously pointed at the owner's real persistent local database. Start a disposable stack " +
        '(scripts/disposable_supabase.mjs) and pass MMA_TEST_API_BASE + MMA_TEST_DB_CONTAINER explicitly.',
    );
  }
  return value.trim();
}

export function assertDisposableTarget(base: string, container: string): void {
  let hostname: string;
  try {
    hostname = new URL(base).hostname;
  } catch {
    throw new Error(`MMA_TEST_API_BASE ("${base}") is not a valid URL.`);
  }
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(
      `MMA_TEST_API_BASE ("${base}") must point at a local stack (127.0.0.1/localhost). ` +
        'A non-local host is never a valid integration-test target, disposable or otherwise.',
    );
  }
  if (FORBIDDEN_CONTAINER_NAMES.has(container)) {
    throw new Error(
      `MMA_TEST_DB_CONTAINER ("${container}") is the owner's real persistent database. ` +
        'Integration tests must never target it. Use a disposable stack instead.',
    );
  }
  // Defense in depth: confirm, via Docker's own label on the resolved
  // container, that this is not the owner's project under a different
  // container name/alias. If Docker/the container is unreachable here,
  // fail closed (do not assume safety) rather than silently proceeding.
  let label: string;
  try {
    label = execSync(
      `docker inspect ${container} --format "{{index .Config.Labels \\"com.supabase.cli.project\\"}}"`,
    )
      .toString()
      .trim();
  } catch (err) {
    throw new Error(
      `Could not verify MMA_TEST_DB_CONTAINER ("${container}") is a disposable stack (docker inspect failed: ` +
        `${(err as Error).message}). Failing closed rather than assuming safety -- confirm the container is running.`,
    );
  }
  if (FORBIDDEN_CLI_PROJECT_LABELS.has(label)) {
    throw new Error(
      `MMA_TEST_DB_CONTAINER ("${container}") carries the owner's real project label ("${label}"), ` +
        'even though its container name differs. Refusing to run tests against it.',
    );
  }
}
