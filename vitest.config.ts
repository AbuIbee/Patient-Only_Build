import path from 'path';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts deliberately — this remediation pass adds
// Vitest as a new devDependency for offline unit tests (tests/unit/**) and
// should not touch the app's own production build config.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // FUNCTIONAL-REPAIR-004 / REPAIR 3: `*.test-d.ts` files are type-level
    // regression checks (run via `npx vitest typecheck`, not the normal
    // `npm run test:unit` — the `include` above does not match this
    // pattern, so they are never executed as runtime tests). Vitest's own
    // typecheck.include otherwise defaults to being filtered by the plain
    // `include` above too, so it needs declaring explicitly here.
    typecheck: {
      include: ['tests/unit/**/*.test-d.ts'],
    },
    env: {
      // src/lib/supabase.ts calls createClient() at module load time, which
      // throws if these are empty — dummy values are fine since every test
      // mocks '@/lib/supabase' itself rather than hitting a real project.
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_SITE_URL: 'http://localhost:5173',
    },
  },
});
