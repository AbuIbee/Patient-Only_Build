import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts deliberately: these tests hit the REAL
// local Supabase stack (Auth/PostgREST/Postgres via Docker on
// 127.0.0.1:55321) rather than mocking '@/lib/supabase', so they are not
// part of the offline `npm run test:unit` suite. Run with
// `npm run test:integration` only when the local stack from
// `docker compose` (or `npx supabase start`) is up.
export default defineConfig({
  test: {
    environment: 'node',
    // Archival suites share a database-level GUC and the same cron job.
    // Running their setup/teardown concurrently unschedules a live test.
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/integration.json' },
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
