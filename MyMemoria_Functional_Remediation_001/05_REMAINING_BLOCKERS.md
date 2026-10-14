# 05 — Remaining Blockers (MYMEMORIA-CLAUDE-CORRECTIVE-003)

## Architecture hold point requiring owner/architect decision (not guessed)
**C02-001: who is authorized to create the first administrator account, and how?** `admin_set_role()` is a safe, correct delegation mechanism (an existing admin promotes someone else) but cannot bootstrap itself — by definition, no admin exists to call it the first time. Options the owner could choose between (not pre-selected by this pass): a one-time manual `UPDATE profiles SET role='admin' WHERE id='<uuid>'` run directly against the database by whoever holds infrastructure access; a fixed allowlist of founder/owner email addresses checked at signup time (mirroring how `MASTER_EMAILS` is intentionally empty today per `CLAUDE.md`, but inverted — a non-empty, carefully-controlled admin-bootstrap list); or some other mechanism entirely. **This pass takes no position on which is correct** and has implemented nothing that depends on a particular answer.

## Genuinely unresolved, narrower product question
**C02-002: does the live `status` CHECK constraint on `subscriptions` allow `'trialing'`?** Affects exactly 2 of 7 admin account types (`temp_user`, `companion`). Resolvable by one read-only query (`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='subscriptions'::regclass AND contype='c'`) against the real project — not performed by this engagement (no live connection). See `02_BILLING_FORWARD_MIGRATION_PLAN.md`'s compatibility table for the full detail; this is the single remaining open item in the entire billing plan.

## Environment blockers (unchanged in kind since the first implementation pass)
- **No isolated Vercel+Supabase staging exists.** Every one of the 9 staging-only authorization tests in `011`+`013` (T1–T9, by shared numbering), every one of C02-001's 8 tests, and every RLS/cross-user/concurrency claim in this entire corrective pass is unexecuted for this reason.
- **No Android device or emulator exists.** The 9-step device acceptance plan in `03_REMINDER_SCHEDULER_CORRECTIONS.md` is entirely unexecuted — this includes the specific requirement to confirm the two previously-colliding UUIDs schedule, fire, and cancel independently as real notifications, not just as a unit-tested allocation-table invariant.
- **ESLint (C02-011) and absolute TypeScript validation (C02-010)** remain broken for pre-existing, unrelated reasons, explicitly out of this pass's 11 named items. Re-confirmed, not re-litigated, in `04_REGRESSION_TEST_EVIDENCE.md`.

## Coverage gaps within what WAS executed
- `PatientReminders.tsx`'s banner rendering (C02-006) and `PatientLayout.tsx`'s `visibilitychange` listener (C02-007) have no automated DOM/rendering test — verified by direct code reading only. Adding one would require a `jsdom` (or similar) test environment, a new devDependency not added in this pass to keep the dependency footprint minimal, consistent with every prior pass's own stated preference.
- `AddUserModal`'s overall provisioning flow (auth signup → profile → role → account type, four sequential steps with no true cross-system transaction) still has the same non-atomicity class of issue `patientService.createPatient()` was made resumable for in the very first implementation pass — this pass improved its error messaging (explicit "profile created but account type not set, retry by editing this user" wording) but did not make it fully resumable like `createPatient()`. Not one of the 11 named C02 items; flagged as adjacent, not fixed.
- `redeemPromoCode()`'s new atomic path has no live UI caller anywhere in this codebase (confirmed by a full-repository grep) — the fix hardens a currently-dormant feature, which is correct and complete per the correction order, but means there is no existing user-facing flow to manually smoke-test even once a connection is available, short of calling the RPC directly.

## What this pass does NOT claim
- No code or migration from this branch has been applied anywhere outside the isolated clone (`git log` shows no push; `origin/main` is unchanged at the original baseline SHA, re-verified at the start of this pass).
- 9 of 11 C02 items are IMPLEMENTED at the source/local-test level; **zero are runtime-VERIFIED.** This report does not claim otherwise for any of them.
- Current production remains NO-GO, exactly as every prior report in this engagement has concluded, for the identical underlying reason (no runtime evidence exists anywhere for anything in this branch).

## Single next owner action
Two items would together unblock the most remaining work: (1) decide the admin-bootstrap mechanism (C02-001's hold point — a short architecture decision, not an engineering task), and (2) run the one read-only `pg_get_constraintdef` query against the real `subscriptions` table to resolve the `'trialing'` status question. Neither requires standing up staging; both could be answered before that larger effort is organized.
