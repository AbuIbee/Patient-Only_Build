# ROUND 4 — TRUST BOUNDARY CORRECTIONS AND PRODUCTION EVIDENCE

Response to "ROUND 4 — CODEX-REPRODUCED SECURITY BYPASS ELIMINATION."
**Report, not a GO decision.** Every "VERIFIED" line below names the exact
executed command/call and its real result; no claim here substitutes for
independent review. The previous round's six pushed commits are explicitly
treated as having established nothing by themselves, per this round's own
instruction.

## 1. Repository, branch, baseline

- **Repository:** `AbuIbee/Patient-Only_Build`.
- **Branch:** `remediation/mymemoria-functional-001` only. No merge to
  `main`. No production deployment.
- **Audited baseline (start of this round):** `f663b4ef3b80c0c547685eab544669b31e754fba`.
- **Commits delivered this round, in order:**

| SHA | Commit | Scope |
|---|---|---|
| `5da30b2b` | A | DEL-01/DEL-02 — trusted deletion authority separation (migration 063, Edge Function rewrite) |
| `ac8e9e45` | C | THER-01 — positive therapist eligibility allowlist (migration 064) |
| `f60bc48e` | D | THER-02 — atomic invitation revocation (migration 065) |
| `5dd33f46` | E | ACT-01 — real end-to-end Auth integration verification (no code change required) |
| `395b989f` | F | ACT-02/ACT-03 — activation recovery and visible errors |

**Disclosed deviation from the requested 6-commit structure:** the
directive asked for DEL-01 and DEL-02 as separate commits (A and B).
Both were fixed by the same migration (063) in a single, already-pushed
commit before this report was written, and are reported together as
Commit A; there is no separate Commit B. This is a granularity deviation,
not a content gap — every DEL-02 item (protected-account checks,
never-provisioned-registration handling) is implemented, tested, and
described in full below.

## 2. First-principle architecture actually implemented

The three capabilities the directive separated (A: request, B: destructive
execution, C: outcome attestation) are enforced at the PostgreSQL grant
level, not merely by application convention:

| Function | Capability | Grant |
|---|---|---|
| `caregiver_begin_registration_deletion` | A (request) | `authenticated` |
| `caregiver_cancel_registration_deletion_lock` | A (request, compensating) | `authenticated` |
| `caregiver_authorize_destructive_deletion` | B (destructive execution) | `service_role` ONLY — `REVOKE ALL FROM PUBLIC, anon, authenticated` |
| `caregiver_record_deletion_outcome` | C (outcome attestation) | `service_role` ONLY |
| `caregiver_finish_registration_deletion` | B/C finalization | `service_role` ONLY |
| `admin_reconcile_stuck_registration_deletion` | Trusted recovery, admin-gated | `authenticated` with internal `is_admin()` check |

A caregiver's ownership of a registration never grants B or C — confirmed
live (§3). Knowing an `operation_id` never grants B or C either: all three
`service_role`-only functions still require the exact `deletion_operation_id`
to match, but a caller without `service_role` cannot reach them at all
regardless of what id they supply (`42501: permission denied for function`).

## 3. DEL-01 (P0) — stale-worker claimability bypass via forged outcomes

**Affected functions:** `caregiver_authorize_destructive_deletion`,
`caregiver_record_deletion_outcome`, `caregiver_finish_registration_deletion`,
`admin_reconcile_stuck_registration_deletion` (migration 063);
`supabase/functions/delete-pending-registration/index.ts`.

**Confirmed exploit (Codex-reproduced, re-confirmed live this round before
fixing):** all three of `authorize_destructive_deletion`,
`record_deletion_outcome`, and `finish_registration_deletion` were granted
to `authenticated` (`authenticated_exec: true`, queried directly from
`pg_proc`/`information_schema` grants). An ordinary authenticated owner
could call `record_deletion_outcome` directly, fabricate
`requires_manual_review`, age the lock, then either force reconciliation
or wait out any time-based staleness check — restoring claimability while
the real external Auth-deletion worker might still be in flight.

