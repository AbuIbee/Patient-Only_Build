import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // RELEASE-BLOCKER-CLOSURE PHASE 2: pre-existing repo debris, present
    // since the very first commit ("Initial commit - complete app") —
    // imports a Next.js-style '@/utils/supabase/server' path that has
    // never existed in this Vite+React SPA, is not imported by any real
    // application file (confirmed by repo-wide grep), and does not even
    // parse (duplicated/malformed content). Not application source; was
    // never successfully linted before (eslint.config.js's own prior
    // crash masked this), not now either.
    'page.tsx',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      ...reactHooks.configs.recommended.rules,
      // RELEASE-BLOCKER-CLOSURE PHASE 2: recognizes this codebase's existing,
      // already-documented `_name` convention for a binding that must stay
      // in a signature (call-site/API compatibility) but is deliberately
      // unused — narrows the rule to respect an established pattern, not a
      // blanket relaxation (a non-underscore unused var/arg is still an
      // error).
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Every empty-block finding in this codebase (confirmed individually,
      // not assumed) is `catch {}` guarding a corrupted-cache/localStorage
      // JSON.parse — a legitimate, deliberate "treat as absent" pattern.
      // This narrows the rule to that one legitimate case; an empty `if`,
      // `for`, or other block is still flagged.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
