# 01 — C02 Implementation Matrix (MYMEMORIA-CLAUDE-CORRECTIVE-003)

Branch `remediation/mymemoria-functional-001`. Starting HEAD `47ed2bf06a82e90936d804a47fff5021ea6cda4e` (confirmed exact match, clean worktree except the already-documented `dist/`/`node_modules` residue, before any edit). 5 new commits added on top; all 11 prior commits preserved exactly, nothing amended, no new branch, no push/merge/execution.

**Status legend:** IMPLEMENTED / PARTIAL / BLOCKED / UNCHANGED (source-change status) — reported separately from **Runtime verification**, which is BLOCKED for everything in this pass (no isolated staging, no device/emulator — unchanged since every prior report in this engagement).

---

## C02-001 — P0 — Mutable profile role undermines admin billing authority
**Status: IMPLEMENTED, with one explicit architecture hold point.**
**Files/functions:** `supabase/migrations/012_profiles_revoke_client_role_authority.sql` (new); `src/services/patientService.ts` (`createPatient`); `src/pages/admin/AdminPatients.tsx` (signup handler); `src/pages/admin/AdminLayout.tsx` (`AddUserModal.handleSubmit`, `saveUser`); `src/pages/common/PricingPage.tsx` (`createAccount`).

**Prior failure:** live `profiles_update` policy (`id=auth.uid() OR is_admin_check()`) plus a whole-table authenticated UPDATE grant let any user set their own `role` to `'admin'` directly — independently re-confirmed in this codebase: `AdminLayout.tsx`'s `saveUser()` did a plain `.update({ role: e.role, ... }).eq('id', u.id)`, which under that policy is simultaneously the legitimate "admin edits another user" feature and, called against one's own id, the exact self-escalation path.

**Selected correction (prescribed, not chosen among alternatives):** server-controlled role authority, not a frontend guard. Column-level `REVOKE`/`GRANT` removes `role` from what `authenticated` may write via INSERT or UPDATE at all (independent of RLS, which only ever constrains rows). The `handle_new_user()` signup trigger (SECURITY DEFINER, bypasses column grants) is redefined to cap incoming metadata role to `patient`/`caregiver` only — closing a second escalation path (anonymous `auth.signUp({options:{data:{role:'admin'}}})`) this corrective pass found during implementation, not named in the original request. `admin_set_role()` is the only path to change another account's role, gated on the caller already holding `role IN ('admin','superadmin')` — mirroring `admin_set_subscription()`'s existing pattern.

**Architecture hold point (not resolved, as instructed):** `admin_set_role()` cannot explain how the *first* admin is created — it requires an existing admin to call it. No approved source of that initial trust exists in any evidence available to this engagement. **Submitted question for owner/architect decision:** who/what is authorized to create the first administrator account, and through what mechanism (direct DB access by the project owner, a one-time bootstrap script, a fixed allowlist of founder emails checked at signup, something else)? Until answered, promoting the first admin requires out-of-band direct database access, outside the application entirely — by design, not an oversight.

**Regression evidence:** 8 staging-only authorization tests described in the migration file itself (T1–T8); none executed (no isolated staging). Static: `tsc`/`vite build` both pass against the new call sites (see `04_REGRESSION_TEST_EVIDENCE.md`).
**Runtime verification: BLOCKED.**

---

## C02-002 — P1 — Admin RPC schema incompatibility and non-atomic creation
**Status: IMPLEMENTED.**
**Files/functions:** `supabase/migrations/013_subscriptions_atomic_lifecycle.sql` (new); `src/pages/admin/AdminLayout.tsx` (`saveAccountType`).

**Prior failure:** `010`'s `CREATE TABLE IF NOT EXISTS` used `user_id UUID PRIMARY KEY` — wrong shape against the real live table (PK is `id`; `user_id` is a separate NOT-NULL, unique column per `MyMemoria_Production_Audit` evidence) and omitted `current_period_start/end`, `stripe_customer_id`, `canceled_at`, `promo_code`. `011`'s `admin_set_subscription()` used a SELECT-then-INSERT/UPDATE specifically because this engagement had no confirmation of a `UNIQUE(user_id)` constraint at the time — a real race window under concurrent first-time creation.