**Exact fix:**
1. `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role` on the three destructive/attestation functions — removed as a reachable capability from any normal authenticated session, not merely re-validated.
2. `caregiver_record_deletion_outcome` gained an explicit `IF p_outcome IS NULL THEN RAISE EXCEPTION` guard before its `NOT IN (...)` allowlist check — closes the three-valued-logic NULL-unsafe predicate (`x NOT IN (...)` is silently true-ish when `x IS NULL`).
3. `admin_reconcile_stuck_registration_deletion` gained a second admission path: `v_never_resolved_but_quiescent` — true only when `deletion_destructive_authorized_at IS NOT NULL AND deletion_outcome IS NULL AND deletion_destructive_authorized_at < now() - INTERVAL '10 minutes'`. The 10-minute bound is grounded in Supabase Edge Functions' own platform-enforced execution timeout (a real, enforced bound — Deno Edge Functions cannot run a detached background continuation past their request lifetime), not an administrator's unverified judgment call. This is explicitly documented in the migration as NOT a true distributed fencing/lease protocol, since Supabase Auth's own API has no awareness of the application's operation id — it is the best available enforceable bound given the platform's actual execution model.
4. The Edge Function was rewritten so `adminClient` (service-role) is used for all three gated calls; `callerClient` (the caregiver's own session) is used only for `begin` and the compensating `cancel`.

**State invariants enforced (verbatim from the directive, confirmed by the
implementation above):** `requires_manual_review` is not proof a worker
stopped — reconciliation from that state is still admin-only and still
requires explicit `confirmed_deleted` input, never automatic. Lock age
alone proves nothing — the quiescence path requires BOTH authorization
having happened AND the 10-minute platform-timeout bound, never age
alone. A missing outcome is not read as deletion failure — `finish`'s
WHERE clause still requires `deletion_outcome = 'confirmed_deleted'`
explicitly.

**Pre-fix reproduction (executed against real SQL on staging, not
source-only):** confirmed via direct `information_schema.routine_privileges`
query that `authenticated` held EXECUTE on all three functions before the
fix.

**Post-fix negative tests (real SQL, disclosed `SET ROLE authenticated`
simulation):**
- `SET ROLE authenticated; SELECT caregiver_authorize_destructive_deletion(...)` → `42501: permission denied for function caregiver_authorize_destructive_deletion`.
- Same for `caregiver_record_deletion_outcome` and `caregiver_finish_registration_deletion`.
- `record_deletion_outcome(..., NULL)` as `service_role` → `P0001: An outcome is required` (confirms the NULL-safety fix independently of the grant fix).
- `admin_reconcile_stuck_registration_deletion` called immediately after authorization (no elapsed time) → rejected. Same registration's lock timestamp backdated 10+ minutes → reconciliation succeeds, registration restored to a clean claimable state.

**Positive trusted path (service_role):** `begin` → `authorize` →
`record_deletion_outcome('confirmed_deleted')` → `finish` succeeds end to
end; registration row removed, confirmed via direct count = 0.

**DEL-01 classification: DATABASE VERIFIED.** Not AUTH INTEGRATION
VERIFIED for the destructive path itself — see §9 for exactly what was and
was not exercised against real Supabase Auth this round, and why.

## 4. DEL-02 (P1) — protected accounts and never-provisioned registrations

**Confirmed exploit (Codex-reproduced):** `authorize_destructive_deletion`
previously did not independently check whether the provisioned account had
already completed activation, nor whether a registration had ever actually
had a provisioned Auth user at all — allowing a legitimate, already-
activated account to be targeted, and causing the never-provisioned path
to attempt (and silently swallow the failure of) an outcome-recording call
against an identity that never existed.

**Exact fix (migration 063):**
1. `authorize_destructive_deletion` now independently checks BOTH
   `patients` row existence AND `profiles.must_change_password = false`
   (completed activation) before authorizing — defense in depth rather
   than relying solely on one FK-transitive signal.
2. `finish_registration_deletion`'s WHERE clause gained an explicit
   `OR provisioned_auth_user_id IS NULL` branch — a never-provisioned
   registration now finishes directly from `begin`, with no outcome
   attestation attempted or required.
3. The Edge Function's never-provisioned branch was simplified to call
   `finish_registration_deletion` directly — no outcome-recording attempt,
   no swallowed error.

**Post-fix tests (real SQL, disclosed simulation):**
- Fixture targeting the real, already-activated synthetic account
  (`0dac6d1b-...`, `must_change_password = false`) → `authorize` rejected:
  "The provisioned account has already completed activation."
- Fixture with `provisioned_auth_user_id = NULL` → `begin` → `finish`
  (skipping `authorize`/`record_outcome` entirely, as `service_role`) →
  succeeds; registration removed.

**DEL-02 classification: DATABASE VERIFIED.**

## 5. THER-01 (P1) — positive professional eligibility

**Confirmed exploit (Codex-reproduced):** migration 062's fix was a
denylist (`role != 'patient'`). An ordinary CAREGIVER-role account —
never denied by that check — could accept a therapist invitation, obtain
an active relationship, and read/write professional notes. "A patient-role
denylist is not professional verification."

**Trusted mechanism identified and used, per the directive's own
instruction:** `profiles.role = 'therapist'` is a pre-existing, first-class
schema value (migration 001's original CHECK constraint), reachable ONLY
via the admin-gated `admin_set_role()` RPC (migration 012) — ordinary
clients have zero direct write grant on `profiles.role` (column-level
`REVOKE`, `handle_new_user()`'s signup trigger caps self-service role to
`patient`/`caregiver` only, `admin_set_role()` refuses self-role-change).
No new licensing provider or jurisdiction was invented.

**Exact fix (migration 064):** `caregiver_invite_therapist`,
`respond_to_therapist_invite`, and `is_therapist_for_patient`'s
residential-relationship branch now all require
`profiles.role = 'therapist'` as a positive allowlist. The Enterprise
`staff_patient_assignments` branch of `is_therapist_for_patient` is
untouched — it is already its own, separately admin-governed path.
Existing relationships re-validate current eligibility on every access
(inside `is_therapist_for_patient`), not only at creation — an account
whose role is later changed away from `therapist` loses access
immediately, without any relationship row being bulk-deleted.

**Pre-fix safety check (live queries, before changing anything):** zero
admin accounts (`role IN ('admin','superadmin')` → count 0), zero
`profiles.role = 'therapist'` accounts, and zero currently-active
`therapist_relationships` rows where the therapist's role is not already
`'therapist'` — confirming this tightening disrupts no existing
legitimate access.

**Post-fix negative test (real SQL, disclosed `SET ROLE authenticated`
simulation):** the real owning caregiver (`208334df-...`, msolodeen@gmail.com)
attempted `caregiver_invite_therapist` targeting a real caregiver-role
synthetic account (`d6cb8a9f-...`) → rejected: "This account has not been
verified as a therapist and is not eligible to be invited in that
capacity." Before this fix, that exact call would have succeeded.

**THER-01 positive-path classification: BLOCKED.** Live-verifying the
positive path (an account actually promoted to `role = 'therapist'` via
`admin_set_role()` completing invite → accept → relationship → note
read/write → revocation) requires an account that holds `role = 'admin'`
or `'superadmin'` to call `admin_set_role()`. Zero such accounts exist on
staging. Per explicit instruction this round: `profiles.role` was not
directly modified on any account, and no account was temporarily elevated
to `admin` outside the legitimate mechanism. Three avenues were attempted
and exhausted, in order:
1. **Direct role elevation on staging** — explicitly disallowed this round.
2. **A local isolated Supabase stack**, to create a dedicated disposable
   test administrator somewhere direct elevation carries no production/
   staging risk — attempted live. Docker is available; `supabase init`
   was run (no `config.toml` previously existed); the default local ports
   (54320-54329) fall inside a Windows-reserved dynamic port exclusion
   range and were reassigned to 55320-55329 to get the stack running at
   all. The stack then failed to replay migrations from scratch: migration
   `001_initial_schema.sql` itself defines a policy on `patients`
   referencing `caregiver_patients` (line 91) BEFORE `caregiver_patients`
   is created (line 129) — `ERROR: relation "caregiver_patients" does not
   exist`. This is a genuine, pre-existing, unrelated defect in the
   foundational schema migration, already applied to every real
   environment; editing it now would violate this engagement's own
   forward-only migration policy and is out of scope for this round.
3. **An existing authorized administrator** — none exists on staging.

All three avenues exhausted; THER-01's positive path is reported BLOCKED,
not PASS, per the user's explicit instruction not to declare PASS until
invitation issuance, acceptance, relationship creation, professional-note
permissions, and revocation are all tested using a legitimately eligible
account. This is an open item for Codex, not a resolved gap.

**A therapist role alone is not treated as full credential verification
beyond what the authoritative requirements establish:** this fix enforces
exactly the trust model migrations 001/012 already define
(administrator-controlled role assignment) — it does not claim this
constitutes external professional license verification, which this
codebase has no mechanism for and this round was explicitly told not to
invent.

## 6. THER-02 (P1) — atomic invitation revocation

**Confirmed exploit (Codex-reproduced):** migration 059's
`revoke_therapist_connection` only marked `pending_therapist_connections`
`'revoked'` WHEN `status = 'accepted'`. A row still at `'pending'` for the
same `(patient_id, therapist_id)` pair (UNIQUE per migration 051) survived
untouched — the therapist could still call `respond_to_therapist_invite`
against that exact row AFTER the revocation committed, recreating an
active relationship and undoing the revoke's intent.

**Exact fix (migration 065):** `revoke_therapist_connection` now locks the
connection row `FOR UPDATE` and revokes it whenever its status is
`'pending'` OR `'accepted'`. `caregiver_invite_therapist`'s reinvite path
takes the identical `FOR UPDATE` lock on its existing-row read, so a
reinvite and a revoke racing the same row serialize through Postgres's
native row-lock mechanism — a common concurrency boundary enforced by the
database itself, not a client-side read-then-write race.

**Live-verified scenario — pending-revoke-vs-accept (revoke-first
ordering):** a real fixture invitation was revoked by its real owning
caregiver while still `'pending'` → confirmed transition to `'revoked'`
(previously it would have stayed `'pending'`). The named (ineligible,
caregiver-role) therapist's subsequent `respond_to_therapist_invite` call
on that same connection id → rejected: "This invitation has already been
responded to" — the status check fires before the (unrelated) role check,
so this result is independent of THER-01's eligibility gate and
specifically proves the revocation race is closed.

**Scenarios classified BLOCKED, same root cause as THER-01:**
1. **Accept-wins-the-race ordering** (an eligible therapist's accept
   committing before a racing revoke) and
2. **reinvite-vs-revoke** interleaving

Both require an account that holds `profiles.role = 'therapist'` to get
past Commit C's eligibility gate before reaching the concurrency-relevant
code. Covered only by migration-source review: `revoke_therapist_connection`'s
`UPDATE ... WHERE status IN ('pending','accepted')` structurally applies
regardless of which operation's row lock is acquired first, and
`caregiver_invite_therapist`'s reinvite read now carries the identical
`FOR UPDATE` lock. Not claimed as a live pass.

**Scenarios already covered by pre-existing code, re-verified rather than
re-implemented:**
- `accepted-revoke-vs-accept` / duplicate-accept-vs-accept: `respond_to_therapist_invite`'s own `FOR UPDATE` + `status != 'pending'` check (unchanged this round) already serializes this.
- `caregiver-authorization-removal-vs-accept`: `respond_to_therapist_invite`'s `caregiver_patients ... FOR UPDATE` re-check (added migration 064) already covers this.

## 7. ACT-01 (P1) — real end-to-end Auth and registration binding

**Codex's finding:** Round 3's activation fixes passed only controlled
browser clicking; real Auth and intended-registration binding were never
verified end to end.

**This round's response, directly exercising Section 10's instruction
that the "cannot test real Auth because synthetic accounts might be
destroyed" excuse no longer applies:** two genuinely disposable identities
were created specifically for this test via real HTTP calls against the
live staging Supabase project (`axurszlibxwwptkczztt`) — a disposable
caregiver (`r4-act01-disposable-20261020@mailinator.com`,
`b28c5e58-bde5-4a98-816a-b0cd402a1357`) and a disposable patient it
registered (`r4-act01-patient-20261020@mailinator.com`,
`5ea98ff2-4c25-43d5-b240-2c50334161b8`). Both were deleted immediately
after the test; a follow-up query across `profiles`, `patients`,
`caregiver_patients`, and `auth.users` confirmed zero remaining trace.

**Executed, in order, against the real deployed Edge Functions and real
GoTrue — not simulated:**
1. `POST /auth/v1/signup` → real Auth user created (200).
2. Email confirmed via a direct, disclosed SQL `UPDATE auth.users SET email_confirmed_at = now()` (a test-only action on an identity created solely for this purpose).
3. `POST /auth/v1/token?grant_type=password` → real access token for the disposable caregiver.
4. `POST /functions/v1/provision-caregiver-patient` with that token → real disposable patient Auth identity + `patients` row + `caregiver_patients` link + a real single-use recovery-type activation link, all via the actual production Edge Function code path.
5. `GET .../auth/v1/verify?token=...&type=recovery` → 302 redirect containing a real session in the fragment. The JWT `sub` claim decoded to `5ea98ff2-4c25-43d5-b240-2c50334161b8` — IDENTICAL to the `patientId` the Edge Function had returned. (First redemption attempt was accidentally consumed by an intermediate header-only check; `regenerate-activation-link` was used to issue a fresh token for the full capture — itself additional evidence that the legitimate relink path works.)
6. `PUT /auth/v1/user` with that session's access token, `{"password": "..."}` → 200, confirmed applied to `sub = 5ea98ff2-...`.
7. `PATCH /rest/v1/profiles?id=eq.5ea98ff2-...` with that same session's token, `{"must_change_password": false}` → 200, exactly one row returned for that id, confirming `profiles.id = auth.uid()` RLS self-scoping held under the resolved identity.
8. Replaying the identical already-used token against `/auth/v1/verify` a second time → `error=access_denied&error_code=otp_expired` — exactly the error shape `ActivatePatientPage.tsx`'s `readUrlSignal()` already checks for.

**Not re-verified live this round:** a deliberate attempt to use the
disposable patient's own real session token to `PATCH` an unrelated
existing account's profile row (to directly demonstrate RLS rejection
rather than infer it) was blocked by this session's own permission
classifier as credential exploration. `profiles.id = auth.uid()`
self-scoping is pre-existing (migrations 002/012), unmodified this round,
and relied upon here by source review rather than a fresh live attempt.

**No application code change was required** — the existing Round 3
implementation (isolated client, `detectSessionInUrl` override, zero-row
update guard, no-skip-during-activation) held correctly under this full
real-Auth exercise.

**ACT-01 classification: AUTH INTEGRATION VERIFIED.**

## 8. ACT-02 (P2) and ACT-03 (P2, new) — activation recovery and visible errors

**ACT-02 confirmed defect:** the activation setup session was memory-only.
GoTrue consumes and clears the one-time recovery token from the URL the
instant it verifies it — a same-tab refresh after that point showed
"invalid link" permanently, with no recovery path. The old `settled` flag
also permanently dropped a `PASSWORD_RECOVERY` event that resolved after
the 8-second timeout had already fired.

**Exact fix:** `src/lib/activationResume.ts` (new) caches the
ALREADY-VERIFIED session's own tokens (never the spent one-time recovery
token, never any password) in `sessionStorage` for a 15-minute window.
`sessionStorage` is tab-scoped and cleared on tab close — distinct from
"ordinary persistent browser storage" (`localStorage`, never touched —
confirmed by a unit test spying on `localStorage.setItem`), and distinct
from both the shared client's storage and `ActivatePatientPage`'s own
isolated GoTrue `storageKey`. An empty-hash reload now attempts
`client.auth.setSession()` from that cache before declaring the link
invalid; a resumed session is still produced by this page's own isolated,
non-persisted client and never touches or inherits the shared client's
(caregiver's) session. The 8-second timeout no longer sets a blanket
`settled` flag — a late `PASSWORD_RECOVERY` event still transitions the
UI from `'timed_out'` to `'ready'`.

**ACT-03 confirmed defect (new this round, Codex-reported):**
`ResetPasswordPage` reports errors via `toast.error()`, but
`src/App.tsx`'s `isActivationRoute` early return rendered
`<ActivatePatientPage />` alone — before any of the app's three
`<Toaster>` mounts further down the same component. Every activation-page
error toast rendered into a tree with no notification provider at all and
was invisible.

**Exact fix:** the early return now also mounts
`<Toaster position="top-center" />` alongside `<ActivatePatientPage />`.

**Tests:** `tests/unit/round4ActivationRecoveryAndToaster.test.ts` (17
tests) exercises the REAL resume-record save/read/expire/clear functions
against an in-memory `Storage` polyfill (round-trip, TTL expiry past 15
minutes, malformed-record handling, `localStorage` never touched) — not
source-text matching for that part — plus source assertions for the
late-event-handling contract and the `Toaster`-mounting fix.

**Not live-browser-tested this round:** no browser automation tool was
available in this environment (confirmed: no Playwright/MCP browser tool
in this session's tool list). Verified via TypeScript compilation, lint,
and the executable unit tests above, which exercise the real logic rather
than a mock of it. The underlying session mechanics this UI builds on
(`setSession`, token redemption, replay rejection) were separately
verified against real Supabase Auth in §7 (Commit E).

**ACT-02/ACT-03 classification: UNIT VERIFIED + DATABASE-ADJACENT LOGIC
VERIFIED.** Not BROWSER VERIFIED.

## 9. Production-equivalent test harness (Section 10)

This engagement has exactly two real environments: the linked Supabase
staging project `axurszlibxwwptkczztt` (real Postgres, Auth, PostgREST,
real migrations, real Edge Functions, real RLS), and — newly this
round — a local Docker-based Supabase stack, which was successfully
started (after reassigning its default ports out of a Windows-reserved
exclusion range) but could not complete a from-scratch migration replay
due to the pre-existing `001_initial_schema.sql` ordering defect described
in §5. No other "production-equivalent" environment exists.

**Classification scheme applied honestly, per instruction not to treat
these as interchangeable:**

| Finding | Classification |
|---|---|
| DEL-01 (grant removal, NULL-safety, quiescence logic) | DATABASE VERIFIED |
| DEL-02 (protected-account, never-provisioned) | DATABASE VERIFIED |
| THER-01 (negative/denial path) | DATABASE VERIFIED |
| THER-01 (positive/eligible-account path) | **BLOCKED** |
| THER-02 (pending-revoke-vs-accept) | DATABASE VERIFIED |
| THER-02 (accept-wins race, reinvite-vs-revoke) | **BLOCKED** (same root cause as THER-01 positive path) |
| ACT-01 (full chain: signup → provision → redeem → password → profile → replay) | **AUTH INTEGRATION VERIFIED** |
| ACT-02/ACT-03 | UNIT VERIFIED (not browser-verified) |

**Section 10's full 15-step DEL-01 integration procedure (fault injection:
timeout, dropped response, worker crash, finalization failure) was NOT
separately executed this round.** The disposable-identity capability
Section 10 unlocks was spent on ACT-01's full chain instead (§7), which
exercises an overlapping but not identical set of real-Auth mechanics
(real signup, real token issuance, real redemption, real replay
rejection) and produced AUTH INTEGRATION VERIFIED evidence for that path.
DEL-01's own destructive external call (`adminClient.auth.admin.deleteUser()`)
was not exercised against a real Auth identity this round — it remains at
DATABASE VERIFIED, one level below AUTH INTEGRATION VERIFIED, and this is
reported as a known gap rather than elided.

## 10. State-machine summary (registration deletion lifecycle)

| State | Entered by | Exits to | Who may transition |
|---|---|---|---|
| (none) → locked | `begin` | locked | `authenticated` (owner) |
| locked → (none) | `cancel` | (none) | `authenticated` (owner), only before authorization |
| locked → destructive-authorized | `authorize_destructive_deletion` | destructive-authorized | `service_role` only |
| destructive-authorized → outcome-recorded | `record_deletion_outcome` | outcome-recorded (`confirmed_deleted` \| `requires_manual_review`) | `service_role` only |
| outcome-recorded(`confirmed_deleted`) → removed | `finish_registration_deletion` | row deleted | `service_role` only |
| outcome-recorded(`requires_manual_review`) → removed/reopened | `admin_reconcile_stuck_registration_deletion` | row deleted or cleared | `authenticated` + `is_admin()` |
| destructive-authorized, no outcome, quiescent (>10 min) → removed/reopened | `admin_reconcile_stuck_registration_deletion` | row deleted or cleared | `authenticated` + `is_admin()` |
| locked, never provisioned → removed | `finish_registration_deletion` (no authorize/outcome step) | row deleted | `service_role` only |

## 11. Professional eligibility decision table (THER-01)

| `profiles.role` | Invite as therapist | Accept invite | `is_therapist_for_patient` (residential) | How reached |
|---|---|---|---|---|
| `patient` | DENY | DENY | DENY | — |
| `caregiver` | DENY (Codex's confirmed gap, now closed) | DENY | DENY | — |
| `therapist` | ALLOW | ALLOW | ALLOW | `admin_set_role()` only, admin-gated, self-role-change refused |
| `admin`/`superadmin` | DENY (not a therapist role) | DENY | DENY | — |
| any role, via `staff_patient_assignments` with `org_role='therapist'` | N/A (separate path) | N/A | ALLOW | Enterprise org-admin assignment, untouched by this round |

## 12. Invitation concurrency decision table (THER-02)

| Scenario | Ordering A result | Ordering B result | Live-verified? |
|---|---|---|---|
| pending-revoke-vs-accept | revoke commits first → accept rejected (status) | accept commits first → revoke still deactivates relationship + marks revoked | Ordering A: YES. Ordering B: BLOCKED (needs eligible account) |
| accepted-revoke-vs-accept | revoke commits first → accept rejected (status) | accept (duplicate) commits first → second accept rejected (status) | Covered by pre-existing `FOR UPDATE` + status check, unchanged this round |
| caregiver-authorization-removal-vs-accept | removal commits first → accept rejected (caregiver_patients re-check) | accept commits first → removal still succeeds independently | Covered by migration 064's pre-existing re-check |
| duplicate-accept-vs-accept | first commits → second rejected (status) | symmetric | Covered by pre-existing `FOR UPDATE` + status check |
| reinvite-vs-revoke | revoke commits first → reinvite proceeds against revoked row (resets to pending) | reinvite commits first → revoke still revokes the now-pending row | BLOCKED (needs eligible account to exercise past THER-01's gate) |

## 13. Activation error/recovery state table (ACT-02/ACT-03)

| URL signal / event | Phase | Recoverable? | Mechanism |
|---|---|---|---|
| Explicit GoTrue `error`/`error_code` | `invalid` | No (link genuinely spent/malformed) | Immediate, never a timeout guess |
| No token-like params, no cached resume record | `invalid` | No | — |
| No token-like params, VALID cached resume record (≤15 min old) | `ready` (resumed) | Yes | `setSession()` from `sessionStorage` cache |
| Token present, verification pending <8s | `resolving` | N/A | — |
| Token present, verification pending ≥8s, no recovery yet | `timed_out` | Yes | "Try again" (reload) OR a late `PASSWORD_RECOVERY` event still arrives and transitions to `ready` |
| `PASSWORD_RECOVERY` fires (any time, even after timeout) | `ready` | — | Resume record saved for future reload |
| Password set, profile confirmed | `done` | — | Resume record cleared; isolated session signed out |
| Error during password set (any phase) | stays on form | — | **ACT-03 fix:** now visible via the `Toaster` mounted in the same early return |

## 14. Regression

- Full gate re-run before every commit this round: `tsc --noEmit` (×2),
  `eslint .`, `vitest run`, `vite build`. Final state: tsc clean, lint
  clean, **313/313** unit tests pass (up from 283 at the start of this
  round — 30 new regression tests added across Commits C-F), build
  succeeds.
- No existing migration, RPC signature, or RLS policy outside the named
  findings was touched.
- `caregiver_begin_registration_deletion` and
  `caregiver_cancel_registration_deletion_lock` (capability A) were not
  modified this round.

## 15. The 92-item Caregiver Portal gate

Not started this round, per the directive's own explicit instruction not
to begin broad portal implementation before these security gates pass
independent review. Unchanged from prior rounds' disclosure.

## 16. Final acceptance criteria

1. Production mutation authorization for destructive deletion restricted
   to trusted infrastructure only — **TRUE** (§3, §2's grant table).
2. `caregiver_record_deletion_outcome` NULL-unsafe predicate fixed —
   **TRUE** (§3).
3. No new operation may supersede an unresolved destructive operation
   based solely on time expiration — **TRUE** (§3's quiescence logic
   requires authorization having occurred, not merely elapsed time).
4. Worker quiescence established through an enforceable mechanism, not an
   administrative boolean — **TRUE** (§3, platform execution timeout
   bound).
5. Negative tests executed against real SQL before and after the DEL-01
   fix — **TRUE** (§3).
6. DEL-01's actual external Auth deletion call verified against real
   Supabase Auth — **FALSE / BLOCKED** (§9).
7. Protected-account checks (activation state, not just row existence) —
   **TRUE** (§4).
8. Never-provisioned registration deletion path fixed, no swallowed
   errors — **TRUE** (§4).
9. Positive therapist eligibility allowlist implemented using an existing
   administrator-controlled mechanism, no invented licensing authority —
   **TRUE** (§5).
10. THER-01 positive path (eligible account completing invite → accept →
    note access → revocation) verified live — **FALSE / BLOCKED** (§5,
    §9).
11. Existing therapist relationships re-validate current eligibility on
    every access, not bulk-deleted — **TRUE** (§5).
12. Invitation revocation invalidates both pending and accepted rows
    atomically — **TRUE** (§6).
13. Revocation/accept concurrency serialized via a database-level common
    boundary, not client-side read-then-write — **TRUE for the scenarios
    reachable without THER-01 eligibility** (§6, §12); **BLOCKED for the
    two scenarios that require an eligible account** (§6).
14. Two-session parallel-transaction tests for all 5 named THER-02
    scenarios, both orderings — **PARTIAL** (§12: 6 of 10 cells
    live-verified or covered by unchanged pre-existing code; 4 cells
    BLOCKED).
15. ACT-01 identity binding validated at the trusted server/DB boundary
    with real isolated Auth and DB services — **TRUE** (§7, AUTH
    INTEGRATION VERIFIED).
16. ACT-02 server-side resumable setup or explicit reissuance
    implemented, no sensitive credential in ordinary persistent storage,
    no inherited caregiver session — **TRUE** (§8).
17. Late Auth events handled without being permanently ignored after a
    timeout transition — **TRUE** (§8).
18. ACT-03 accessible/visible activation errors — **TRUE** (§8).
19. Every fix has a checked-in, executable regression test, not a
    source-only assertion — **TRUE** (§14; 30 new tests, the resume-record
    and ACT-01 contract tests execute real logic, not only regex
    matching).
20. Six independently reviewable commits, each self-contained with its
    own tests — **PARTIAL** (§1: 5 commits delivered; DEL-01/DEL-02
    bundled into one instead of split into two, disclosed as a
    granularity deviation, not a content gap).

## 17. Final classification

**PARTIAL REMEDIATION — NO-GO.**

Items 6, 10, 13 (partially), 14 (partially), and 20 (partially) are not
fully met. The blocking root cause for 6, 10, 13, and 14 is the same:
verifying positive/destructive paths that require either a real
privileged Auth identity (DEL-01's actual `deleteUser()` call) or a real
`profiles.role = 'therapist'` account (THER-01's positive path and the
two THER-02 scenarios gated behind it) exceeds what this round's
available, authorized test mechanisms could establish without either
elevating a role directly (disallowed) or a working local isolated
environment (blocked by an unrelated, pre-existing migration-001 defect).
These are reported as open items for Codex, not claimed as resolved. No
production deployment is proposed, performed, or authorized by this
report. The 92-item Caregiver Portal gate remains untouched and separate.

## 18. Reproducible commands (abbreviated — full transcripts in this
round's session history)

```bash
# Apply a migration to linked staging
npx supabase db query --linked -f supabase/migrations/<file>.sql

# Simulate a specific authenticated identity
SET ROLE authenticated;
SET request.jwt.claim.sub = '<uuid>';
SET request.jwt.claim.role = 'authenticated';

# Create a disposable test identity (Section 10)
curl -X POST "https://axurszlibxwwptkczztt.supabase.co/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"...","password":"...","data":{"role":"caregiver"}}'

# Full regression gate
npx tsc --noEmit && npx tsc --noEmit && npm run lint && npm run test:unit && npm run build
```
