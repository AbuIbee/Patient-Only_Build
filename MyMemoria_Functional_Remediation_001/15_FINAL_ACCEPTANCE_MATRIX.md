# MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — final acceptance matrix

Response to item 6 of "MYMEMORIA FINAL STAGING ACCEPTANCE CLOSURE."
Consolidates `12_STAGING_ACCEPTANCE_TEST_REPORT.md` (prior round, local
staging UI testing) with this round's work on the remaining items. Per
instruction, successful tests are not repeated below — each row cites
where its evidence lives rather than re-describing it.

**Update history (production SQL review cycle, same day):**
1. `MyMemoria_Production_Migration_Approval_Review_2026-10-17.md` — 13
   findings (P01-P13), **NOT APPROVED**. All addressed.
2. A second independent review — 5 release blockers (B1-B5), **NOT
   APPROVED**. All addressed; two (B1, B4) were genuinely serious errors in
   the prior correction round's own work, caught and fixed.
3. "MYMEMORIA FINAL RELEASE CLOSURE" — three final checks (admin-vs-
   caregiver intake linkage; Free Tier entitlement discrepancy; paid-to-
   free downgrade data access). Item 1 investigated and confirmed already
   correct (no change). Items 2 and 3 fixed, both verified by execution
   against synthetic data in the isolated dry-run, including each item's
   own specified negative case.
All three rounds are detailed in `16_PRODUCTION_MIGRATION_CORRECTIONS_
RESPONSE.md`. Row 21 below reflects the cumulative state; no other row
changes — none of this involved running the live application or its RLS
against a real database.

## Acceptance matrix

| # | Area | Status | Evidence |
|---|---|---|---|
| 1 | Registration / email confirm / login | **PASS** | `12_STAGING_ACCEPTANCE_TEST_REPORT.md` §2 |
| 2 | Onboarding (mandatory patient intake) | **PASS** | `12_...` §2 |
| 3 | Session restore (same-tab) + non-sharing (cross-tab) | **PASS** | `12_...` §2 |
| 4 | Medications CRUD | **PASS** | `12_...` §2 |
| 5 | Reminders — free-tier gating | **PASS** | `12_...` §2 |
| 6 | Reminders — paid-tier CRUD | **NOT TESTED** | Gated behind paid_tier; not exercised (no live billing) |
| 7 | Patient documents upload + signed URL | **PASS** | `12_...` §2 |
| 8 | Media upload + signed URL + readback | **PASS** | `12_...` §2 |
| 9 | Subscriptions — free-tier auto-provisioning | **PASS** | `12_...` §2 |
| 10 | Subscriptions — plan-change UI (no Stripe calls) | **PASS** | `12_...` §2 |
| 11 | Single-account RLS isolation probe (unrelated synthetic id) | **PASS** | `12_...` §3 — superseded in rigor by #12 below once #12 runs |
| 12 | **True two-account patient isolation** | **NOT TESTED — blocked** | `13_STAGING_PROVISIONING_AND_AUTHORIZATION_TEST_PROCEDURE.md` §3; script ready (`ISO-1a..ISO-3` in `run_authorization_tests.cjs`), needs service-role credentials to provision the second confirmed account |
| 13 | **Authorized caregiver relationships (positive + negative)** | **NOT TESTED — blocked** | Same blocker. Script ready, executes migration 014's own T2b/T3/T4/T5/T6/T6b/T7/T8 cases (`CG-*` in `run_authorization_tests.cjs`) |
| 14 | **Administrator access (positive + negative)** | **NOT TESTED — blocked** | Same blocker. Script ready, executes migration 020's own T1/T2/T3/T4/T7 cases plus `admin_set_role` (022) (`ADM-*`/`ROLE-*` in `run_authorization_tests.cjs`) |
| 15 | **Paid-feature entitlement boundary via trusted synthetic grant** | **NOT TESTED — blocked** | Same blocker. Script ready (`ENT-*` in `run_authorization_tests.cjs`) — grants `paid_tier`/`daily_care` through `admin_set_subscription` only; no Stripe object touched anywhere in the script |
| 16 | Stripe Daily Care / Full Support separate checkout | **Release limitation, confirmed** | `12_...` §2 — unchanged this round |
| 17 | Cleanup of previous round's synthetic data (Patient A) | **DONE** | Per this round's instruction: "ChatGPT independently removed the remaining synthetic test account and verified zero staging users, profiles, patients, subscriptions, intake records, documents, media, and stored files." Not independently re-verified by this session (no staging DB read access) — passed through as reported |
| 18 | Cleanup of this round's synthetic data (5 new accounts) | **NOT STARTED — blocked** | Cannot provision them without the same credential, so nothing yet exists for this session to clean up. `cleanup_synthetic_accounts.cjs` is written and ready; it independently re-queries all affected tables and refuses to report success unless every one verifies at zero |
| 19 | Quality gates (tsc ×2, lint, unit tests, build) | **PASS** | `12_...` §2 — unchanged this round, no `src/` edits made |
| 20 | Vercel SSO-protected preview | **NOT TESTED** | Explicit instruction: left marked NOT TESTED until access is available |
| 21 | Production-safe forward-only SQL package | **v5 — THREE REVIEW CYCLES CORRECTED + DRY-RUN VERIFIED, STILL NOT APPROVED** | `14_PRODUCTION_MIGRATION_PACKAGE.sql` (v5) + `14a_...`/`14b_...`/`14c_...`; 13 findings (P01-P13) + 5 blockers (B1-B5) + 3 final-closure items all addressed per `16_PRODUCTION_MIGRATION_CORRECTIONS_RESPONSE.md`; every fix executed and verified (positive and negative cases) against an isolated, disposable local Postgres 17 container (zero Supabase connection, zero real data), including the Free Tier entitlement fix confirmed to leave existing row data byte-for-byte untouched; not yet run against the real staging or production project |

