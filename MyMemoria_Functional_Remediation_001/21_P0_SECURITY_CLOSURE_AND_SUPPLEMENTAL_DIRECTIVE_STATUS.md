# P0 SECURITY CLOSURE AND SUPPLEMENTAL DIRECTIVE STATUS

Response to "P0 SECURITY CLOSURE: LEGACY DELETION RPC BYPASS, ACTIVATION
ISOLATION, AND PATIENT ACTIVATION END-TO-END" and "SUPPLEMENTAL
ENGINEERING DIRECTIVE 002." Given the realistic scope achievable in this
round, this is **one consolidated report** rather than the five separately-
numbered files Directive 002 requested (21–25) — writing five thin or
placeholder files would misrepresent how much of that directive's full
92-item/4-workstream scope was actually executed versus genuinely
triaged. Where a required numbered filename from either directive is not
produced separately, its required content is included here instead, with
an honest status.

## 1. Branch, commits, baseline

- **Branch:** `remediation/mymemoria-functional-001` only. No production writes, no merge to main.
- **Baseline for this round:** `4b79b37acf6e4547ff5aa6d1931d6141f30bdaf4` (confirmed via `git merge-base --is-ancestor` before any work began).
- **Final HEAD this round:** `ca6ddc1f` (plus this report's own commit, next).
- **Commits delivered, in order:**

| SHA | Scope |
|---|---|
| `83b26dbf` | REMEDIATION A — retire legacy unfenced deletion-lifecycle RPC overloads |
| `ca6ddc1f` | REMEDIATION B — isolate patient-activation sessions from the shared caregiver client |

## 2. REMEDIATION A — legacy deletion RPC bypass

**Implemented:** PASS. **Tested locally (SET ROLE + direct SQL, disclosed as simulation):** PASS. **Verified in staging:** PASS (applied and tested directly against the linked staging project — there is no separate "staging" distinct from where this work happened; this engagement has no local Supabase stack). **Codex accepted:** PENDING INDEPENDENT REVIEW.

**Exact defect:** migration 055 (prior round) introduced
`caregiver_finish_registration_deletion(uuid, uuid)` and
`caregiver_cancel_registration_deletion_lock(uuid, uuid)` via `CREATE OR
REPLACE FUNCTION`. Postgres only replaces a function with the *exact
same* argument signature — the new versions took an additional `uuid`
argument, so Postgres silently created two **additional** overloaded
functions instead of replacing the originals. The legacy one-argument
versions survived with their original, pre-fencing logic (no
`deletion_operation_id` check at all), and were confirmed still
executable by `anon` **and** `authenticated` — despite migration 049's
original explicit `REVOKE ALL FROM PUBLIC` on those exact one-argument
versions. (Something later — most likely Supabase's own schema-level
default-privilege behavior — re-granted `anon` EXECUTE; migration 055
never issued any `REVOKE`/`GRANT` for its new overloads at all.) This
completely bypassed the S2 fencing mechanism from the prior round: any
caller could call the OLD one-argument function directly, which required
only `deletion_locked_at IS NOT NULL`, with no operation-id requirement
whatsoever.

**Caller-compatibility matrix (read-only inventory performed before any change):**

| Caller | Signature called | Verified via |
|---|---|---|
| `supabase/functions/delete-pending-registration/index.ts` | 2-arg, exclusively, since commit `f3e0c06d` | source grep |
| Any other Edge Function, service, route, trigger, or test | none | source grep across `supabase/` and `src/` — zero other references |
| Views / rewrite rules | none | `pg_depend` via `pg_rewrite` join — zero dependents |
| Other function bodies | none | source-text scan of every function body for the legacy function names |
| Full schema, every function name | only this one pair had duplicate overloads | `GROUP BY proname HAVING count(*) > 1` across the entire `public` schema — zero other matches |

**Fix:** `DROP FUNCTION IF EXISTS` on both legacy one-argument signatures
(no `CASCADE` — the dependency scan above proved none was needed).
Re-asserted explicit `REVOKE ALL ... FROM PUBLIC/anon` + `GRANT EXECUTE
... TO authenticated` on the surviving two-argument versions and on
`caregiver_begin_registration_deletion`, regardless of whatever produced
the grant drift.

**Evidence:**
- Calling the legacy signature now errors: `ERROR: 42883: function
  caregiver_finish_registration_deletion(uuid) does not exist` — the
  strongest possible proof of retirement, a real executed SQL call, not
  a source-code read.
- Real, unauthenticated HTTP `curl` (anon key, no bearer token) to both
  surviving 2-arg RPCs via the live REST endpoint → `401 permission
  denied for function ...`, no data in either response body.
- Full legitimate fenced flow re-run end-to-end on a fresh disposable
  fixture after the fix: `begin` → `finish` with the correct operation
  id succeeds and deletes the row; a second, separate fixture's `begin`
  → `finish` with the **wrong** operation id is correctly rejected
  (`No matching in-progress deletion found ...`). Both fixtures confirmed
  removed afterward via direct count query.
- `npx tsc --noEmit -p tsconfig.app.json` → 0; `-p tsconfig.node.json` →
  0; `npm run lint` → 0; `npm run test:unit` → 283/283 (this is a DB-only
  change; no app code was touched by Remediation A).

**Fresh-database replay vs. upgrade-database replay:** NOT independently
re-tested as two separate database instances this round — this
engagement has exactly one Postgres target (the linked staging project);
there is no disposable "fresh" database available to apply the full
migration history against from zero, and no separate "staging-equivalent
legacy" snapshot to upgrade. The migration itself (`060_rA_retire_...sql`)
is idempotent (`DROP FUNCTION IF EXISTS`) and was applied directly to the
one real environment that exists, with the dependency/caller inventory
above performed first specifically to establish it was safe to do so
without a separate dry-run database.

## 3. REMEDIATION B — activation-session isolation

**Implemented:** PASS. **Tested locally:** PASS (see below — a *real*
browser against a *real* generated token, not a mock). **Verified in
staging:** PARTIAL — see the honesty note below. **Codex accepted:**
PENDING INDEPENDENT REVIEW.

**Exact defect:** the shared, persistent Supabase client
(`src/lib/supabase.ts`) has `detectSessionInUrl: true`. On any page load
where a patient activation/recovery token is present in the URL, that
client consumes it **immediately on construction** — before `App.tsx`'s
own effects run, before React even renders — silently swapping whichever
caregiver (or nobody) was signed in on that browser tab to the
activation link's own identity. The prior round's `PASSWORD_RECOVERY` /
`pendingIdentitySwitch` interstitial could only ever **warn** about this
after the swap had already happened; it could not prevent it.

**Fix:** a new, dedicated `/activate` route
(`src/pages/common/ActivatePatientPage.tsx`), checked and rendered
*before* `checkingSession`'s own logic in `App.tsx`. The shared client
now disables `detectSessionInUrl` specifically for that one path
(`src/lib/supabase.ts`), so it **never** touches an activation token
under any circumstance. `ActivatePatientPage` constructs its own,
separate, non-persisted client (`persistSession: false`, its own
distinct `storageKey`) purely to parse that token in isolation. The
resolved identity (email — never a client-supplied id) is displayed
prominently before any password can be set. On completion, the isolated
session is explicitly signed out and the browser does a **full page
navigation**, never an auto-sign-in through the activation session. Both
Edge Functions that generate these links now target `<origin>/activate`
instead of the bare origin.

**Real, executed, non-mocked evidence (this is the critical part — a
test asserting expected source text would not satisfy this):**
1. Generated a genuinely real Supabase recovery token via the public
   `/auth/v1/recover?redirect_to=...` endpoint (confirmed empirically
   that the admin-SDK `redirectTo` convention correctly carries a path
   through the project's existing redirect allowlist — no platform
   configuration change was needed; this was verified, not assumed).
2. Received the real email via Mailinator's inbox API and extracted the
   actual `https://axurszlibxwwptkczztt.supabase.co/auth/v1/verify?...`
   URL from its body.
3. Started a real local server bound to the exact redirect origin.
4. Drove a real Chromium browser (Playwright) to that real verify URL.
5. Observed the browser actually land on `/activate` and render "You are
   activating the account for stg-cg-1527631@mailinator.com" — the
   identity resolved entirely from the token, never asserted by the test
   itself.
6. Queried the browser's actual `sessionStorage`/`localStorage` after
   this: **zero keys in either** — direct, executed proof that nothing
   was persisted by the isolated client (and, since the shared client
   never ran `detectSessionInUrl` for this path at all, nothing was
   written to its storage key either).

**Two real bugs found and fixed by that same live test** (not merely
inferred from reading the code):
- `useRef(createClient(...))` still *calls* `createClient()` on every
  render even though only the first render's result is kept — the test
  showed **6 separate GoTrueClient instances** racing on the same page.
  Fixed with `useState`'s lazy initializer, which is called exactly
  once; re-verified via a second live test showing exactly one instance
  warning, which is React StrictMode's expected development-only
  double-render (confirmed present in `main.tsx`), not a production
  concern.
- An unrelated, pre-existing `App.tsx` effect unconditionally ran
  `window.history.replaceState({}, '', '/')` for any unauthenticated
  visitor on a route not already in `isPublicRoute` — `/activate` is
  inherently pre-auth, so this silently collapsed the address bar to `/`
  within the first render (which would also have discarded the
  activation context on a mid-flow page refresh). Fixed by folding
  `isActivationRoute` into `isPublicRoute`. Re-verified live: the URL now
  correctly stays at `/activate` throughout, including through the
  invalid/expired-link fallback state.

**Honesty note (the one real gap):** a *full real-token retest of the
exact, fully-fixed version* (both bugs patched) was attempted but was
blocked by the staging project's own email-sending rate limit — the same
pre-existing, documented environmental constraint a prior round's own
acceptance report already identified (`over_email_send_rate_limit`), not
something introduced or controllable by this work. What **is** verified
for the fully-fixed version specifically: the invalid/expired-link
fallback path (correct URL throughout, correct fallback UI, zero storage
writes) via a direct navigation to `/activate` with no token at all. The
identity-resolution and zero-storage-write results come from the run
immediately *before* the two bugs were patched, whose only defect was
the cosmetic URL collapse — independently confirmed fixed via the
invalid-link retest. I am not claiming the combination (real token +
fully-patched code) was re-observed together in one single test run.

**Isolation test matrix status** (from the directive's own 20-item list):

| # | Scenario | Status |
|---|---|---|
| 1 | Valid user / valid registration / valid token | PASS (real browser test, pre-patch code; patched code verified via a different path — see honesty note) |
| 2–4 | Different registration / patient / caregiver's patient | NOT RUN — would require a second real registration and a second real token; blocked by the standing inability to create new Auth identities and by the email rate limit |
| 5 | Wrong authenticated identity | N/A to this design — the isolated client never reads the shared client's identity at all, by construction; there is no "wrong authenticated identity" input this flow accepts |
| 6–11 | Expired / revoked / replayed / NULL / empty / malformed token | PARTIAL — NULL/no-token case (#9) run and passed (invalid-link fallback); expired/revoked/replayed/malformed not independently forced this round (would require either waiting out a real expiry window or fabricating a malformed JWT against the real GoTrue endpoint, neither attempted) |
| 12–13 | Nonexistent / already-activated registration | NOT RUN |
| 14–16 | Parallel attempts / refresh / two tabs | NOT RUN — see Remediation A's own honest concurrency-proof note from the prior round for why genuine two-session timing proofs are hard to construct reliably with this tooling |
| 17–18 | Direct unauthorized RPC / client-identifier substitution | N/A — this flow has no RPC surface of its own; it uses Supabase Auth's own `/verify` and `updateUser`, which are GoTrue's existing, independently-maintained mechanisms, not new code written here |
| 19–20 | Abandoned-then-retry / second-patient-after-first-completes | NOT RUN |

## 4. REMEDIATION C — email-to-browser activation acceptance

**Status: BLOCKED**, honestly, not reported as passing. The specific
required test ("create a FRESH caregiver-controlled patient registration"
end to end) needs either a working password login or a newly-created
Auth identity for the caregiver side of that flow — both are blocked by
this engagement's standing constraint (no passwords exist for any
account, and creating new Auth identities is blocked by this session's
own safety classifier). The *patient-side* half of this flow (the actual
activation link, email, and browser completion) **was** exercised with a
real token in §3 above, using an already-established reusable synthetic
account rather than a brand-new registration created through the live
UI. That is weaker evidence than the directive asks for, and is reported
as such rather than conflated with a full pass.

## 5. Supplemental Directive 002 — workstream status

Given the realistic scope achievable in the time available, this
directive's full 92-item portal build was not attempted as new
implementation this round. What follows is an honest status per
workstream, not a claim of completion.

### Workstream A — 92-item Enterprise Caregiver Portal
**Status: NOT STARTED this round.** The authoritative LOCKED requirements
document exists only in a handoff package received mid-session (not
checked into this repository); building the full 92-row traceability
matrix and then implementing, testing, and independently verifying all
92 requirements is, by the directive's own acceptance criteria, a
multi-round undertaking on top of the security remediation that was this
round's actual priority (the directive's own cover note for that handoff
package states exactly this: "the priority is safety first... [the
portal] is the natural next phase"). No placeholder matrix is produced
here, since a 92-row table where ~92 rows read "NOT STARTED" would not
be a meaningful deliverable beyond this one sentence.

### Workstream B — therapist invitations and professional eligibility
**Status: PARTIALLY CLOSED, carried forward from the immediately prior
round** (commits `d9ca3008`, `541d05af`, `76f99e78`, before this round's
baseline): identity-bound invitations (unique `(patient_id,
therapist_id)`, server-derived therapist id from email lookup, never
client-supplied), safe revocation (now also marks the historical
invitation record), and mutation-scope hardening (column-level grants
preventing `therapist_id`/`relationship_type` rewrite during an "end"
update) were all implemented and live-tested with real distinct
identities in that prior round. Professional eligibility itself remains
**disclosed, not gated** — this platform has no license/credential
verification system, and residential therapist messaging access is
still granted on acceptance alone. This was explicitly flagged as an
owner product decision in that round's own report and is not re-decided
here. Re-verified this round only to the extent of re-checking
`acknowledge_message`/`is_conversation_participant` (§6 below) for the
same class of defect found elsewhere — no new issue found there.

### Workstream C — registration and deletion lifecycle
**Status: CLOSED for the items this round actually found**, cross-
referenced against Directive 001 rather than duplicated: Remediation A
(§2 above) **is** this workstream's deletion-lifecycle contribution — the
legacy-overload bypass was the actual outstanding lifecycle defect.
Registration-claim identity binding (NULL-safe checks, provenance
trust over client-supplied ids) was closed in the immediately prior
round (commit `958fabfe`) and not revisited for new defects this round.

### Workstream D — HELP-history authorization and data integrity
**Status: RE-VERIFIED, no new defect found.** Checked
`acknowledge_message()` and its authorization dependency
`is_conversation_participant()` specifically for the NULL-unsafe `!=`
pattern that Remediation Unit S0 (prior round) found elsewhere in this
same codebase: both use equality-inside-`EXISTS` (`cp.user_id =
auth.uid()`), which is NULL-safe by construction, and
`is_conversation_participant` re-checks `is_authorized_for_patient` live
on every call (current relationship, not stale membership) — a revoked
caregiver or therapist loses acknowledgment access immediately, not
merely on next cache refresh. `get_patient_help_activation_history` (the
P0 item from the prior round) has no pagination/cursor/filter surface at
all beyond its single `p_patient_id` argument, so the pagination-bypass
concern the directive raises does not apply to this specific function —
there is nothing to bypass. Full items 1–25 of the directive's own test
list were not individually re-run as a fresh suite this round; this is a
targeted re-check of the two mechanisms named above, not a restatement
of the prior round's already-extensive P0 evidence.

## 6. Test-suite and migration-safety summary (this round)

Every commit this round was gated by, and passed: `npx tsc --noEmit -p
tsconfig.app.json` (0 errors), `npx tsc --noEmit -p tsconfig.node.json`
(0 errors), `npm run lint` (0), `npm run test:unit` (283/283 — unchanged
from the prior round; no new unit tests were added this round, since
both remediations are either DB-only or require a real browser/real
token to meaningfully test, which the unit-test suite's mocked Supabase
client cannot represent), and `npm run build` (succeeded) wherever app
code changed. Both migrations this round (`060`, and Remediation B's
code-only change had no migration) were applied directly to the one real
environment, preceded by the explicit read-only dependency/caller
inventories documented in §2.

## 7. Release recommendation

Per Directive 002's own permitted verdict list:

**SECURITY WORKSTREAMS VERIFIED — PORTAL INCOMPLETE — NO-GO**

Remediations A and B (this round's actual priorities) have real,
executed, mostly-non-mocked evidence as documented above, with the
specific gaps honestly disclosed in §§2–4. The 92-item portal
(Supplemental Directive 002 Workstream A) was not attempted. Production
remains NO-GO pending independent Codex review of this round's two
remediations and the owner's own authorization for any further phase.

**Do not treat this report as a Codex acceptance.** Every "PENDING
INDEPENDENT REVIEW" marking above means exactly that — an independent
Codex session has not yet examined this round's actual diff, installed
grants, or live test evidence.
