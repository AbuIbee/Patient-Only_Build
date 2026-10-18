# MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — staging provisioning + authorization test procedure

Response to item 1 of "MYMEMORIA FINAL STAGING ACCEPTANCE CLOSURE": a
staging-only procedure for provisioning confirmed synthetic Patient,
Caregiver, and Administrator accounts without hitting Supabase's
email-send rate limit, plus the actual authorization tests (item 2) and
entitlement-boundary tests (item 3) those accounts exist to run.

**Status: procedure and all three scripts are written and ready to run.
Execution is blocked in this session — see §3.**

## 1. The procedure

Three scripts, in `scripts_staging/`, all syntax-checked
(`node --check`) and reusing only RPCs/policies that already exist and are
already live on staging (`create_patient_with_caregiver`, `admin_set_role`,
`admin_set_subscription`) — no new SQL, no schema change, nothing this
round adds to the migration chain.

1. **`provision_synthetic_accounts.cjs`** — creates five confirmed accounts
   directly via the Supabase **Auth Admin API** (`auth.admin.createUser`
   with `email_confirm: true`), which never sends an email at all. This is
   the actual fix for the rate limit that blocked the prior round: the
   public signup form always goes through GoTrue's shared, rate-limited
   default mail service regardless of who initiates it; the Admin API does
   not.
   - **Patient 1, Patient 2** — fully provisioned (own `patients` row + one
     medication row each, written directly via service role, not re-testing
     the already-PASS self-service UI path), for the two-account isolation
     test.
   - **Patient 3** — left in a genuine `provisioning_status='profile_created'`
     state with no `patients` row yet, matching exactly what
     `patientService.ts`'s real `createPatient()` leaves behind after its
     own step 2, for the admin-linking RPC test to act on.
   - **Caregiver** — role `caregiver`, deliberately left unlinked to any
     patient. Per `014`'s own documented architecture, there is no
     self-service mechanism for an ordinary caregiver to link to a patient
     today (`create_patient_with_caregiver()` requires admin/superadmin);
     this account's role in the suite is the negative permission tests that
     confirm that gate holds, not a positive "linked caregiver" case —
     the positive case (an admin becoming a patient's linked caregiver) is
     what the Administrator account exercises, exactly matching how this
     application's real admin-provisions-a-patient flow already works.
   - **Administrator** — created the same way as any other account (role
     `patient` from signup metadata, since `handle_new_user()` has no
     signup-time path to `role='admin'` at all — confirmed from
     `002`/`020`'s trigger body), then promoted with a **direct
     service-role `UPDATE profiles SET role='admin'`**. This is the exact
     bootstrap path `012`/`022` already document as the only way a first
     admin is ever created ("direct DB administration"), not a new
     mechanism — and it never touches the public signup form, satisfying
     "do not create an administrator through public signup" by construction.

2. **`run_authorization_tests.cjs`** — signs in as each of the five accounts
   with the **anon key only** (never service role) and runs the real
   authorization tests, grouped into four sections:
   - **Two-account isolation** (item 2): Patient 1 vs. Patient 2, both
     directions, including a write-path check (attempted cross-account
     `UPDATE`, not just `SELECT`).
   - **Caregiver relationship authorization**: executes migration `014`'s
     own pre-written T2b/T3/T4/T5/T6/T6b/T7/T8 test cases verbatim against
     live staging — unlinked-caregiver refusal, patient-role refusal,
     admin successfully linking a genuinely pending patient, idempotent
     retry, refusal to silently claim an already-complete patient or a
     nonexistent one, and the resulting positive/negative read-access
     boundary once the link exists.
   - **Administrator permissions**: executes migration `020`'s own
     pre-written T1/T2/T3/T4/T7 cases — admin sees all profiles, a non-admin
     sees only their own, admin can rename another user but still cannot
     touch their `role`/`email` columns, and no non-admin can `DELETE` a
     profile including their own. Also exercises `admin_set_role` (`022`)
     both positively (admin caller) and negatively (non-admin caller).
   - **Paid-feature entitlement boundary** (item 3): confirms a patient
     cannot self-grant an entitlement via `admin_set_subscription` or a
     direct `subscriptions` write (both already revoked, per `011`/`029`),
     then has the **admin** grant Patient 1 a trusted `paid_tier`/
     `daily_care` entitlement through `admin_set_subscription` — the one
     legitimate, non-Stripe path this codebase has for assigning paid
     entitlement — and verifies the account's own `subscriptions` row
     reflects it. **No Stripe object, checkout session, or webhook is
     created or touched anywhere in this script.**

   Writes a full PASS/FAIL result per test id to
   `authorization_test_results.json`.

3. **`cleanup_synthetic_accounts.cjs`** — deletes every dependent row
   (medications, documents, media, check-ins, `caregiver_patients`,
   `subscriptions`, `patients`) for all five ids, then deletes the five
   `auth.users` rows themselves via the Admin API (which only service role
   can do — this is exactly the step that was NOT achievable for the
   previous round's Patient A, left as a known gap in
   `12_STAGING_ACCEPTANCE_TEST_REPORT.md` §4). Re-queries all five tables
   afterward and **refuses to report success** (`process.exit(1)`) unless
   every one is independently confirmed at zero. Deletes its own
   `synthetic_accounts.json`/`authorization_test_results.json` on success.

## 2. Why service role, and why that's the correct scope for it

Every write these scripts make outside of normal RLS (creating a user
without an email round-trip, promoting the first admin, deleting an
`auth.users` row) is specifically a class of operation this application's
own RLS model was never designed to allow a client to do at all — by
design, not by gap. Service role is the only key capable of them, matches
exactly how `012`/`022` already describe the very first admin being
bootstrapped, and is used here **only** for account setup/teardown; every
actual *test* in `run_authorization_tests.cjs` runs under the ordinary
anon key, signed in as the account under test, so what's being measured is
real RLS/RPC enforcement, not service-role-privileged behavior.

## 3. Execution status: blocked in this session

This session has the staging **anon** key only
(`.env.staging.local`, `VITE_SUPABASE_ANON_KEY` — confirmed again this
round: only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are present, no
service-role key anywhere in the working directory). This session's
Supabase MCP connector was re-checked and still only has access to
`Paid2You` (`list_projects` returns exactly one project, id
`lmpicrmmixpvkwwhcxbh`) — no change from every prior round, and `Paid2You`
must not be touched regardless. The Auth Admin API
(`auth.admin.createUser`/`deleteUser`) and a direct service-role
`profiles` write both require the **service_role** key specifically — the
anon key is rejected by that endpoint by design, so there is no way to run
any of the three scripts above with what this session has access to.

This is the same category of blocker as the original anon-key access
gap from earlier in this engagement, one level up the credential chain —
not a new or different kind of problem, and not something to route around
with a workaround (e.g. embedding a service-role key in `.env.staging.local`,
which would expose it to the Vite dev server/browser bundle — never
appropriate for that key regardless of environment).

**To actually run items 2-4**, one of:
- **(a)** Provide a staging `SUPABASE_SERVICE_ROLE_KEY` the same way
  `.env.staging.local`'s anon key was provided this round (a separate,
  equally git-ignored local file/environment variable — never inside
  `.env.staging.local` itself, since that file is read by the Vite app and
  must stay anon-only), and this session runs all three scripts directly
  and reports real PASS/FAIL results plus cleanup confirmation.
- **(b)** Whoever already holds staging service-role access (ChatGPT,
  per this round's confirmed independent cleanup of the previous round's
  Patient A) runs `provision_synthetic_accounts.cjs` and hands back
  `synthetic_accounts.json`'s contents (or just the five email/password
  pairs); this session then runs `run_authorization_tests.cjs` against
  those real accounts with only the anon key (which it already has) and
  reports the actual results, with cleanup handled either by this session
  calling `cleanup_synthetic_accounts.cjs` with a provided service-role key
  or by the same party who provisioned them.

Until one of those happens, items 2 ("test actual two-account patient
isolation, authorized caregiver relationships, and administrator access")
and 3 ("verify the relevant paid-feature permission boundaries") remain
**NOT TESTED — blocked on service-role credentials**, not silently skipped
or inferred from the prior round's single-account probe. See
`15_FINAL_ACCEPTANCE_MATRIX.md` for how this is carried into the
consolidated matrix.
