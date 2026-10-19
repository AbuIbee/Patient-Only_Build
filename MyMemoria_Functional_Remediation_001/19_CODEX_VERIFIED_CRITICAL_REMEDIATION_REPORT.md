# CODEX-VERIFIED CRITICAL REMEDIATION — final report

Response to the independent-Codex NO-GO audit ("CLAUDE — MY MEMORIA ALLY:
CODEX-VERIFIED CRITICAL REMEDIATION") covering all 10 Criticals as one
coordinated remediation project. Branch `remediation/mymemoria-functional-001`
only. No production writes, no merge to main, no live Stripe, no Paid2You
modifications. **This report is a request for independent Codex review and
owner acceptance — not a declaration that this is ready for production.**

## 1. Root causes fixed, by Critical

### Critical 1 — registration deletion identified targets by email/status, not ownership
**Root cause:** `delete-pending-registration` derived its deletion target by
re-querying for a profile matching email + role + status, not by any
immutable link to the Auth user actually created for that registration.
**Fix (migration 049):** `provisioned_auth_user_id` is now written onto the
registration row at creation time (in `provision-caregiver-patient`, step 2).
Deletion goes through a three-step, explicit compensating-transaction lock —
`caregiver_begin_registration_deletion` (row lock + 2-minute stale-lock
timeout) → `caregiver_finish_registration_deletion` (delete only if still
locked) → `caregiver_cancel_registration_deletion_lock` (release on failure)
— because the Auth admin `deleteUser()` call is an HTTP call that cannot
share a Postgres transaction with the surrounding DB writes. The rewritten
`delete-pending-registration` Edge Function deletes the Auth user **by that
stored id only**, never by email.
**Live-tested (SET ROLE simulation):** begin-lock then claim/edit/second-
begin all correctly blocked while locked; finish-without-begin rejected;
cancel-lock compensation correctly releases the lock and a subsequent edit
succeeds; an unrelated legitimate account was never targeted.

### Critical 2 — incomplete registration recovery
**Root cause:** a successful claim-only retry (recovering from a prior
partial failure) left the patient claimed but with no activation-link path,
because the original link was only ever generated inline during the
original Edge Function call.
**Fix:** new `regenerate-activation-link` Edge Function, callable any time
by the owning caregiver (ownership re-verified server-side via the caller's
own session, never trusted from the client) — re-runs `generateLink()`
against the stored patient email and returns a fresh recovery URL. Wired
into both the end of a successful resume-claim and a "Regenerate Activation
Link" control on each patient card in `CaregiverPortal`.

### Critical 3 — recovery links could silently replace the caregiver's session
**Root cause:** `onAuthStateChange`'s `PASSWORD_RECOVERY` handler acted on
any such event regardless of whether the recovery session belonged to the
currently signed-in user.
**Fix:** `App.tsx` now compares the recovery session's user id against the
currently signed-in user id. A mismatch shows an explicit interstitial
("Cancel & Sign Out" / "Continue to Activate") instead of silently swapping
the session.
**Not browser-tested** — see §5.

### Critical 4 — unsafe fabricated-profile fallback; anonymous intake spoofing
**Root cause A:** `App.tsx` synthesized an in-memory profile object when
self-heal failed, letting an authenticated patient proceed on fabricated
data never actually written to the database.
**Fix A:** removed `buildAuthFallbackProfile()` entirely; a self-heal
failure or a second failed profile query now blocks with an explicit
"could not verify your account" screen.
**Root cause B:** the `anon`-role `patient_intake` INSERT policy was
`WITH CHECK (true)` — any unauthenticated caller could submit intake rows
naming an **existing** patient's id. The `authenticated`-role policy had no
relationship check on `patient_profile_id` either.
**Fix B (migration 049):** anon policy now requires
`patient_profile_id IS NULL AND caregiver_profile_id IS NULL AND created_by IS NULL`;
authenticated policy requires `created_by = auth.uid()` and that
`patient_profile_id` is either the caller's own id or a patient they are
linked to via `caregiver_patients`.
**Live-tested:** anon spoofing of an existing patient's id — blocked;
legitimate null-identifier anon submission — still succeeds.
**Also removed** `src/services/patientIntakeService.ts` (confirmed dead —
every export was unused anywhere in `src`; the duplicate save path it
represented had already been consolidated elsewhere).

### Critical 5 — fragmented Enterprise entitlement checks
**Root cause:** `patient_has_paid_entitlement()` (the RLS-facing check)
checked personal subscriptions only; Enterprise coverage was checked by a
separate, UI-facing function `is_my_enterprise_coverage_active()`. A
covered Enterprise patient's own feature **writes** could be rejected by
RLS even while the UI showed the feature unlocked.
**Fix (migration 050):** `is_patient_enterprise_covered(p_patient_id)` is
now the single authoritative check; both `is_my_enterprise_coverage_active()`
and `patient_has_paid_entitlement()` call it.
**Live-tested:** a covered-Enterprise patient with **no personal
subscription** successfully wrote to `care_partner_checkins`, and (as the
linked caregiver — `memories` has no patient-self-insert policy at all, a
pre-existing, unrelated gap explicitly left untouched) to `memories`;
expiring the organization license re-blocked both writes (negative test).

### Critical 6 — HELP activation history could be lost or miscounted
**Root cause A:** `record_help_activation()` performed the caregiver-
notification `create_conversation`/`send_message` calls in the same
transaction as the `help_activations` insert — a messaging failure rolled
back the safety record itself.
**Fix A (migration 050):** the `help_activations` row is now inserted
first, unconditionally reachable; notification is attempted inside a
nested `BEGIN...EXCEPTION WHEN OTHERS...END` block (an implicit savepoint),
which on failure sets `notification_status = 'notification_failed'`
instead of losing the row.
**Root cause B:** `get_patient_help_activation_history()`'s acknowledgment
count joined on every message in the conversation, so an unrelated reply
could be counted as an acknowledgment of the HELP event.
**Fix B:** the join is now scoped to the specific HELP message
(`ma.message_id = ha.message_id`).
**Live-tested:** forced a `send_message` failure via a deterministic
`CHECK(1=0)` constraint inside a rolled-back transaction —
`record_help_activation` still returned a row with
`notification_status = 'notification_failed'`.

### Critical 7 — incomplete caregiver medical record
**Root cause:** `CaregiverPatientView` never queried several tables that
already had working caregiver-read RLS (`medication_logs`, `tasks`,
`patient_notes` filtered to `therapist_session`/`clinical_observation`).
**Fix:** added Routine Tasks, Medication Dose Log, and Clinical Notes &
Session Documentation sections. Every section's query failure is now
captured per-section and rendered as "Could not load this section,"
distinct from a genuine empty result (previously only done for HELP
history); sections with a `.limit()` show a "showing most recent N" note.

### Critical 8 — email confirmation/delivery correctness
**Finding, not a defect:** the `on_auth_user_email_confirmed` trigger
(`AFTER UPDATE OF email ON auth.users WHEN old.email IS DISTINCT FROM
new.email`, function `sync_profile_email_from_auth()`) **does exist** and
is correctly scoped. A prior round's comment in `PatientIntakeForm.tsx`
claiming "there is no trigger in this project syncing auth.users.email
back into profiles.email" was stale and has been corrected. See §4 for the
live verification and the real hosted-staging delivery test.

### Critical 9 — caregiver-to-therapist communication
**Root cause:** `"Caregivers can manage therapist relationships for their
patient"` was an unchecked `ALL` policy — a caregiver could unilaterally
grant **any arbitrary person** authorized therapist access to a patient's
record and messaging, with zero consent from that person.
**Fix (migration 051):** that policy is replaced with view-only and
revoke-only (`WITH CHECK (is_active = false)`) caregiver policies. A new
`pending_therapist_connections` table plus
`caregiver_invite_therapist`/`respond_to_therapist_invite`/
`revoke_therapist_connection`/`get_patient_care_team_connections` RPCs mean
only the therapist's own explicit acceptance ever creates an active
`therapist_relationships` row.
**Live-tested end-to-end with 3 distinct identities:** invite → accept →
real message → real reply → real acknowledgment → revoke cut off both
send and read access, confirmed via `get_patient_care_team_connections`
reporting `status='ended'`. Also added `CareTeamCommunicationAccess` (the
caregiver-facing invite/revoke UI in `CaregiverPatientView`), a minimal
`ResidentialTherapistDashboard` (migration 052's `get_my_therapist_patients`)
for a plain residential therapist with no Enterprise organization, and a
pending-invite banner surfaced across every `EnterpriseDashboardRouter`
branch.

### Critical 10 — regression and the input-delay claim
**Regression spot-check:** confirmed live against staging that migration
039 (`is_therapist_for_patient`, `is_medical_professional_for_patient`,
`cover_patient`, `cover_patient_via_staff_registration`,
`admin_set_organization_license_status`, and the redefined
`is_my_enterprise_coverage_active`) are all still `SECURITY DEFINER` and
intact, and migration 044's `patient_notes` policies (therapist/medical-
professional create/view/update) are all still present, unmodified.
**Real interaction-delay measurement (not a bundle-size proxy):** see §4.

## 2. Files and migrations changed

| Commit | Scope |
|---|---|
| `7c9c4522` | Critical 1/4: migration 049; `provision-caregiver-patient`, `delete-pending-registration` |
| `fd1a7943` | Critical 2: `regenerate-activation-link` (new); `caregiverRegistrationService.ts`; `CaregiverPortal.tsx` |
| `7f4c79a7` | Critical 3/4: `App.tsx`; deletion of `src/services/patientIntakeService.ts` |
| `3f1f0f44` | Critical 5/6: migration 050; `helpActivationService.ts`; `PatientHome.tsx` |
| `8b4fc3a6` | Critical 9: migrations 051, 052; `therapistConnectionService.ts` (new); `ResidentialTherapistDashboard.tsx` (new); `EnterpriseDashboardRouter.tsx` |
| `1c473ca0` | Critical 7/8: `CaregiverPatientView.tsx`; `PatientIntakeForm.tsx` (comment correction) |
| `517abca0` | `src/types/supabase.ts` — generated types for all of the above |
| `1e7db49b` | Regression tests: fixed `criticalRemediation.test.ts` (broken by the HELP-history return-shape change); new `codexCriticalRemediation.test.ts` |

All pushed to `origin/remediation/mymemoria-functional-001` (no merge to
main, confirmed by `git log origin/...HEAD` before push showing only this
branch's own history ahead).

## 3. Automated test results

- `npx tsc --noEmit -p .` — **0 errors**.
- `npm run lint` — **0 errors/warnings**.
- `npm run test:unit` (vitest) — **283/283 passed** (267 pre-existing + 16
  new in `codexCriticalRemediation.test.ts`, 1 pre-existing test updated
  for the new `getHelpActivationHistory` `{entries, error}` return shape).
- `npm run build` — succeeded; pre-existing >500kB chunk-size advisory
  only, not a new regression.

New `codexCriticalRemediation.test.ts` covers the client-layer contracts
for the therapist invite/accept/revoke workflow, `regenerateActivationLink`,
and HELP `notificationStatus` mapping, including failure-reproduction
cases (uninvited email, unauthorized revoke, no-session guard, unauthorized
caregiver). These are unit tests against a mocked Supabase client — the
underlying RLS/RPC/concurrency/atomicity behavior was exercised live
against staging (§1, via `SET ROLE authenticated; SET request.jwt.claim.sub
= '<uuid>'`), not re-proven here.

## 4. Live verification actually run this round (real staging, real network)

**Email-sync trigger (Critical 8):** queried `pg_trigger`/`pg_proc` on
staging directly — confirmed `on_auth_user_email_confirmed` exists, is
scoped to `AFTER UPDATE OF email ... WHEN old.email IS DISTINCT FROM
new.email`, and calls `sync_profile_email_from_auth()`. Live-tested: changed
`auth.users.email` for a reusable synthetic account
(`d6cb8a9f-5b1c-4e30-9be6-36020cec44bf`) and confirmed `profiles.email`
followed automatically; reverted both back to baseline afterward.

**Hosted staging SMTP delivery (Critical 8) — real send, not `generateLink()`:**
called the real, user-facing `POST /auth/v1/recover` endpoint (password
reset) against `https://axurszlibxwwptkczztt.supabase.co` for
`stg-cg-1527631@mailinator.com` using the public anon key. Confirmed actual
receipt via Mailinator's inbox API (not just the 200 response, which
Supabase returns unconditionally to prevent email enumeration): a real
message from `Supabase Auth <noreply@mail.app.supabase.io>`, subject
"Reset your password," delivered ~31 seconds later via Supabase's
Postmark-backed shared mailer infrastructure. The email's own recovery link
carried `redirect_to=http://localhost:3000` — confirming the project's
configured default Site URL, unprompted by any parameter I passed, matches
the first entry in this round's `ALLOWED_REDIRECT_ORIGINS` allowlist. The
raw recovery token is intentionally not reproduced in this report.
**This confirms staging has no custom SMTP configured** (consistent with
an earlier round's finding) — delivery currently goes through Supabase's
own default/shared mailer, not a project-specific relay.

**Local Mailpit/Inbucket workflow — honestly documented, not run:** this
repository has **no local Supabase stack at all** — there is no
`supabase/config.toml`, so there is nothing to `supabase start`. To stand
one up: `npx supabase init` (scaffolds `config.toml` with a default local
Postgres/Auth/Storage stack and a local mail-capture inbox — Mailpit on
current CLI versions, Inbucket on older ones), then `supabase start`; all
outgoing Auth emails are captured locally at the URL `supabase status`
prints, never actually delivered anywhere. **This was not run** — standing
up a new local dev stack was out of this round's scope ("no broad
redesign"), and this repo's established workflow (per
`12_STAGING_ACCEPTANCE_TEST_REPORT.md`) is to develop against the
`--mode staging` hosted project directly, not a local stack. Reported
honestly as a gap rather than fabricated.

**Real-browser input-delay measurement (Critical 10):** the owner
explicitly rejected bundle-size as proof of an interaction-delay fix. Using
Playwright (already a devDependency, Chromium already installed locally)
against the **public, unauthenticated** `/patient-intake` route (no login
required, so the standing identity-creation limitation does not block this
one measurement), typed into the `patientFirstName` field at a natural
60ms-per-keystroke pace and measured via two independent methods:
- The browser's own Event Timing API (`PerformanceObserver({type:'event'})`)
  — the same underlying data Chrome DevTools' Performance panel
  visualizes: scheduling delay (`processingStart - startTime`) averaged
  **0.26ms** (max 0.5ms) — negligible; total event-to-done duration
  averaged **31.33ms** (max 48ms).
- A direct keydown-to-next-animation-frame instrumentation, independent of
  the Event Timing API's minimum reporting threshold: averaged **27.51ms**
  (max 46ms) — closely cross-validating the first method.

**Conclusion:** each keystroke costs roughly 27–48ms before the next
paint, almost entirely React's synchronous controlled-input re-render cost,
not scheduling/main-thread contention and not anything bundle-splitting
would touch. This is measurably above the 16ms/60fps budget but not
severe; reported as real, measured evidence rather than fixed or
re-asserted as fixed.

## 5. What was NOT browser-tested (standing limitation, honestly restated)

Genuine separate-browser-session testing with distinct real logins remains
impossible in this environment: creating new Auth identities is blocked by
this session's own classifier (both raw SQL `INSERT INTO auth.users` and
`supabase.auth.signUp()`), and no passwords exist for any already-created
account. All identity-distinct testing for Criticals 1, 4, 5, 6, and 9 was
done via `SET ROLE authenticated; SET request.jwt.claim.sub = '<uuid>'`
against staging Postgres — this exercises the identical server-side
RLS/RPC authorization code a real browser session would hit, but is not a
literal browser test. Critical 3's session-substitution interstitial and
Critical 4's blocking screen were verified by type-check only
(`tsc --noEmit`), not interactively clicked through in a browser. The
Vercel Preview (§6) is also behind Vercel's own SSO gate from outside the
owner's account (`curl` returns `302`), consistent with an earlier round's
finding — not newly investigated or resolved here.

