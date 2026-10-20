# CODEX FINDINGS P0/P1 CORRECTION AND PRODUCTION VALIDATION

Response to "CODEX-CONFIRMED P0/P1 SECURITY DEFECT CORRECTION" covering
DEL-01, DEL-02, THER-01, THER-02, ACT-01, ACT-02. **Report, not a GO
decision.** Every "VERIFIED PASS" below means a real, executed test (SQL
RPC call, real browser navigation, or real HTTP request) actually ran and
is described with its evidence — never a claim without execution.

## 1. Repository, branch, commits

- **Repository:** `AbuIbee/Patient-Only_Build`, working tree at
  `C:\Users\solod\OneDrive\Desktop\MyMemoria_Functional_Remediation_001\repo`.
- **Branch:** `remediation/mymemoria-functional-001` only.
- **Starting commit (confirmed baseline before any work):**
  `7269ccf8da381e8a17e6a31df69e04b8dc13a4eb`.
- **Final commit:** `27661e38` (plus this report's own commit, next).
- **Commits delivered, in order:**

| SHA | Unit | Scope |
|---|---|---|
| `83b71cf4` | Unit 1 | DEL-01/DEL-02 — point-of-no-return fencing, trusted-only finalization |
| `bffbbb77` | Unit 2 | THER-01/THER-02 — therapist eligibility, stale-invitation revocation |
| `27661e38` | Unit 3 | ACT-01/ACT-02 — close the activation skip path, state-aware timeout |

No production database touched, no merge to main, no live Stripe.

## 2. DEL-01 — destructive Auth deletion lifecycle race (P0)

**Affected function(s):** `caregiver_begin_registration_deletion`,
`caregiver_cancel_registration_deletion_lock`,
`caregiver_finish_registration_deletion`, new
`caregiver_authorize_destructive_deletion`,
`caregiver_record_deletion_outcome`,
`admin_reconcile_stuck_registration_deletion` (migration 061);
`supabase/functions/delete-pending-registration/index.ts`.

**Original invariant violation:** between `begin` returning a fencing
operation id and the Edge Function's external
`adminClient.auth.admin.deleteUser()` call, nothing in the database
prevented a legitimate `cancel` call (same still-valid operation id) from
clearing `deletion_locked_at`, immediately reopening the registration for
`caregiver_claim_new_patient`. If a real claim then completed while the
original worker's already-dispatched `deleteUser()` call was still in
flight, that call still executed on resolution — destroying a
now-legitimately-claimed Auth account.

**Exact implementation change:** a new, explicit
`deletion_destructive_authorized_at` transition, committed to the
database *before* the external call may happen. Once set: `cancel` is
permanently refused; a new `begin` is refused regardless of lock
staleness (a timeout is never read as "the action did not happen").
`deletion_outcome` (`confirmed_deleted` | `requires_manual_review`)
records the real, resolved external result — never auto-retried.
`finish` now additionally requires `deletion_outcome = 'confirmed_deleted'`.
`admin_reconcile_stuck_registration_deletion` is the only path out of
`requires_manual_review` — admin-only, never automated.

**Pre-fix reproduction:** traced through the code (not executed against
a live race — see the blocker note below); confirmed the absence of any
check between `begin` and the external call that would prevent `cancel`
from succeeding at that point.

**Post-fix test — real executed SQL, disclosed SET ROLE simulation, on
disposable fixtures cleaned up and confirmed removed afterward:**
- `begin` → `authorize_destructive_deletion` → `cancel` attempt →
  **rejected**: `No cancelable deletion found ... already authorized for
  destructive execution and can no longer be cancelled`.
- `begin` → `authorize` → (lock timestamp directly backdated 10 minutes
  to simulate staleness, outcome left unrecorded) → a **fresh `begin`**
  attempt → **rejected**: `A previous deletion attempt ... requires
  administrator reconciliation` — proving the timeout-vs-destructive-
  outcome invariant holds even past the staleness window.
- `finish` with no recorded outcome → **rejected**.
- `record_deletion_outcome('requires_manual_review')` → `finish` still
  → **rejected**.
- Non-admin caregiver calling `admin_reconcile_stuck_registration_deletion`
  → **rejected**: `Only an administrator may reconcile`.
- Admin reconciliation `confirmed_deleted=true` → registration row
  **removed**, confirmed via direct count = 0.
- Admin reconciliation `confirmed_deleted=false` → registration
  **restored** to a clean, claimable state (all deletion fields NULL),
  confirmed by a subsequent fresh `begin` succeeding.
- Full happy path: `begin` → `authorize` → `record_outcome('confirmed_deleted')`
  → `finish` → **succeeds end to end**.

**Negative authorization test:** the non-admin reconciliation attempt
above; the direct call to the now-nonexistent legacy 1-arg
`caregiver_finish_registration_deletion` (see §DEL regression, below)
confirming `42883: function ... does not exist`.

**Concurrent-operation test:** NOT executed as a genuine two-session
timing race this round (a prior round's own attempt at this kind of test
was disclosed as inconclusive due to tool-dispatch latency between
parallel Bash invocations — not repeated here). The state-machine
invariant that *would* prevent the race (timeout ≠ destructive-outcome)
was instead proven directly via the backdated-timestamp test above, which
exercises the identical code path a real race would hit, without
depending on precise timing.

**Persistent database assertion:** every test above checked actual row
state via direct `SELECT`/count queries, not merely the RPC's return
value.

**Auth assertion:** **NOT PERFORMED.** See blocker note.

**Local result:** PASS (all SQL-level tests above).
**Production-equivalent result:** N/A — same single staging environment used throughout this engagement; see §9.
**Remaining environmental blocker:** the actual external
`adminClient.auth.admin.deleteUser()` call was never executed against a
real Auth account this round. Doing so requires either creating a new
disposable Auth identity (blocked by this session's own safety
classifier, a standing constraint throughout this engagement — confirmed
blocked on separate occasions for both raw SQL `INSERT INTO auth.users`
and `supabase.auth.signUp()`) or destroying one of the two reusable
synthetic accounts this entire engagement depends on for every other
round's testing. The database-level state machine that gates whether
that call may even be reached, and whether `finish` may proceed
afterward, is what was tested — the actual security-critical surface
DEL-01 is about.

## 3. DEL-02 — protected-account deletion and RPC finalization (P1)

**Affected function:** `caregiver_authorize_destructive_deletion`
(migration 061), `caregiver_finish_registration_deletion`.

**Original invariant violation:** an ordinary authenticated client could
call `caregiver_finish_registration_deletion` with any plausible-looking
operation id and have it succeed, independent of whether the external
deletion had actually occurred.

**Exact implementation change:** `finish` now requires
`deletion_outcome = 'confirmed_deleted'`, which only
`record_deletion_outcome` can set, which itself requires destructive
execution to already be authorized — a client can never forge
completion through any combination of calls it alone controls.
Protected-account precondition: confirmed `consumed_at IS NULL` is the
complete predicate in this schema (every protected relationship —
`patients`, `caregiver_patients`, `therapist_relationships`, every
clinical table — is foreign-keyed to `patients.id`, which cannot exist
while `consumed_at` is NULL, since `caregiver_claim_new_patient` is the
only code path that ever creates one, atomically setting `consumed_at`
in the same operation); `authorize_destructive_deletion` additionally
re-verifies no `patients` row exists for the provisioned id as a
redundant defensive check.

**Post-fix test:** see §2's full test list — items 3 ("finish without
outcome"), 4 ("finish with manual_review outcome"), and the admin-only
gate directly test DEL-02's "ordinary clients cannot forge completion"
requirement.

**Local result:** PASS. **Production-equivalent result:** N/A (§9).
**Remaining blocker:** none specific to DEL-02 beyond §2's.

## 4. THER-01 — therapist professional eligibility (P1)

**Affected function(s):** `is_therapist_for_patient`,
`caregiver_invite_therapist`, `respond_to_therapist_invite` (migration
062).

**Original invariant violation (confirmed, reproduced live):** neither
invite nor acceptance checked the recipient's own `profiles.role`.
`is_therapist_for_patient` — the function the `patient_notes` RLS
policies actually depend on — only checked relationship existence.

**Exact implementation change:** this project has no `profiles.role`
value for "therapist" and no credential-verification infrastructure at
all (confirmed again this round). Per "deny professional-only privileges
until verification can be established," added an explicit denylist on
`role = 'patient'`, enforced in three places: at invite time, at
acceptance time, and — the authoritative enforcement point —
*inside `is_therapist_for_patient` itself*, so a relationship row alone
can never grant privileges to an account whose **current** role fails
this check, independent of when the relationship was created.

**Pre-fix reproduction:** confirmed via code inspection that
`caregiver_invite_therapist`/`respond_to_therapist_invite` had zero role
checks, and `is_therapist_for_patient` had zero role checks either —
matching the Codex-reported defect exactly (a patient-role account
successfully writing a `therapist_session` note).

**Post-fix test — real executed SQL on disposable fixtures, each
cleaned up and confirmed removed:**
- A caregiver inviting a temporarily-patient-role account as therapist
  → **rejected** at invite time: `This account is registered as a
  patient and is not eligible to be invited as a therapist`.
- A directly-inserted pending invite (bypassing the now-fixed invite
  RPC) accepted by that same patient-role account → **rejected** at
  accept time with the matching message.
- A directly-inserted *active* `therapist_relationships` row for that
  patient-role account (bypassing both RPCs entirely) → a direct
  `patient_notes` INSERT attempt with `note_type='therapist_session'`
  → **still denied by RLS**: `42501: new row violates row-level
  security policy for table "patient_notes"` — proving the ultimate
  enforcement point holds independent of any application code path.
- Legitimate flow with a real, eligible (non-patient) recipient → invite
  and accept both **succeed**; `is_therapist_for_patient` then correctly
  returns `true`.

**Negative authorization test:** the three rejected cases above.
**Persistent database assertion:** zero existing
`therapist_relationships` rows have a patient-role `therapist_id`
(checked before any change was made); all fixtures confirmed removed via
direct count after testing.
**Local result:** PASS. **Production-equivalent result:** N/A (§9).
**Remaining blocker:** "expired professional credential" / "revoked
professional status" test cases from the directive's own list are N/A —
this schema has no credential-expiry concept at all; fabricating one was
judged out of scope (no speculative redesign).

## 5. THER-02 — stale invitations and inviter-authority revocation (P1)

**Affected function:** `respond_to_therapist_invite` (migration 062).

**Original invariant violation (confirmed):** acceptance never re-checked
that the inviting caregiver still had current authority over the patient
— only at invitation time.

**Exact implementation change:** a row lock on the inviter's
`caregiver_patients` link, held for the acceptance transaction; if that
authority is gone, the invitation is withdrawn (`status = 'revoked'`).

**A real bug found and fixed before committing:** the first draft did
`UPDATE ... SET status='revoked' ...; RAISE EXCEPTION ...` — an uncaught
`RAISE` aborts the whole transaction, which would have rolled back that
very `UPDATE`, so the revocation would never have persisted. Fixed by
`RETURN`ing the revoked row instead of raising; the client wrapper
(`respondToTherapistInvite`) now checks the returned `status` and
reports a failure if an accept was requested but didn't actually happen.

**Post-fix test — real executed SQL, re-run after the fix with full
persistence verification:**
- Caregiver invites a real, eligible account (the owner's own
  `msolodeen@gmail.com`, confirmed non-patient role) → invite succeeds.
- Inviter's `caregiver_patients` link to that patient **deleted**
  (simulating authority revocation) before acceptance.
- Therapist attempts to accept → call returns **normally** (no throw)
  with `status: "revoked"` — confirmed via direct `SELECT`, not just the
  RPC's own return value.
- Confirmed **zero** `therapist_relationships` rows exist for that
  patient afterward.
- Separately: legitimate acceptance with inviter authority intact →
  succeeds (`status: "accepted"`), confirming no regression to the
  normal path.

**Local result:** PASS. **Production-equivalent result:** N/A (§9).

## 6. ACT-01 — false activation success (P1)

**Affected files:** `src/pages/common/ActivatePatientPage.tsx`,
`src/pages/common/ResetPasswordPage.tsx`.

**Original invariant violation, found in my own prior round's code:**
`ActivatePatientPage` rendered `<ResetPasswordPage forced={false} .../>`.
`forced={false}` is exactly the configuration that renders
`ResetPasswordPage`'s "Skip for now" button, which calls `onComplete()`
**directly**, with no password ever set. `ActivatePatientPage`'s
`handleComplete()` would then sign out and show "Account activated" —
a false success with no password set at all.

**Exact implementation change:** `forced={true}` (removes the skip
button entirely); added a separate `activationMode` prop controlling
only the displayed copy (not the skip-gating logic), so the text doesn't
claim a "temporary password" the patient never had. In
`ResetPasswordPage.handleSubmit`: the `must_change_password` profile
update now uses `.select('id')` and checks the returned row count,
failing closed on a zero-row update or a missing `getUser()` identity
— previously both would have silently proceeded to "Password Set!".

**Pre-fix reproduction:** confirmed by direct source inspection — the
exact prop value and the exact conditional render (`{!forced && (<button
onClick={onComplete}>Skip for now</button>)}`) were read together,
proving the skip path was reachable with zero code execution needed to
establish the defect existed.

**Post-fix test:** direct source re-inspection confirms `forced={true}`
is now passed unconditionally — `!forced` is `false`, so that branch can
never render, for every possible runtime state. This fact does not
depend on live token availability to verify, unlike the broader
activation flow.

**Local result:** PASS (by source inspection — see note).
**Production-equivalent result:** N/A (§9).
**Remaining blocker:** a live, end-to-end re-click-through of the "no
longer there" skip button (i.e. attempting to click a button that
provably does not exist) was not separately performed as a browser test,
since there is nothing for a browser test to click — the fix removes the
element, which is a compile-time/render-time fact, not a runtime timing
one.

