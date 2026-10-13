# 05 — Release Review

## Acceptance rule applied
Per the work order: a feature is **IMPLEMENTED + VERIFIED** only if the source contract is reconciled AND the relevant isolated runtime tests (save, reload, logout/login, failure, cross-user denial as applicable) pass. No isolated staging existed in this pass, so **no feature in this pass qualifies for IMPLEMENTED + VERIFIED.** Every outcome below is IMPLEMENTED + UNVERIFIED, BLOCKED, or (for the one scope gap found) NOT AUDITED/NOT IMPLEMENTED for a sub-path. This reflects the owner's own approved scope, not a shortfall against it.

## F01–F16 outcome table

| # | Feature | Outcome | Why |
|---|---|---|---|
| F01 | Login, profile hydration, session restore | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | Code fixed (metadata-role escalation path removed; forced-change gate closed in both `App.tsx`'s race and — a finding beyond the original audit — `LoginPage.tsx`'s complete bypass). `tsc`/`vite build` pass. No isolated staging to prove the gate holds against a real failed backend write. |
| F02 | Registration and onboarding | **IMPLEMENTED / UNVERIFIED IN RUNTIME** (admin-provisioning path only) | `createPatient()` made resumable; mocked-logic unit tests pass (3/3). Self-serve signup path NOT AUDITED, NOT IMPLEMENTED — out of this pass's confirmed scope. |
| F03 | Medication list and CRUD | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | No application code defect found; migration proposal adds the `schedule` column the code already expects. Not executed against any DB. |
| F04 | Mark dose taken/skipped | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | `logDose` no longer shows false success on failure; migration proposes the matching unique constraint. Not executed; not unit-testable as written (embedded closure). |
| F05 | Undo medication dose | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | Blanket delete replaced with an ownership-checked, audited RPC. RPC SQL not executed; not unit-tested (same closure limitation as F04). |
| F06 | Memories | **BLOCKED** (explicit, SEC-003) | Code already correct; RLS proposal written but deliberately withheld pending independent SEC-003 approval, per the work order's own gating. |
| F07 | Mood and personal tasks | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | No application code defect found; patient-self RLS proposed, not executed. |
| F08 | Documents and bills | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | Orphan-cleanup and copy-mismatch fixed in code; bucket+table migration proposed (neither currently tracked anywhere), not executed. |
| F09 | Public patient intake | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | Insert-without-SELECT + idempotency implemented and unit-tested (5/5 passing against a mocked client). Real anon-RLS behavior not confirmed against a live table. |
| F10 | Admin account types | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | Client-trusted upsert replaced with a server-validated RPC call; `trial_ends_at` NOT NULL workaround removed. RPC/table not executed against any DB. |
| F11 | Routine checklist | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | `handleAppTaskComplete` now persists (previously zero I/O — confirmed root cause). Depends on the same patient-self `tasks` RLS as F07, not executed. |
| F12 | Care partner personal notes | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | Self-impersonation (`caregiver_id: patientId`) replaced with a dedicated `author_id`; schema proposal adds the column and the previously-missing `note_type` value. Not executed. |
| F13 | Tell Me a Story playback | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | No application code change needed (already correct). Storage policy proposed with an explicit caveat that its "licensed/public content only" assumption must be confirmed against real bucket contents before applying. |
| F14 | Calm Me video upload | **BLOCKED** (explicit, SEC-006) | UI size-limit correctness fixed; insecure upload path **actively disabled in code** (not just proposed) pending SEC-006, per the work order's explicit instruction. Dedicated-bucket migration left as a non-executable, commented proposal. |
| F15 | Password recovery entry point | **IMPLEMENTED / UNVERIFIED IN RUNTIME** | "Forgot password?" entry point added, non-enumerable response implemented. Real email send/redirect/token-expiry behavior needs a live Supabase Auth project. |
| F16 | Background reminders | **IMPLEMENTED / UNVERIFIED IN RUNTIME** (explicitly, per the work order's own P2/UNVERIFIED pre-classification) | Real `@capacitor/local-notifications` scheduling implemented (previously zero implementation existed behind the advertised copy) as a native-only, honest no-op elsewhere. Pure logic unit-tested (5/5 passing). No device/emulator to confirm actual OS-level delivery. |

**Tally:** 0 VERIFIED · 14 IMPLEMENTED/UNVERIFIED · 2 BLOCKED (F06, F14) · 0 fully NOT IMPLEMENTED (F02's self-serve sub-path is the one partial exception, noted above and in `04_OUTSTANDING_BLOCKERS.md`).

## Explicit non-certification
**Current production (`memoriahelps/patientonly`, project `ktehhvmmwnsbcvpjcmzt`) remains NO-GO**, exactly as the work order states, regardless of this pass's results:
- No code or migration from this branch has been applied anywhere outside this isolated clone.
- SEC-001/002/003/006 (handled separately, per the work order) remain unresolved as far as this pass is aware — F06 and F14 are explicitly blocked on two of them, and the broader "no patient-self RLS exists at all in tracked migrations" finding (`00_BASELINE_AND_SCOPE.md`) is a security-shaped gap, not merely a functional one, even though it falls under F03/F04/F05/F07/F11/F12's functional scope here.
- No staging E2E, no device testing, no owner acceptance testing has occurred.
- 16/16 features had code and/or migrations written and reviewed this pass. **That is not the same claim as "16/16 fixed"** — it is 14 IMPLEMENTED/UNVERIFIED, 2 explicitly BLOCKED, with zero runtime proof for any of them. Do not read this report as release-readiness.

## Single next owner approval needed
Stand up (or designate) an isolated Supabase + Vercel staging environment separate from `ktehhvmmwnsbcvpjcmzt`, so the prepared migrations can actually be applied and the BLOCKED test rows in `03_TEST_EVIDENCE.csv` can be run. See `04_OUTSTANDING_BLOCKERS.md` for the full list of what that would unblock and what stays gated (F06/SEC-003, F14/SEC-006) regardless.
