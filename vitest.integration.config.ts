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
    // Multiple suites manage the SAME pg_cron job and database-level
    // archival test interval. Parallel files race (the independent
    // scheduler test removes the real five-minute test's job).
    // Run all disposable-stack integration files sequentially; never
    // weaken or shorten the actual wall-clock archival acceptance.
    fileParallelism: false,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