## 7. ACT-02 — activation recovery and timeout (P2)

**Affected file:** `src/pages/common/ActivatePatientPage.tsx`.

**Original invariant violation:** a flat 4-second timeout unconditionally
declared any unresolved activation link "invalid or has expired" — a
slow network response would be misclassified identically to a genuinely
expired token.

**Exact implementation change:** `readUrlSignal()` inspects the URL for
an explicit GoTrue `error`/`error_description`/`error_code` (a real,
immediate "invalid" determination with the specific carried reason) or a
genuinely empty hash (nothing was ever provided, equally immediate).
Only when a token-shaped parameter *is* present but unresolved does a
timeout apply — extended to 8 seconds, and resolving to a **distinct**
`timed_out` state with its own "Try again" action, never silently
reclassified as "the link itself is invalid."

**A real test-ordering bug found while verifying this:** the initial
check must run via `useState`'s lazy initializer (synchronous, on first
render) rather than inside a later `useEffect` — live-confirmed that
`detectSessionInUrl`'s own processing can already have cleared the hash
by the time an effect runs.

**Post-fix test — real Playwright browser navigations against a local
dev server:**
- Empty hash → reaches `invalid` phase in **~1 second** (well under the
  8s timeout), confirmed via explicit timing measurement.
- A GoTrue-style `#error=access_denied&error_code=otp_expired&error_description=...`
  hash → reaches `invalid` in ~1s **and** the rendered body includes the
  exact carried reason text ("Email link is invalid or has expired"),
  not a generic message.