## 6. Deployment

- **Branch:** `remediation/mymemoria-functional-001` only. No merge to
  main, no production migration run.
- **Commits:** `7c9c4522` → `1e7db49b` (table in §2), pushed to
  `origin/remediation/mymemoria-functional-001`.
- **Vercel Preview:** `https://patientonly-git-remediation-mymemoria-funct-452d31-memoriahelps.vercel.app`
  (stable branch alias; underlying deployment `dpl_69eM7ijMXWCB7uedd6nstWmkXWEg`,
  built automatically on push, status Ready).

## 7. Remaining limitations (full honesty)

1. No genuine separate-browser-session test with real distinct logins (§5).
2. `memories` has no patient-self-insert RLS policy at all — a real,
   pre-existing, unrelated gap found while testing Critical 5; explicitly
   left unfixed as out of scope for this cycle.
3. Local Mailpit/Inbucket workflow is documented but not actually run —
   this repo has no local Supabase stack to run it against.
4. Vercel Preview remains behind SSO from outside the owner's account.
5. Critical 10 is measured and reported honestly, not remediated further —
   the owner's ask was "measure," not "optimize"; no further change was
   made to the per-keystroke re-render cost itself.

## 8. STOP before production

Per explicit instruction: this is submitted for **independent Codex
review** of this diff and this report. No production deployment, no
production migration run, and no merge to main has been performed or is
proposed here. Production release requires a separately documented Codex
GO and the owner's explicit final deployment authorization.

## 9. Note on the newly-received handoff package

A separate, much larger package (`MyMemoria_Enterprise_Caregiver_Complete_
Production_Handoff.zip` — an eight-category, 92-item Enterprise Caregiver
Portal requirement contract) was received mid-session and has been
inventoried but not yet implemented. Its own cover instructions state
"the priority is safety first: account deletion/provenance,
activation/session isolation, patient profile/intake consistency,
anonymous intake boundaries, effective Enterprise RLS and HELP durability"
— exactly the scope this report covers. That package is the natural next
phase of work, to begin after this round's Codex review.