**Selected correction:** `013` restates the table shape to match the real one (idempotent either way — a no-op against the already-correct live table, a correct fresh-install shape otherwise), and `admin_set_subscription()` is redefined as a true atomic `INSERT ... ON CONFLICT (user_id) DO UPDATE`, now that uniqueness is confirmed. `trial_ends_at` is never written as NULL — see the compatibility table in `02_BILLING_FORWARD_MIGRATION_PLAN.md` for exactly which of the seven account types this affects and how it's resolved without inventing new business semantics. `saveAccountType()` now verifies the RPC's **returned row** (`RETURNS subscriptions`) matches the requested tier/status, not just the absence of a thrown error.

**Not stopped, per the instruction's own conditional wording** ("if the existing seven account-type mappings cannot be represented... without changing business semantics, stop that dependent change") — the `trial_ends_at` incompatibility affecting 4 of 7 types (`daily_care`, `full_support`, `master`, `canceled` all previously sent `null`) is resolved using an **already-existing, already-approved precedent** (`SubscriptionContext.tsx`'s own free-tier provisioning already sets `trial_started_at = trial_ends_at = now()` for "no active trial" — not a new invention). One narrower, genuinely unresolved question remains for `temp_user`/`companion` (both use `status: 'trialing'`) — see `02_BILLING_FORWARD_MIGRATION_PLAN.md`'s compatibility table; this is flagged, not blocked, since the RPC's existing validation already fails safely and visibly if the live `status` CHECK constraint turns out to exclude it.

**Regression evidence:** 9 staging-only tests described in `013` (T1–T9); none executed.
**Runtime verification: BLOCKED.**

---