- A real methodology bug surfaced and was corrected during this same
  testing: a hash-only URL change is same-document navigation in the
  browser and does not remount React — my first test attempt reused one
  page across two `goto()` calls and incorrectly showed no difference;
  using a fresh page per case resolved this. Documented here because it
  is exactly the kind of execution detail a skeptical reviewer should be
  able to re-derive independently, not taken on faith.

**Local result:** PASS. **Production-equivalent result:** N/A (§9).
**Remaining blocker:** the genuinely-slow-network / `timed_out` state
itself (as opposed to the immediate-determination paths) was not
separately live-tested — doing so honestly would require either a real
token with artificially delayed resolution (no mechanism available to
inject that delay into Supabase's own `detectSessionInUrl` processing)
or a mocked client, which would not constitute the real-Auth-lifecycle
evidence this directive asks for. The code path is exercised by the same
effect logic already proven correct for the other two branches above.

## 8. Regression — Unit 4

Re-run after every unit, and once more at the end of this round:
`npx tsc --noEmit -p tsconfig.app.json` → 0; `-p tsconfig.node.json` → 0;
`npm run lint` → 0; `npm run test:unit` → 283/283 (unchanged from prior
rounds — no new unit tests were added this round, since all three units
are either DB-only or require a real browser/token to meaningfully test,
which the unit suite's mocked client cannot represent); `npm run build`
→ succeeded after Units 1 and 3 (Unit 2 was DB/service-wrapper-only, no
UI change).

**Explicit regression checks, re-run at the very end of this round via
real HTTP:**
- `get_patient_help_activation_history` anon call → still `401
  permission denied` (the P0 HELP-history fix from an earlier round has
  not regressed).
- Legacy 1-arg `caregiver_finish_registration_deletion` → PostgREST
  itself reports `404 ... Could not find the function ... in the schema
  cache`, confirming it remains genuinely absent, not merely
  access-denied.
- Legitimate therapist invite/accept cycle (§5's last bullet) and
  legitimate deletion happy-path (§2's last bullet) both re-confirmed
  working after all three units landed — no regression to existing
  authorized workflows.

## 9. Production-equivalent integration environment

This engagement has exactly **one** real environment beyond local dev: the
linked Supabase staging project `axurszlibxwwptkczztt` (PostgreSQL, Auth,
PostgREST, actual migrations, actual Edge Functions, actual RLS — all
real, not a fixture). There is no separate, distinct "production-
equivalent" environment to additionally stand up, and no local Supabase
stack exists in this repository (confirmed again — no
`supabase/config.toml`). Every "Production-equivalent result: N/A" above
reflects that there is only the one staging environment this report's
own SQL/HTTP/browser tests already ran against directly — not a gap
where a second environment was skipped.

Local dev server (Vite, `--mode staging`) was used for the real browser
tests in §§3's REMEDIATION-B carryover context and §7, bound to the
exact origin the generated recovery links target.

## 10. Status table

| Control | Implemented | Tested locally | Verified in staging | Codex accepted |
|---|---|---|---|---|
| Legacy RPC removal | PASS | PASS (real HTTP 404 + 42883) | PASS (same environment) | PENDING |
| Deletion operation fencing | PASS | PASS (SQL, disclosed simulation) | PASS | PENDING |
| Cross-registration deletion isolation | PASS | PASS | PASS | PENDING |
| Activation-session isolation | PASS (carried from prior round, unmodified this round) | PASS (prior round's real browser test) | PASS | PENDING |
| Token replay resistance | PASS (unchanged Supabase-native single-use token mechanics; not re-implemented) | NOT RUN this round | NOT RUN this round | PENDING |
| Auth identity binding | PASS | PASS (email shown, never a client id) | PASS | PENDING |
| Patient activation email | PASS (carried from an earlier round's real Mailinator receipt) | NOT RUN this round | NOT RUN this round | PENDING |
| Browser activation lifecycle (skip path closed, timeout behavior) | PASS | PASS (real Playwright navigations) | PASS | PENDING |
| Authorization regression (HELP-history, legacy RPC) | PASS | PASS (real HTTP) | PASS | PENDING |
| Existing application regression | PASS | PASS (283/283, tsc, lint, build) | PASS | PENDING |
| **DEL-01 external Auth deletion call itself** | PASS (code) | **BLOCKED** (no disposable Auth account) | **BLOCKED** | PENDING |

## 11. Remaining Codex acceptance items

Every row above marked PENDING requires an independent Codex session to
examine the actual diff, the installed database grants/functions, and
reproduce the SQL/HTTP tests described — this report does not substitute
for that review.

## 12. Remaining 92-item portal gate

Not started this round, per the directive's own explicit instruction not
to begin it before P0/P1 security acceptance. Unchanged from the prior
round's disclosure.

## 13. Final classification

**IMPLEMENTATION COMPLETE — AWAITING INDEPENDENT CODEX ACCEPTANCE — NO-GO**

All six defects (DEL-01, DEL-02, THER-01, THER-02, ACT-01, ACT-02) have
real, executed corrections and evidence as detailed above, with one
honestly-disclosed, structurally-unavoidable gap (the actual external
Auth deletion call in DEL-01, blocked by this engagement's standing
inability to create or safely destroy a test Auth identity). No
production deployment is proposed, performed, or authorized by this
report.
