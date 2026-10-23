# 11 — Test Evidence Summary

## UPDATE — 2026-10-23, HEAD `5b6bc43c` (current live counts, superseding everything below)

**Integration: 109/109 passing, 12 files** (up from 76/76 below). The 8 new files since this document was written: `assignmentRemovalConcurrency.test.ts` (2), `carePlanConcurrency.test.ts` (2), `lastSeatApprovalConcurrency.test.ts` (1), `communicationsOverviewUndercount.test.ts` (1), `credentialDocumentPurge.test.ts` (2), `messageAttachmentsAndFollowUpOwnership.test.ts` (7), `documentAccessAudit.test.ts` (5), `codex03AuthorizationGaps.test.ts` (4) — plus 13 new tests added to the pre-existing files for migrations 091-094 and 098.

**Unit: 382/382 passing, 31 files** (up from 377/377, 30 files) — new: `professionalApplicationServiceStorageCleanup.test.ts` (5 tests).

**Static checks**: `npm run typecheck` (now correctly covers BOTH `tsconfig.app.json` and `tsconfig.node.json` — see below, this was itself a discovered-and-fixed defect) is clean; so is lint and `npm run build`.

**The one gap this document explicitly named as not executed — "a full fresh-install replay of migrations 001→090 from an empty database" — is now done, extended through 104**: `supabase db diff --linked` (read-only) replayed all 104 migrations into a fresh shadow database with zero errors (2206+-line log).

**A major process defect in this document's own prior evidence was discovered and disclosed**: every `npx tsc --noEmit` check referenced throughout this entire Wave E package (including this document's own "clean" claim below) was **vacuous** — the root `tsconfig.json` has `"files": []` with project references, so a bare `tsc --noEmit` checks zero files and reports clean regardless of real errors. The actual app had **56 real TypeScript errors** (missing type definitions for 4 tables + ~19 RPCs from migrations 082-083/087-089), discovered only when the pre-existing-but-never-invoked `npm run typecheck` script was finally run. All 56 fixed; `npm run typecheck` (extended to also check `tsconfig.node.json`) is the correct check from this point forward, confirmed 0/0.

Everything below this notice is the ORIGINAL test evidence summary as written at the close of the FINAL ENGINEERING CLOSURE phase — preserved verbatim for its own historical accuracy at that commit, not representative of current state.

---

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
