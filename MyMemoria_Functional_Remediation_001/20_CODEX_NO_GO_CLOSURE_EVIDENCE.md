# CODEX NO-GO CLOSURE EVIDENCE — Senior Architect Execution Contract

Response to "MY MEMORIA ALLY — SENIOR ARCHITECT EXECUTION CONTRACT" and the
independent Codex post-remediation NO-GO (October 19, 2026). **This document
reports what was executed. It is not a GO decision and does not claim
production readiness.** Per the contract's own framing, (A) whether these
pushed fixes are safe to retain, and (B) whether the security foundation is
ready for the 92-item build, are Codex's to decide from this evidence. (C)
production remains NO-GO until the owner's explicit authorization.

## 1. Branch, commits, Preview

- **Branch:** `remediation/mymemoria-functional-001` only. No merge to main
  attempted or proposed. No production migration run, no production
  Supabase project touched (`ktehhvmmwnsbcvpjcmzt` was never referenced by
  any command this round). No Paid2You access.
- **Starting HEAD** (review baseline, confirmed matching before any work
  began): `254ae75c34de2a98f86e7f31862445b65bac4d2e`.
- **Ending HEAD:** `76f99e780e644d71f1e712859a140738be65faf5`.
- **Pushed commits, in order:**

| SHA | Unit | Summary |
|---|---|---|
| `e849727b` | S0 (P0) | Close live anonymous HELP-history / care-team exposure |
| `c1ca96ac` | — | Fix the 2 real `tsconfig.app.json` compiler errors |
| `958fabfe` | S1 | Close NULL-claim-token bypass; stop trusting client patient id |
| `f3e0c06d` | S2 | Fencing operation id on the registration-deletion lock |
| `a6d35712` | S3 | Close `patient_intake` UPDATE re-targeting hole |
| `54dfb16e` | S6 | Serialize `invite_org_member` seat-capacity check |
| `d9ca3008` | S4 | Disclose residential therapist connections are unverified |
| `541d05af` | S5* | Restrict `therapist_relationships` UPDATE to `is_active` only |
| `76f99e78` | S4 | `revoke_therapist_connection` also marks the pending row revoked |

  \* Labeled S5 in its commit message by mistake — this is a Section 5
  (mutation-scope) fix, not the Section 3 activation-isolation item, which
  is BLOCKED (§2, item 12).

- **Preview:** `https://patientonly-git-remediation-mymemoria-funct-452d31-memoriahelps.vercel.app`
  (stable branch alias), underlying deployment `dpl_Af6tAoEEgrEHV2rFDQLJ963MDgHM`,
  built automatically on the final push, **status Ready**. Remains behind
  Vercel's own SSO gate from outside the owner's account (unchanged,
  pre-existing, not newly investigated this round).
- **No production activity statement:** every `supabase db query`/`functions
  deploy` command this round targeted `--linked`/`--project-ref
  axurszlibxwwptkczztt` (staging) exclusively; this was independently
  re-confirmed via the anon key's own JWT payload (`ref: axurszlibxwwptkczztt`)
  before any write, consistent with this engagement's standing verification
  habit.

## 2. Item-by-item status

