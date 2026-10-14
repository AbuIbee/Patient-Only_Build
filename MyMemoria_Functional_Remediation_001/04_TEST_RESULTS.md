# 04 — Test Results (MYMEMORIA-CLAUDE-CORRECTIVE-001)

All commands run locally against the isolated clone only. No migration was executed, no device/emulator was used, no production/staging system was touched.

## Unit tests
```
npx vitest run
Test Files  5 passed (5)
     Tests  30 passed (30)
```
Breakdown: the 4 pre-existing test files (25 tests, unchanged — `identity.test.ts`, `publicPatientIntakeService.test.ts`, `patientService.createPatient.test.ts`, `reminderScheduler.test.ts`) plus the **new** `tests/unit/reminderScheduler.permission.test.ts` (5 tests): unsupported-platform short-circuit, denied-permission reporting with no schedule call, granted-permission scheduling with the correct notification count, cancel-before-schedule ordering (duplicate prevention), and no-op-but-still-"granted" when there are no active reminders.

**No existing test was modified, skipped, or had an assertion removed/weakened.** `git diff` on every pre-existing test file for this corrective pass returns empty — confirmed before writing this report.

## TypeScript (`npx tsc --noEmit -p tsconfig.app.json`)

| State | Error count |
|---|---|
| Original untouched repo baseline (pre-remediation) | 572 |
| HEAD `3a6ed1e8` (end of the original remediation pass, before this correction) | 570 |
| After this corrective pass's changes | **570** |

**Zero new TypeScript errors introduced by this corrective pass.** A full diff between the pre-correction (570-error) and post-correction (570-error) output was performed: every line differs *only* in line/column number (shifted by the handful of lines this pass added near the top of `PatientLayout.tsx`), with byte-identical error messages on both sides. No new error category, and no error disappeared or appeared. This reuses the same before/after methodology the original remediation pass and the independent verification pass both used, applied fresh to this correction's own diff.

## Production build (`npx vite build`)
```
✓ 3201 modules transformed.
✓ built in 6.29s
```
Zero errors. One pre-existing, unrelated advisory (a >500kB JS chunk) — unchanged from every prior build run in this engagement, not something this pass introduced or could reasonably address without an unrelated code-splitting refactor (explicitly out of scope).

## ESLint (`npx eslint .`)
Still crashes identically: `TypeError: Cannot read properties of undefined (reading 'recommended')` at `eslint.config.js:15`, caused by `eslint-plugin-react-hooks@5.2.0` not exporting `configs.flat.recommended`. **Confirmed pre-existing, not introduced by this corrective pass** — this package's `package-lock.json` entry is unchanged by anything in this session (no `npm install` of any kind was run during this corrective pass; dependencies were already present from the prior session). This is the same baseline-failure classification the original remediation pass and the independent verification pass both already established; repeated here only to confirm it still holds and was not somehow worsened.

## Separation of baseline vs. introduced failures — summary
| Check | Baseline status | Status after this correction | Introduced by this pass? |
|---|---|---|---|
| `tsc --noEmit` | 572 errors (untouched repo) / 570 (pre-correction HEAD) | 570 errors | **No** — identical message set, only line numbers shifted |
| `vite build` | Passes | Passes | No change |
| `eslint` | Crashes (pre-existing plugin/config mismatch) | Crashes (same error) | **No** — confirmed pre-existing |
| `vitest` | 25/25 passing (pre-correction HEAD) | 30/30 passing | **No regressions** — 5 new tests added, 0 existing tests touched |

## What was NOT run, and why
- **The new migration (`011`) was not executed** against any database, per the correction order's explicit instruction and the engagement's standing no-migration-execution rule.
- **No device/emulator test was run** for the F16 correction — see the device acceptance plan in `03_ANDROID_NOTIFICATION_INTEGRATION.md` for what remains to be executed once one is available.
- **No staging authorization test (T1–T8 in `02_SUBSCRIPTION_POLICY_REMEDIATION.md`) was run** — no isolated staging environment exists, unchanged from every prior report in this engagement.
