// MMA-CODEX-011 finding 011-12 (F-20, P2): every one of these e2e specs
// hardcoded BASE='http://127.0.0.1:5180', API_BASE='http://127.0.0.1:55321'
// and a docker exec against the literal container name supabase_db_repo
// -- all three being the OWNER'S REAL, PERSISTENT local stack (the exact
// one tests/integration/_runtime.ts was already fixed, earlier this
// engagement, to never default to). A human running `npx playwright
// test` locally -- or any CI job that did the same with no backend set
// up at all -- would either hit nothing (BASE/API_BASE unreachable) or,
// if the owner's own `supabase start` happened to be running at the
// time, execute real signups/writes/deletes against their real database
// and users. No default here is safe; every e2e spec must say explicitly
// where it's pointed.
export function requireE2eEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `${name} must be explicitly set to run this e2e spec. There is no default (MMA-CODEX-011 011-12): ` +
        "a hardcoded default here previously pointed at the owner's real persistent local database. " +
        'Start a disposable stack (scripts/disposable_supabase.mjs start) and export ' +
        'MMA_E2E_FRONTEND_BASE / MMA_E2E_API_BASE / MMA_E2E_DB_CONTAINER explicitly before running this spec.',
    );
  }
  return value.trim();
}