| ID | Root defect | Fix (file/migration) | Positive test | Negative test | Env | Status | Commit |
|---|---|---|---|---|---|---|---|
| S0a | `get_patient_help_activation_history` — anon EXECUTE + NULL-unsafe `!=` fell through to unauthenticated `RETURN QUERY` | Migration 053: explicit NULL rejection, positive auth expression, `REVOKE...FROM anon` | Caller reading own id succeeds | Real anon-key HTTP POST → `401 permission denied` (not simulated); unrelated authenticated caller → `P0001 Not authorized` | Real HTTP + SET ROLE (disclosed) | **PASS** | `e849727b` |
| S0b | `get_patient_care_team_connections` — identical defect | Migration 053, same pattern | Same | Unrelated authenticated caller → `P0001 Not authorized` | SET ROLE (disclosed) | **PASS** | `e849727b` |
| S0c | Audit: any other SECURITY DEFINER fn with anon EXECUTE sharing this defect class | Queried all ~65 anon-executable SECURITY DEFINER functions; regex-scanned for the `!=`/`<>` vs `auth.uid()` pattern and for "no `auth.uid()` reference at all" | — | Confirmed only S0a/S0b affected; everything else either checks `auth.uid() IS NULL` first or gates through `is_active_org_director`/`is_active_org_member` (NULL-safe by construction) | Source inspection + live query | **PASS** (audit complete) | `e849727b` |
| TS1/TS2 | `CaregiverPatientView.tsx` nullable `scheduled_time`/`uploaded_at` typed non-nullable | `tsconfig.app.json` is the real app check — root `tsconfig.json` has `files: []` and silently checks nothing (my prior round's "0 errors" claim was a false negative) | `npx tsc --noEmit -p tsconfig.app.json` → 0 | — | Test run | **PASS** | `c1ca96ac` |
| S1a | `caregiver_claim_new_patient` — NULL `p_claim_token` made `!=` evaluate to NULL, skipping the token check entirely | Migration 054: `IS DISTINCT FROM` throughout; explicit NULL rejection | Legitimate claim path unchanged (operator-equivalent for non-NULL cases) | NULL token on a real disposable fixture → blocked before the token comparison even runs | Live staging, SET ROLE (disclosed) | **PASS** | `958fabfe` |
| S1b | Claim trusted client-supplied `p_patient_id` independent of registration provenance | Migration 054: requires `p_patient_id = provisioned_auth_user_id`; a registration with no provenance is quarantined, not trusted | — | Legacy-no-provenance fixture → quarantined; correct token + mismatched patient id → rejected. Confirmed zero in-flight registrations currently lack provenance (no legitimate row affected) | Live staging | **PASS** | `958fabfe` |
| S1c | `provision-caregiver-patient` logged a failed provenance write as non-fatal and continued | Edge Function: `.select('id')` confirms the row was actually affected; stops and returns a structured error otherwise | — | Not independently re-triggered (would require forcing a real write failure); code-reviewed against the new DB-side requirement it must now satisfy | Source change, deployed | **PASS** (code), **NOT independently re-tested** | `958fabfe` |
| S2 | Deletion lock was a plain timestamp with no fencing — a stale `finish`/`cancel` could act on a superseded `begin` | Migration 055: `deletion_operation_id`, required exact match | Correct operation id → finish deletes row / cancel releases lock, both confirmed | Wrong operation id → rejected on both `finish` and `cancel`, confirmed on two separate disposable fixtures | Live staging, SET ROLE (disclosed) | **PASS** | `f3e0c06d` |
| S3 | `patient_intake` UPDATE policy's implicit WITH-CHECK-via-USING-reuse did not re-verify a NEW `patient_profile_id` | Migration 056: explicit WITH CHECK requiring the new `patient_profile_id` to be self or a linked patient | Ordinary field update (no identity columns touched) → succeeds; retarget to caller's own id → succeeds | Retarget to a real, unrelated patient → `new row violates row-level security policy` (blocked). Each case run in its own isolated transaction after the `db query -f` combined-transaction lesson bit me once | Live staging, SET ROLE (disclosed) | **PASS** | `a6d35712` |
| S4a | Caregiver "end-only" UPDATE on `therapist_relationships` could also rewrite `therapist_id`/`relationship_type` in the same statement (`WITH CHECK (is_active=false)` says nothing about them) | Migration 058: column-level grants — `REVOKE UPDATE` then `GRANT UPDATE (is_active, updated_at)` only | `is_active`-only update still succeeds; the real `revoke_therapist_connection()` RPC (SECURITY DEFINER, unaffected by caller column grants) still succeeds and leaves `therapist_id`/`relationship_type` untouched | `therapist_id`+`relationship_type` mutation alongside `is_active=false` → `permission denied for table` (blocked) | Live staging, SET ROLE (disclosed) | **PASS** | `541d05af` |
| S4b | `revoke_therapist_connection` left `pending_therapist_connections.status` at `'accepted'` after revoking (stale history; traced — no live re-acceptance exploit found, see note) | Migration 059: also sets that row to `'revoked'` (already an allowed value, unused until now) | Full real 2-identity cycle: invite → accept → revoke, both tables confirmed consistent afterward | — (data-hygiene fix; see trace note in commit) | Live staging, SET ROLE (disclosed), 2 distinct identities | **PASS** | `76f99e78` |
| S4c | Therapist professional-eligibility gate (no credential verification exists for the residential invite/accept path) | Disclosure added to `CareTeamCommunicationAccess` and `ResidentialTherapistDashboard`: "does not independently verify a therapist's license or credentials" | — | — | Source change | **PARTIAL — disclosed, not gated.** Whether to build real credential verification or withhold messaging until one exists is flagged as an owner decision (§5, Q1), not decided unilaterally | `d9ca3008` |
| S5 | Activation-link consumption via the shared persistent Supabase client can substitute the signed-in caregiver's session before `App.tsx`'s own warning renders | **NOT IMPLEMENTED.** See §2a for the exact design needed | — | — | — | **BLOCKED — requires a larger, dedicated architecture change** (see §2a); not attempted as a rushed patch inside this round given the risk of introducing a NEW bug in a security-critical session path | — |
| S6a | `invite_org_member` read `licensed_seats`/count with no row lock — check-then-act race | Migration 057: `SELECT ... FOR UPDATE` on the license row | Invite under capacity (1/1 seat) succeeds | A second, distinct invite once at 1-of-1 capacity → `No licensed seats are available` (blocked) | Live staging, SET ROLE (disclosed) | **PASS** (fix); see S6b | `54dfb16e` |
| S6b | Genuine two-session concurrency proof for S6a | Attempted: session A holds the row lock via `BEGIN`+`pg_sleep(5)`, session B issues the real RPC | — | — | Two parallel real DB sessions | **INCONCLUSIVE, disclosed as such.** Tool-dispatch latency between the two parallel Bash invocations (session B's actual query landed ~10s after session A started, well past A's 5s hold) exceeded the intended overlap window — this does not confirm OR refute blocking. Not claimed as a concurrency proof. | `54dfb16e` |
| S7a | Caregiver medical-record completeness (medication logs, tasks, clinical notes) | Carried over from the prior remediation round (`CaregiverPatientView.tsx`); not re-touched this round except the TS1/TS2 nullable-field fix above | — | — | — | **PASS (carried over, re-confirmed via the TS fix's own test run)** | `c1ca96ac` |
| S7b | HELP status label semantics (`caregiver_notified` potentially misleading) | **Reviewed, not changed.** The actual user-facing copy in `PatientHome.tsx` already reads "...placed in your caregiver's message inbox as urgent. This is not a text or push alert — they will see it when they next check," which already satisfies "no false emergency-monitoring promise." Renaming the underlying enum value was judged unnecessary schema churn for a string never shown to any user. | — | — | Source review | **PASS (no change needed — already compliant)** | — |
| S7c | Real activation-email delivery evidence vs. `generateLink()` | Carried over from the prior round: a real `/auth/v1/recover` HTTP call, confirmed delivered via Mailinator's inbox API (not just the 200 response). **Not re-run this round.** | — | — | — | **Carried over from prior round, not re-executed this round** | (prior round) |
| S7d | Local Mailpit/Inbucket workflow | This repository has no `supabase/config.toml` and no local Supabase stack at all — confirmed again this round (`find` for the file). Documented honestly as not run; Mailpit requires `supabase init && supabase start`, which was not performed. | — | — | — | **NOT STARTED, honestly disclosed** | — |
| S7e | Authenticated `PatientIntakeForm.tsx` interaction-delay re-measurement | **BLOCKED** — requires a real authenticated patient session; the standing limitation (no passwords, identity creation blocked) applies. The prior round's real Playwright measurement against the **public** `/patient-intake` route remains the only actual browser-timing evidence obtained in this engagement. | — | — | — | **BLOCKED, carried-over evidence only** | (prior round) |

### 2a. S5 — exact design needed (not implemented)

The contract's own description is the correct target design; restating it
concretely so a future round can implement it directly:

1. A dedicated pre-auth route (e.g. `/activate`) that does **not** mount
   the app's main `supabase` client from `src/lib/supabase.ts` at all —
   that client has `detectSessionInUrl: true` on its persistent
   `sessionStorage`-backed session, which is exactly what consumes the
   recovery token into whichever session is currently active.
2. On that route, construct a **separate, short-lived** Supabase client
   instance (`createClient(url, anonKey, { auth: { persistSession: false,
   detectSessionInUrl: true } })`) scoped to that page load only, so
   token verification happens in isolation from the caregiver's own
   stored session.
3. After verifying the recovery token against that isolated client,
   independently confirm the resulting identity (email) matches the
   patient the caregiver intended to activate — never silently accept
   "whichever account the token resolved to."
4. Only after that confirmation does the real password-set flow run,
   against the isolated client's session — never against
   `src/lib/supabase.ts`'s shared instance.
5. After activation, redirect to the ordinary login page rather than
   auto-signing-in through the shared client, so the newly-activated
   patient goes through their own normal sign-in rather than inheriting
   anything from the isolated activation session.
6. The existing `App.tsx` `PASSWORD_RECOVERY`/`pendingIdentitySwitch`
   interstitial (added last round) becomes unnecessary once the shared
   client never sees the recovery token in the first place — it can stay
   as defense-in-depth but is not the actual fix.

This was not attempted inside this round because it changes the
application's core session-bootstrapping path — exactly the kind of
change the contract itself asks to be isolated in its own worktree/branch
rather than rushed into the passing remediation branch. **Recommend this
become its own dedicated round**, not a late addition to this one.

## 3. ACL evidence, before and after (S0)

**Before** (confirmed live before the fix, same session this round):
`get_patient_help_activation_history(uuid)` and
`get_patient_care_team_connections(uuid)` both had
`has_function_privilege('anon', ..., 'EXECUTE') = true`.

**After:**
```
anon_can_execute: false, authenticated_can_execute: true   -- both functions
```

**Real unauthenticated HTTP evidence** (anon key, no bearer token, against
`https://axurszlibxwwptkczztt.supabase.co/rest/v1/rpc/...`):
```
{"code":"42501","details":null,"hint":null,"message":"permission denied for function get_patient_help_activation_history"}  HTTP 401
{"code":"42501","details":null,"hint":null,"message":"permission denied for function get_patient_care_team_connections"}    HTTP 401
```
No patient data in either response body.

## 4. Registration provenance / protected-account-deletion — current state

- **Deletion is identified exclusively by `provisioned_auth_user_id`**
  (migration 049, unchanged this round) — never by email/name/status.
- **Claim now requires exact provenance match** (migration 054, this
  round): `p_patient_id` must equal the registration's own
  `provisioned_auth_user_id`; a registration lacking provenance is
  quarantined, not trusted.
- **A used/activated account structurally cannot enter the deletion
  path**: `caregiver_begin_registration_deletion` rejects any
  registration where `consumed_at IS NOT NULL`, and `consumed_at` is set
  by nothing except `caregiver_claim_new_patient` — which itself requires
  a real `patients` row and `caregiver_patients` link to exist. There is
  no path to generate or send an activation link for a patient before
  claim succeeds (`regenerate-activation-link` itself requires an
  existing `caregiver_patients` row). Traced, not newly re-tested this
  round (the underlying mechanism is unchanged from the prior round).
- **Fencing**: `deletion_operation_id` (migration 055, this round) binds
  `finish`/`cancel` to the exact `begin` operation that acquired the lock;
  a mismatched or absent id is rejected. Verified live, both directions,
  on two disposable fixtures.
- **NULL/mismatch proofs** (this round, live): NULL claim token blocked;
  correct token + wrong patient id blocked; no-provenance registration
  quarantined; wrong fencing operation id blocked on both `finish` and
  `cancel`.
- **Concurrency**: the row-level `FOR UPDATE` lock inside
  `caregiver_begin_registration_deletion` (prior round) serializes
  concurrent `begin` attempts on the same registration by construction —
  not independently re-proven this round with two live sessions (see
  §2's S6b honesty note for why a second concurrency-proof attempt this
  round was judged not worth repeating given the tool-dispatch-latency
  result already obtained).

## 5. Open questions for the owner

1. **Therapist credential verification (S4c):** this platform has no
   license/credential-verification system anywhere. The residential
   invite/accept therapist-messaging feature (built in the prior
   remediation round at the owner's own request) now **discloses** this
   honestly rather than fabricating verification, but messaging access is
   still granted on acceptance alone. Should residential therapist
   messaging/clinical-note access be **withheld** until a real
   verification system exists (a larger build, not in this round's
   scope), or is disclosure-only acceptable for now? This is a product
   decision, not purely a security one — flagging rather than decided
   unilaterally.
2. **S5 activation isolation:** recommend this become its own dedicated
   round rather than a rushed addition here, given it touches the core
   session-bootstrapping path. Confirm before scheduling it.
3. **Hosted-staging SMTP / local Mailpit:** no new authorized test inbox
   or local-dev-stack initialization was requested this round beyond what
   the prior round already established. If a fresh, independent delivery
   proof is wanted for this specific closure, say so and it can be run
   again (the prior round's own Mailinator receipt remains the only
   actual evidence on file).

## 6. Test-suite results (every gate, every push, this round)

`npx tsc --noEmit -p tsconfig.app.json`, `npx tsc --noEmit -p
tsconfig.node.json`, `npm run lint`, `npm run test:unit` (283/283 passed
throughout — 1 pre-existing test updated for an intentional return-shape
change from the prior round, not this one), and `npm run build` were run
before every commit in this round and were green every time, with the
sole, disclosed, narrow exception explicitly carved out by the contract
itself: the P0 migration (`e849727b`) was pushed before its own two
pre-existing, unrelated TypeScript errors were fixed (`c1ca96ac`,
immediately after) — exactly the situation the contract's "Narrow P0
exception" describes.

## 7. What remains pushed vs. isolated/blocked

**Pushed and live on staging, this round:** S0 (P0), the TS1/TS2 fix, S1,
S2, S3, S4a, S4b, S4c (disclosure), S6a. All with live positive/negative
evidence as tabulated in §2.

**Not pushed, nothing to isolate** (no unsafe or half-finished code exists
on this branch): S5 is simply not started — there is no partial,
disabled, or feature-flagged activation-isolation code sitting on this
branch. S6b's concurrency proof attempt left no code change (it tested
the already-pushed S6a fix) and no artifact behind.

**No claim is made that any of this constitutes a complete answer to
every item in Codex's latest findings table** beyond what is explicitly
tracked in §2 — items not listed there were not investigated this round.
