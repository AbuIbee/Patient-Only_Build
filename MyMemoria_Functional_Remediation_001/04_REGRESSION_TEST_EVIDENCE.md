# 04 — Regression Test Evidence (MYMEMORIA-CLAUDE-CORRECTIVE-003)

All commands run locally, inside the isolated clone, against the final state of this corrective pass. No migration executed, no device/emulator used, no production/staging system touched.

## Exact commands and results

```
$ npx vitest run
 Test Files  5 passed (5)
      Tests  43 passed (43)
```

```
$ npx tsc --noEmit -p tsconfig.app.json
(573 diagnostics; exit code 2)
```

```
$ npx vite build
✓ 3201 modules transformed.
✓ built in 6.10s
(one pre-existing, unrelated chunk-size advisory; zero errors)
```

```
$ npx eslint .
Oops! Something went wrong! :(
ESLint: 9.39.4
TypeError: Cannot read properties of undefined (reading 'recommended')
(exit code 2 — crashes before evaluating any file)
```

## Baseline vs. introduced — methodology and result

A rigorous before/after comparison was performed for `tsc`, not just a single number:
1. `git stash push -u` on exactly the 14 files this pass touched (12 tracked, 2 new migrations), leaving the branch at its pre-pass state (commit `47ed2bf0`).
2. `npx tsc --noEmit -p tsconfig.app.json` against that pre-pass state: **570 diagnostics** — matching the independent verification report's own figure exactly.
3. `git stash pop` to restore this pass's changes.
4. `npx tsc --noEmit -p tsconfig.app.json` against the final state: **573 diagnostics**.
5. Both outputs normalized (line/column numbers stripped, grouped by file + message, sorted) and diffed.
6. The **set of distinct TypeScript error codes** (`TS2339`, `TS2345`, etc.) was also compared directly between the two runs: `comm -13`/`comm -23` on the sorted unique code lists — **zero codes appear in one run and not the other.**

**Conclusion: the 3 additional diagnostics are not a new defect category.** Every line in the normalized diff is one of:
- A column-shape change in an existing error (e.g. `role` removed from a `profiles` upsert payload, since C02-001 revokes that column's write privilege) — same `never`-typed-row root cause, reduced verbosity in some cases.
- A new RPC call (`admin_set_role`, `redeem_promo_code`) hitting the identical pre-existing "generated `Database` type doesn't recognize this RPC" pattern that already affected `admin_set_subscription`/`undo_medication_dose` from prior passes.

This is the same methodology and the same root cause this entire engagement has documented since the very first implementation pass (`00_BASELINE_AND_SCOPE.md`) — unresolved by design, since fixing it requires live-schema access to regenerate `src/types/supabase.ts`, which this engagement does not have, and which C02-010 (correctly) classifies as separately-authorized work, not part of these 11 named corrections.

## ESLint: confirmed pre-existing, unrelated to this pass
Identical crash reproduced before and after this pass's changes. `git diff` on `package-lock.json` across every commit in this corrective pass shows zero change to `eslint-plugin-react-hooks`'s pinned version (`5.2.0`) — this package was never touched, installed, or upgraded by any part of this engagement.

## Collision fixture — independently recomputed in this session
```
$ node -e "
function notificationId(reminderId, dayOfWeek) {
  let hash = 0;
  for (let i = 0; i < reminderId.length; i++) {
    hash = (hash * 31 + reminderId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 0x0fffffff) * 8 + dayOfWeek;
}
console.log(notificationId('81135175-714b-4450-82ee-fb6fe896f202', 1));
console.log(notificationId('d9bad919-f0dc-4fa4-8626-76b3d7294c76', 1));
"
1177044809
1177044809
```
Both inputs produce the identical id under the superseded function — confirming independent verification's finding by direct recomputation, not by trusting the report alone. See `06_CODEX_FAILURE_REPRODUCTION.md` for the full before/after reproduction of all three originally-reported scheduler defects.

## Unit test breakdown (43 total)
| File | Tests | Covers |
|---|---|---|
| `tests/unit/identity.test.ts` | 12 | unchanged from prior passes |
| `tests/unit/publicPatientIntakeService.test.ts` | 5 | unchanged |
| `tests/unit/patientService.createPatient.test.ts` | 3 | unchanged |
| `tests/unit/reminderScheduler.test.ts` | 9 | **rewritten this pass** — `toCapacitorWeekday` (1, unchanged) + `allocateNotificationId` (8, new: determinism, per-day uniqueness, 32-bit bounds, 50-sample no-collision, the exact previously-colliding pair, reload stability, account-scoping, a 200-item forced-batch uniqueness check) |
| `tests/unit/reminderScheduler.permission.test.ts` | 14 | **rewritten this pass** — typed result contract (9: UNSUPPORTED/PERMISSION_DENIED/SCHEDULED/duplicate-prevention-including-stale-occurrences/no-active-reminders/3 fault scenarios/reconciliation-mismatch) + generation coordinator (2: delayed-OLD race, synchronous-burst supersession) + `cancelAllReminderNotifications` clearance confirmation (3) |

**No existing test assertion was weakened, removed, or had its expected value changed to make it pass.** The two `reminderScheduler*.test.ts` files were rewritten because the function they tested (`notificationId`) no longer exists — replaced by `allocateNotificationId`, which the rewritten tests cover with equal-or-greater rigor, including the mandatory regression fixture. `git diff` confirms zero changes to `identity.test.ts`, `publicPatientIntakeService.test.ts`, or `patientService.createPatient.test.ts` in this pass.

## What was NOT run, and why
- **No migration (`011`, `012`, `013`) was executed** against any database — no isolated staging exists, and execution requires separate owner authorization regardless.
- **No device/emulator test was run** — see the 9-step plan in `03_REMINDER_SCHEDULER_CORRECTIONS.md`, entirely unexecuted.
- **No browser/E2E/rendered-DOM test was added** for `PatientReminders.tsx`'s banner rendering or `PatientLayout.tsx`'s `visibilitychange` listener — both verified by direct code reading only, since adding a DOM test environment (`jsdom`) was judged outside minimal-necessary scope for this pass (consistent with "no unrelated refactor").
- **Database/native integration tests remain staged and BLOCKED, not faked with mocks** — every mocked test in this pass explicitly tests the JS-layer logic (scheduling math, result-contract plumbing, Postgres-free SQL review) and is labeled as such; none claims to be evidence of RLS enforcement, actual notification delivery, or any other runtime-only property.
