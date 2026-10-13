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