## C02-003 — P1 — Revoked billing writes break free/promo and can falsely report success
**Status: IMPLEMENTED.**
**Files/functions:** `supabase/migrations/013_subscriptions_atomic_lifecycle.sql` (`provision_free_subscription`, `redeem_promo_code`, new `promo_codes` table); `src/store/SubscriptionContext.tsx` (`loadSubscription`, `redeemPromoCode`); `src/pages/common/PricingPage.tsx` (`handleSelectTier`'s free-tier branch).

**Prior failure:** `SubscriptionContext.loadSubscription()` and `PricingPage.handleSelectTier()` both wrote directly to `subscriptions` for free-tier provisioning — unreachable once `011`/`013` remove client INSERT/UPDATE, and previously able to claim an arbitrary tier anyway. `redeemPromoCode()` inserted a `promo_redemptions` row, then updated `subscriptions` as a **separate**, **unchecked-for-affected-rows** call — a denied/zero-row UPDATE (exactly what `011` now causes) would report success (`Code applied!`) with the code consumed and no entitlement granted. The rollback `.delete()` on that path also had no permission to succeed against the live `promo_redemptions` policies (no client DELETE policy exists).

**Selected correction:** `provision_free_subscription()` is the only path for a signed-in user to provision their own row — idempotent (returns the existing row unchanged if one exists, for ANY tier/status, never downgrading a paid subscription) and never accepts a client-supplied tier. `redeem_promo_code()` moves validation, redemption-reservation, and the subscription transition into one atomic server function — a thrown exception rolls back the entire transaction (no orphaned redemption, no false success). The promo code's own terms (tier/days/max-uses/expiry) are looked up from a new `promo_codes` table rather than trusted from client parameters — this table mirrors the existing (empty) `PROMO_CODES` TS array's shape exactly and is seeded with zero rows, preserving today's "no codes active" reality rather than inventing any.

**Regression evidence:** `redeemPromoCode` is not currently called from any UI component in this codebase (confirmed by a full-codebase grep) — this fix hardens a currently-dormant path, not one with live traffic today. 9 staging-only tests described in `013` (T1–T9, shared with C02-002's numbering since both land in the same file).
**Runtime verification: BLOCKED.**

---

## C02-004 — P1 — Scheduling faults have no visible failure result
**Status: IMPLEMENTED.**
**Files/functions:** `src/lib/reminderScheduler.ts` (`syncReminderNotifications`, `cancelAllReminderNotifications`, new `SchedulingResult`/`SchedulingStatus` types).

**Prior failure:** independent verification's mocked probe (`scheduler_fault_probe.json`) demonstrated all three native call failures (`getPending`, `cancel`, `schedule`) returned the permission status `'granted'` with no visible failure state.

**Selected correction:** every call site checks and handles its own error independently, returning a typed `SchedulingResult` (`UNSUPPORTED | PERMISSION_DENIED | SCHEDULED | FAILED | RETRY_REQUIRED`) with an `operation` field naming which step failed. A post-schedule `getPending()` reconciliation confirms the assigned ids are actually present before reporting `SCHEDULED` — a `schedule()` call that resolves without throwing is no longer treated as proof of success on its own.

**Regression evidence:** 5 tests in `tests/unit/reminderScheduler.permission.test.ts` directly reproduce the three previously-silent failure modes plus the reconciliation-mismatch case, all now asserting a visible `FAILED`/`RETRY_REQUIRED` result. All pass (`npx vitest run` — see `04_REGRESSION_TEST_EVIDENCE.md`).
**Runtime verification: BLOCKED** (no device).

---

## C02-005 — P1 — Older sync revives stale reminders after newer state
**Status: IMPLEMENTED.**
**Files/functions:** `src/lib/reminderScheduler.ts` (module-level generation counter + FIFO `enqueue()` coordinator, used by every exported scheduling function); `src/App.tsx` (sign-out handler).

**Prior failure:** independent verification's `scheduler_race_probe.json` demonstrated a delayed OLD sync resolving after a NEW one left both pending (`actual: ["NEW","OLD"]` vs `expected: ["NEW"]`) — no native-call serialization, and `PatientLayout.tsx`'s effect cleanup only suppressed a React state update, not the still-running native side effects.

**Selected correction:** every call (schedule, cancel, sign-out) is funneled through one module-level FIFO queue, so native calls for this module never overlap in execution — a slow operation's continuation physically cannot run concurrently with a newer one's. A monotonically increasing generation number is checked at every await boundary; a request that is superseded (a newer one was issued) before or during its own run reports `RETRY_REQUIRED` instead of completing as if it were still current. Sign-out (`cancelAllReminderNotifications`) bumps the generation *before* issuing its own cancellation, invalidating anything still queued, then confirms clearance via a post-cancel `getPending()` check — returning `FAILED` (not a silent assumption) if the account's notifications are still present afterward.

**Regression evidence:** 2 tests reproduce the exact scenarios: a genuinely delayed native call that resolves after a newer request has already been issued (mirroring the probe's exact "OLD resolves after NEW" shape), and a synchronous burst of three requests where the two earlier ones are superseded before their queued turn even starts and never touch the plugin at all. Both pass.
**Runtime verification: BLOCKED.**

---

## C02-006 — P2 — Denied/unsupported view still promises scheduled delivery
**Status: IMPLEMENTED.**
**Files/functions:** `src/pages/patient/PatientReminders.tsx` (new `REMINDER_STATUS_COPY` table, banner rendering, "How Reminders Work" card copy).

**Prior failure:** the denied-permission banner (added in the prior corrective pass) sat directly alongside an unconditional "You'll see notifications at the scheduled times" promise in the adjacent info card, and neither the unsupported-web nor failed/retry states had any message at all.

**Selected correction:** the exact six-state message contract from the correction order, implemented verbatim (`UNSUPPORTED`/`PERMISSION_DENIED`/`SCHEDULING`/`FAILED`/`RETRY_REQUIRED`/`SCHEDULED`). `SCHEDULED` renders no banner and no live-region announcement at all — success is never announced unless the scheduler itself already reconciled it (see C02-004). The "How Reminders Work" card's unconditional delivery-timing promise is removed; the approved `SCHEDULED`-state sentence ("Delivery timing may vary with device settings") only appears once that state is actually current. No `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` was added — evaluated and explicitly not pursued (see `03_REMINDER_SCHEDULER_CORRECTIONS.md`); whether exact timing is a real product requirement remains an owner decision, not something this pass decided.

**Regression evidence:** covered indirectly through the typed-result plumbing tests (C02-004/005); no dedicated rendering/snapshot test was added for the JSX banner itself (would require a DOM-rendering test harness — React Testing Library is not an installed dependency, and adding one was judged out of the minimal-necessary scope for this pass). Verified by direct code reading instead — see `03_REMINDER_SCHEDULER_CORRECTIONS.md`.
**Runtime verification: BLOCKED** (rendered-UI/accessibility-tree confirmation needs a browser or device).

---

## C02-007 — P2 — Device-settings permission changes not refreshed on resume
**Status: IMPLEMENTED.**
**Files/functions:** `src/lib/reminderScheduler.ts` (`addReminderResumeListener`); `src/pages/patient/PatientLayout.tsx` (wiring + cleanup).

**Prior failure:** the reminders-sync effect depended only on the reminder list itself — returning from device settings after enabling/revoking notification permission left the banner and the actual schedule state stale until something else (an edit) happened to re-trigger the effect.

**Selected correction:** a `visibilitychange` listener (the app's own existing lifecycle integration — a Capacitor app is fundamentally a WebView, and `document.visibilityState` already changes on background/foreground on both Android and iOS) re-checks permission whenever the app becomes visible again, and re-syncs only if the permission actually changed from what was last known — avoiding a redundant re-prompt or re-sync on every resume. `@capacitor/app` (which would provide a native `resume` event) is **not** an installed dependency and was deliberately not added, per the instruction to use the *existing* lifecycle integration rather than a new plugin.

**Regression evidence:** not unit-tested directly (the listener depends on `document.visibilityState`/`document.addEventListener`, which would need a DOM environment — this repo's vitest config is `environment: 'node'`, and adding `jsdom` was judged out of minimal-necessary scope, mirroring the C02-006 decision). Verified by direct code reading; the cleanup function is wired into `PatientLayout.tsx`'s effect return, confirmed removed on unmount/account change by inspection.
**Runtime verification: BLOCKED** (needs an actual app-resume event on a device).

---

## C02-008 — P2 — Valid reminder UUIDs collide in notification IDs
**Status: IMPLEMENTED.**
**Files/functions:** `src/lib/reminderScheduler.ts` (`allocateNotificationId`, persisted `localStorage`-backed id map, `pruneStaleEntries`).

**Prior failure:** independently reproduced and re-confirmed in this session by direct computation: `81135175-714b-4450-82ee-fb6fe896f202` and `d9bad919-f0dc-4fa4-8626-76b3d7294c76` both hash to notification id `1177044809` for day 1 under the superseded stateless `notificationId()` function.

**Selected correction:** notification ids are now allocated from a persisted, per-device map keyed by logical identity (`accountId::reminderId::dayOfWeek`), not a bare hash. A fresh allocation probes linearly past any id already assigned to ANY key in the map before accepting a candidate — so two keys can never be assigned the same id, by construction, not by chance. An unchanged occurrence always reuses its existing assigned id (stable across reloads/edits); a reminder no longer active has its entry pruned only for the current account, never touching another account's entries.

**Regression evidence:** the exact colliding UUID pair is now a permanent fixture in `tests/unit/reminderScheduler.test.ts`, asserting they receive different ids, that this holds across repeated allocation calls (simulating a reload), and that account-scoping keeps the same reminder id from colliding across two different accounts on the same device. All pass.
**Runtime verification: BLOCKED** (device-level confirmation that two independently-scheduled, non-colliding native notifications actually both fire needs a device).

---

## C02-009 — P2 — Rollback instruction wrongly promises previous function restoration
**Status: IMPLEMENTED.**
**Files/functions:** `supabase/migrations/011_subscriptions_revoke_client_billing_authority.sql` (rollback comment section only).

**Prior failure:** the rollback comment claimed `DROP FUNCTION admin_set_subscription(...)` would "revert to whatever 010 left in place" — false; Postgres keeps no history of prior `CREATE OR REPLACE FUNCTION` bodies, so this would leave the function entirely undefined.

**Selected correction:** replaced with the correct procedure — capture the exact function definition, owner, and ACLs *before* applying any change to a real environment (`pg_get_functiondef`, `\df+`), and restore via a fresh `CREATE OR REPLACE FUNCTION` using that captured definition if rollback is ever genuinely needed; never a bare `DROP` with no replacement. If no prior definition was captured, the only safe path is forward (a new migration), not an attempted "restore."

**Regression evidence:** documentation-only change; no test applicable. Verified by direct re-reading of the corrected text.
**Runtime verification: N/A** (not an executable code change).

---

## C02-010 — P2 — Absolute TypeScript validation still fails
**Status: UNCHANGED (explicitly out of this pass's scope).**
**Files/functions:** `tsconfig.app.json`; `src/types/supabase.ts` (`Database`); every call site this and prior passes added.

Root cause (generated `Database` type stale against actual usage — unrelated to and pre-dating this entire remediation effort) was re-confirmed, not fixed: a rigorous before/after `tsc --noEmit` comparison for this pass specifically shows **573 errors post-pass vs. 570 pre-pass**, with **zero new TypeScript error codes** introduced — every additional line is the identical pre-existing `never`/`undefined`-type pattern applied to the new RPCs and payload shapes this pass added (see `04_REGRESSION_TEST_EVIDENCE.md` for the full methodology and diff). Fixing the root cause requires regenerating `src/types/supabase.ts` against live schema access this engagement does not have, and was already identified by the prior verification report as "separately authorized incremental engineering" — correctly out of scope for a corrective pass targeting 11 named defects.
**Runtime verification: N/A.**

---

## C02-011 — P2 — ESLint crashes before rule assessment
**Status: UNCHANGED (explicitly out of this pass's scope).**
**Files/functions:** `eslint.config.js`; `eslint-plugin-react-hooks` (installed version 5.2.0).

Re-confirmed via a fresh `npx eslint .` run against this pass's final state: identical crash (`TypeError: Cannot read properties of undefined (reading 'recommended')`), confirmed pre-existing by `git diff` showing zero change to this package's `package-lock.json` entry across every commit in this entire engagement. Fixing it (pinning a compatible plugin version or switching the config's preset) is a deliberate, separate dependency/config change the correction order's own stop conditions reserve for explicit approval, not a defect this pass's 11 named items ask to fix.
**Runtime verification: N/A.**

---

## Summary

| Item | Status | Runtime |
|---|---|---|
| C02-001 | IMPLEMENTED (1 hold point) | BLOCKED |
| C02-002 | IMPLEMENTED | BLOCKED |
| C02-003 | IMPLEMENTED | BLOCKED |
| C02-004 | IMPLEMENTED | BLOCKED |
| C02-005 | IMPLEMENTED | BLOCKED |
| C02-006 | IMPLEMENTED | BLOCKED |
| C02-007 | IMPLEMENTED | BLOCKED |
| C02-008 | IMPLEMENTED | BLOCKED |
| C02-009 | IMPLEMENTED | N/A |
| C02-010 | UNCHANGED (out of scope) | N/A |
| C02-011 | UNCHANGED (out of scope) | N/A |

9 of 11 implemented at the source/local-test level; 2 correctly left unchanged as explicitly out of this pass's named scope. Zero items were marked IMPLEMENTED based on runtime proof — none exists. One architecture hold point (C02-001's admin-bootstrap question) is submitted for owner decision, not guessed.
