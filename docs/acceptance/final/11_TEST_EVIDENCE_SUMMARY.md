# 11 — Test Evidence Summary

All counts below are from a live run at the close of this phase, not carried forward from an earlier checkpoint.

## Integration tests (`npm run test:integration`, against the local Docker Supabase stack)

**76/76 passing**, 4 files:

| File | Tests | Covers |
|---|---|---|
| `round7MasterCorrectiveSecurity.test.ts` | ~51 | SEC-01–06, FUNC-01–05 (historical, rerun not merely cited), governance lifecycle cases 1-12, migration-084 audit fix, anon-execute exhaustive guard, therapist-visibility fix |
| `crossOfficeCommunicationMatrix.test.ts` | 29 | True 5x5 communication matrix, Director narrowness negative tests |
| `accountDeletionLifecycle.test.ts` | 9 | Request/review/safe-deactivation lifecycle, all required negative tests |
| `credentialVerificationGate.test.ts` | 7 | Credential verification gate, Director exemption |

Every test file is self-contained: it seeds its own disposable fixture in `beforeAll` and tears it down in `afterAll`. None reads or writes any pre-existing data. No real user account was ever deleted by any test.

## Unit tests (`npm run test:unit`, offline, mocked)

**377/377 passing**, 30 files. Unaffected by this phase's work (no mocked module this phase's changes touch was modified).

## Static checks

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (one pre-existing, unrelated warning in `codex_round7_independent_audit/browser_audit.mjs`, not touched this phase).
- `npm run build`: clean (pre-existing chunk-size warnings only, unrelated to this phase).

## Browser E2E tests

- `tests/e2e_enterprise_ui_navigation_acceptance.spec.ts` (pre-existing, Caregiver office, 14 destinations) — not rerun this phase; cited as historical evidence.
- `tests/e2e_five_office_navigation_acceptance.spec.ts` (new this phase, Admin/Medical/Therapy/Patient offices, 46 destinations) — 4/4 passing, self-contained fixture, must run with `--workers=1` (documented in the file; a parallel-worker fixture race was found and fixed before committing).

## What was NOT executed this phase

- A full fresh-install replay of migrations 001→090 from an empty database.
- A fresh browser click-through of the W09 "Message supervisor" button specifically (the underlying RPC call is confirmed passing via integration test; the UI button itself was not re-screenshotted).
- Individual UI-action-level testing for the 46 non-Caregiver navigation destinations beyond "renders without a runtime error."
- A full live MFA enrollment round trip against the local stack (blocked by a local GoTrue config flag, now fixed in the repo but not yet reloaded into the running container — see `09_WAVE_C_JOURNEYS_AND_O10_MFA.md`).
- Any hosted/Vercel Preview test of any kind (see `13_WAVE_D_HOSTED_VERIFICATION_STATUS.md`).

None of the above is represented as done anywhere else in this package.
