# MASTER CORRECTIVE — Independent Codex Reproduction Handoff

## Starting point for re-audit

- Branch: `remediation/mymemoria-functional-001`. Confirm `git log --oneline -15` to find this round's commit(s); every fix is in migrations `076`, `077`, `078` plus the frontend files listed in each commit.
- The local Postgres container has **no persistent volume** in this environment — if it has been restarted since this session, it will be empty. Re-seed before re-auditing; do not assume any fixture from this or any prior round still exists. `codex_round7_independent_audit/seed_fixture.py`'s identity/table shape remains a valid reference for constructing a fresh fixture.
- The local Supabase CLI is blocked by Device Guard in this environment; apply migrations via `docker exec -i supabase_db_repo psql -U postgres -d postgres < supabase/migrations/0NN_*.sql` in order, or via your own environment's working CLI if Device Guard does not apply there.

## How to re-run this round's own regression proof

```
npm run test:integration   # 13 tests, requires the local stack up — see tests/integration/round7MasterCorrectiveSecurity.test.ts
npx playwright test tests/e2e_mastercorrective_func02_mood_pagination.spec.ts tests/e2e_mastercorrective_h06_h14.spec.ts --project=chromium
```
Both require a running Vite dev server with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pointed at the local stack (see `39_MASTERCORRECTIVE_TEST_REPORT.md`'s environment disclosure — this was NOT the case by default at the start of this session).

## Items to specifically re-verify independently (not merely re-trust this report)

1. **SEC-01's race, in the opposite ordering.** This round's test drives the accept-holds-lock-first ordering (matching `concurrency_test.py` exactly). The reverse ordering (revoke acquires the lock first, accept blocks behind it) was reasoned about but not separately driven with a timed two-session test this round — confirm `respond_to_therapist_invite()` correctly raises "already been responded to" when it unblocks after a revoke has committed.
2. **SEC-03's trigger, for `communication_needs_source`.** The regression test exercises `code_status`/`code_status_source` directly; `communication_needs_source`'s identical trigger branch was not separately driven by a dedicated test this round (only read via code review of the trigger function). Recommend a direct test: PATCH `communication_needs_source='professional_observation'` as an ordinary caregiver and confirm rejection.
3. **The original `executed_results.jsonl` entries whose generating scripts were not found on disk** (`DEFECT-DIRECT-PROFESSIONAL-patient_diagnoses/allergies/vitals`, `DEFECT-ORDINARY-CAREGIVER-SUPERSEDES-CAREPLAN`, `DEFECT-TASK-AUDIT-IDENTITY-FORGERY`, `DEFECT-CAREGIVER-BILLING-READ`). This round reconstructed and independently reproduced each from the fixture identities and evidence-field shapes documented in that JSONL, then confirmed the reproduced defect and its fix live. If the original scripts exist in an environment this session did not have access to, re-run them directly against the fixed code and confirm they now match this round's regression test's assertions, rather than taking the reconstruction's word for it.
4. **O10's harness stop.** `browser_results.json`'s `UI-HARNESS-STOP` entry shows Codex's own script timed out waiting for a transient toast and never reached its own O10 re-login assertion. This round's finding register treats this as test-timing flakiness, not a reproduced defect, based on a *different, already-passing* dedicated O10 test from a prior round. Recommend Codex re-run their own `browser_audit.mjs` O10 section (or an equivalent) to independently confirm or refute this judgment — it was not re-litigated with new evidence this round.
5. **Cross-browser.** All new Playwright specs this round ran on `chromium` only.
6. **Fresh-install migration chain.** Migrations `001`–`078` were applied cumulatively onto an already-migrated database this round, never from a `db reset`. If your environment's CLI is not Device-Guard-blocked, run `supabase db reset` (or equivalent) and confirm the full chain applies cleanly end to end — this was not independently confirmed this round.

## Explicitly NOT claimed

- **Not claimed:** "92/92 independently accepted." Per the directive, only Codex may grant independent technical acceptance; this round's own re-verification is "FUNCTIONALLY VERIFIED"/"SECURITY VERIFIED LOCALLY" at best, never "INDEPENDENTLY ACCEPTED."
- **Not claimed:** zero remaining defects anywhere in the system. This round's scope was the named SEC-01→06/FUNC-01→06/SPEC-01 register plus the two items (H14, X05) it directly implicated in the traceability matrix. A fresh, unscoped adversarial pass across the *entire* 92-item surface was not re-run from zero this round.
- **Not claimed:** W13 is complete, or safe to defer. It remains OPEN with an explicit, unaddressed owner decision (Deliverable F).

## Release posture

See `41_MASTERCORRECTIVE_CLOSURE_REPORT.md` for the final classification.