## Why #12-15 and #18 are genuinely blocked, not skipped

This session has the staging **anon** key only. Provisioning confirmed
accounts without the email rate limit, promoting the first admin, and
deleting `auth.users` rows all specifically require the **service_role**
key, which is not present anywhere in this working directory (re-confirmed
this round) and cannot be substituted by anything this session already has
— the Supabase MCP connector available here still only reaches `Paid2You`
(re-checked this round via `list_projects`), which must not be touched
regardless. Full reasoning and the two ways to unblock it are in
`13_STAGING_PROVISIONING_AND_AUTHORIZATION_TEST_PROCEDURE.md` §3.

What **is** true, and is the actual deliverable for items 1-3 of this
round's request: the procedure, the provisioning script, the test script
(executing the project's own already-designed, already-approved T-test
matrices from migrations 014/020/022 — not newly invented test cases), and
the cleanup script are all written, syntax-checked, and ready to run
end-to-end the moment either a service-role key is provided to this
session or a party with staging service-role access runs the provisioning
step and hands back the resulting credentials.

## Production migration package (item 5)

`14_PRODUCTION_MIGRATION_PACKAGE.sql` was independently reviewed against
the live production catalog (`ktehhvmmwnsbcvpjcmzt`) and returned **NOT
APPROVED** with 13 findings — real, grounded defects this engagement had
not caught on its own: missing schema dependencies (subscriptions.plan/
program, promo_codes, reminders, therapist_relationships, a storage
bucket), a table-level GRANT regression that would have broken patient
self-registration, a self-referential RLS policy on `profiles` that risks
"infinite recursion detected," a NOT NULL violation in the patient-creation
RPC, a subscription-expiration bug, a silently-continued constraint
failure, an unnecessary DROP VIEW, an incomplete caregiver/media policy
reconciliation, incomplete grant verification, an unnecessary dynamic
function-drop, a non-atomic/non-transactional migration with no rollback
plan, and a promo-expiry date bug. All 13 are addressed — fixed where a
safe, grounded fix exists; explicitly flagged (not guessed) where it
doesn't — in `16_PRODUCTION_MIGRATION_CORRECTIONS_RESPONSE.md`, with the
migration now split into `14_...` (the transactional migration itself,
wrapped in a single `BEGIN`/`COMMIT`, fail-closed throughout),
`14a_PRODUCTION_PREFLIGHT_CHECKS.sql`, `14b_PRODUCTION_POSTFLIGHT_
VERIFICATION.sql`, and `14c_PRODUCTION_ROLLBACK_AND_DEPLOYMENT_NOTES.md`.

One piece remains an explicit, labeled placeholder rather than a guess:
the caregiver-scope read/write widening for `care_partner_checkins`/
`media_uploads` needs production's real, exact policy catalog, which the
review confirmed was retrieved during its own process but was not included
in the text handed to this session — fabricating it was refused. **No
staging dry-run of the corrected file has been performed** (this session
still has no service-role credential — same blocker as items 12-15/18
above). **Production release remains NOT YET AUTHORIZED.**

## Stop point

No production SQL was executed, no GitHub merge was made, no production
deploy occurred, `Paid2You` was not accessed, and no Stripe
object/checkout/payment was created anywhere in this round's scripts (the
entitlement test, once run, uses only `admin_set_subscription` — the
same trusted, non-Stripe RPC the codebase already uses for promo/temp/
companion grants). No new administrator was or will be created through
public signup — the written procedure creates it exclusively through
direct service-role administration, matching this codebase's own
documented bootstrap path. This round stops at the same production
release approval boundary as every prior round, with items 2-4 and part
of item 6 genuinely incomplete pending the credential described above —
reported as such rather than inferred or assumed passing.
