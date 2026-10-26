// MMA-SUPABASE-RECONCILIATION-AND-EXECUTION-012 Section 7 — permanent
// negative test proving unsafe target selection fails closed. Imports
// ./_targetValidation directly (NOT ./_runtime, which would trigger its
// own module-level requireEnv() the instant it's imported, using
// whatever env vars happen to be set for THIS run — making the
// negative cases below impossible to construct reliably).
//
// This file deliberately does NOT need MMA_TEST_API_BASE/
// MMA_TEST_DB_CONTAINER to be set for its own negative cases (they
// construct their own inputs), but DOES reuse whatever the test runner
// was actually invoked with for the one positive case, so it proves the
// exact configuration the rest of the suite is using is itself accepted
// — not a separately hardcoded "known good" value that could drift from
// reality.
import { describe, expect, it } from 'vitest';
import { assertDisposableTarget, requireEnv } from './_targetValidation';

describe('MMA-SUPABASE-RECONCILIATION-AND-EXECUTION-012 Section 7 — fail-closed test target validation', () => {
  it('requireEnv throws when the variable is unset', () => {
    expect(() => requireEnv('MMA_TEST_DOES_NOT_EXIST_VAR', {})).toThrow(/must be explicitly set/);
  });

  it('requireEnv throws when the variable is set but blank', () => {
    expect(() => requireEnv('X', { X: '   ' })).toThrow(/must be explicitly set/);
  });

  it('requireEnv returns a trimmed value when genuinely set', () => {
    expect(requireEnv('X', { X: '  http://127.0.0.1:12345  ' })).toBe('http://127.0.0.1:12345');
  });

  it("assertDisposableTarget REJECTS the owner's real persistent database by container name", () => {
    expect(() => assertDisposableTarget('http://127.0.0.1:55321', 'supabase_db_repo')).toThrow(
      /real persistent database/,
    );
  });

  it('assertDisposableTarget REJECTS a non-local API base (defense in depth against a hosted/remote URL)', () => {
    expect(() => assertDisposableTarget('https://axurszlibxwwptkczztt.supabase.co', 'supabase_db_some_disposable_name'))
      .toThrow(/must point at a local stack/);
  });

  it('assertDisposableTarget REJECTS an invalid API base URL outright', () => {
    expect(() => assertDisposableTarget('not-a-url', 'supabase_db_some_disposable_name')).toThrow(/not a valid URL/);
  });

  it('assertDisposableTarget fails closed (does not silently pass) when the named container cannot be inspected at all', () => {
    expect(() =>
      assertDisposableTarget('http://127.0.0.1:55321', 'supabase_db_definitely_does_not_exist_anywhere_12345'),
    ).toThrow(/Could not verify.*disposable stack/);
  });

  it('assertDisposableTarget ACCEPTS the actual disposable target this test run was configured with', () => {
    // Reuses the real env vars this invocation of the suite was given
    // (see the file header) rather than a hardcoded container name, so
    // this positive case can never silently drift out of sync with
    // what the rest of the suite is actually targeting. Skips cleanly
    // (does not fail the suite) if this file happens to be run in
    // isolation without those vars set -- its negative cases above are
    // the actual permanent safety proof and need no live environment.
    const base = process.env.MMA_TEST_API_BASE;
    const container = process.env.MMA_TEST_DB_CONTAINER;
    if (!base || !container) {
      console.warn('Skipping the positive accept-case: MMA_TEST_API_BASE/MMA_TEST_DB_CONTAINER not set for this run.');
      return;
    }
    expect(() => assertDisposableTarget(base, container)).not.toThrow();
  });
});
