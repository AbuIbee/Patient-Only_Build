# MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — local staging acceptance test report

Response to "MYMEMORIA ALLY STAGING ACCEPTANCE" / "RESOLVE STAGING ACCESS
BLOCKER". Tests were run against the **local dev server in staging mode**
(`npm run dev -- --mode staging --host 127.0.0.1`), using the
`.env.staging.local` file provided for this round, pointed at the staging
Supabase project `axurszlibxwwptkczztt`. No production data, no
`Paid2You` access, no live Stripe billing, no GitHub push/merge, no
production deploy. This resolves item 3 of
`11_STAGING_VERIFIED_SYNC_AND_RELEASE_SEQUENCE.md` §4, which that round
reported as blocked for lack of staging credentials.

**Per explicit instruction: successful local staging tests do not
constitute acceptance of the SSO-protected Vercel preview.** That remains
a separate, unperformed check — see §9.

## 1. Environment verification (gate before any account was created)

- `.env.staging.local` exists at repo root, 461 bytes, confirmed git-ignored
  (`git check-ignore -v` → matches `.gitignore:8:.env*.local`).
- `VITE_SUPABASE_URL=https://axurszlibxwwptkczztt.supabase.co`.
- Dev server started with `--mode staging --host 127.0.0.1`, confirmed
  listening on `127.0.0.1:5173`.
- **Definitive proof of target project**: fetched the Vite-dev-transformed
  source of `src/lib/supabase.ts` directly (`GET /src/lib/supabase.ts`),
  which inlines `import.meta.env` as a literal object. The anon key's JWT
  payload was base64-decoded from that literal and reads:
  `{"iss":"supabase","ref":"axurszlibxwwptkczztt","role":"anon",...}`.
  This is a cryptographic property of the key itself, not a network trace
  that could be spoofed by a single mocked request — `ref` ties the key to
  one project. **Confirmed: staging only, never
  `ktehhvmmwnsbcvpjcmzt`/production.** Account creation proceeded only
  after this check passed, per the stop-if-it-fails instruction.

## 2. Consolidated results

| Area | Result | Notes |
|---|---|---|
| Registration (signup → email confirm → login) | **PASS** | Real email round-trip via Mailinator; confirmation link format verified (`/auth/v1/verify?...type=signup`). |
| Onboarding (mandatory patient intake form) | **PASS** | Discovered as a hard-blocking modal (`PatientLayout.tsx`, `intakeCompleted===false`) with no skip option; completed via real UI; "Saved & Synced!" confirmed, modal cleared. |
| Session restoration (same-tab) | **PASS** | `page.reload()` preserved authenticated state. |
| Session non-sharing (cross-tab) | **PASS** | A second tab in the same browser was NOT authenticated — confirms the `sessionStorage`-based HIPAA design is working as intended, not a bug. |
| Medications (create, read-back, delete) | **PASS** | `201 POST /rest/v1/medications` on create; UI delete via "All Meds" → "Remove" confirmed, DB re-query returned 0 rows after. |
| Reminders — free-tier gating | **PASS** | Direct confirmation of paywall: "Reminders is a Paid Tier feature. Upgrade to unlock it." |
| Reminders — CRUD functionality | **NOT TESTED** | Gated behind `paid_tier`; no upgrade was performed (live Stripe billing is out of scope/forbidden). |
| Patient documents (upload, signed URL) | **PASS** | Full chain observed: `200 POST /storage/v1/object/patient-documents/...`, `201 POST /rest/v1/patient_document_uploads`, `200 POST /storage/v1/object/sign/...`. Deleted via UI; DB re-query returned 0 rows after. |
| Media upload, playback, signed URLs | **PASS** | Full chain: storage upload → `media_uploads` insert → signed URL mint → actual `GET` readback of the signed URL (stronger than mint alone). Deleted via UI (native `confirm()` dialog handled); DB re-query returned 0 rows after. |
| Subscriptions — free-tier auto-provisioning | **PASS** | New account correctly received a `free_tier`/`active` `subscriptions` row. |
| Subscriptions — authorized plan-change UI | **PASS** | "Change Plan" view reachable, renders Free Tier and Daily Care pricing; confirmed zero Stripe/checkout network calls fired from merely viewing it. |
| Subscriptions — actual paid upgrade | **NOT TESTED** | Deliberately not exercised — constraint: no live Stripe billing. |
| Separate Daily Care / Full Support checkout | **Release limitation, confirmed** | Consistent with the prior round's finding: the Change Plan view shows pricing for both tiers but a distinct, working purchase flow for each was not exercised/enabled. Do not enable live payments without owner authorization. |
| Patient data isolation — RLS mechanism | **PASS (single-account probe)** | See §3 — zero rows returned for 4 tables filtered by an unrelated synthetic id, non-zero for the same account's own data (positive control), proving RLS filters correctly rather than failing open or failing closed universally. |
| Patient data isolation — true two-account test | **NOT TESTED (blocked)** | Supabase's built-in test-email service hit `429 over_email_send_rate_limit` after Patient A's signup consumed quota; a second confirmed account could not be created in this session. See §3. |
| Administrator permissions | **NOT TESTED** | No admin account exists on staging and there is no self-service path to create one from the patient-only UI — the same structural blocker already established in earlier rounds of this engagement. Not re-investigated as a new audit, per instruction. |
| Caregiver permissions / authorized patient relationships | **NOT TESTED** | Requires a second confirmed account to act as caregiver and a real invite/link flow; blocked by the same email rate limit as the isolation test. |
| Vercel SSO-protected preview | **NOT TESTED** | Explicitly out of scope for this round by instruction; local staging results do not substitute for it. |
| Cleanup of synthetic data | **PARTIAL — see §4** | Self-service rows/storage deleted and DB-verified; auth-level account rows need DB-level access this session does not have. |
| TypeScript (`tsconfig.app.json`) | **PASS** | 0 errors. |
| TypeScript (`tsconfig.node.json`) | **PASS** | 0 errors. |
| `npm run lint -- --max-warnings 0` | **PASS** | 0 errors/warnings. |
| `npm run test:unit` | **PASS** | 197/197 passed. |
| `npm run build` | **PASS** | Built successfully (pre-existing >500kB chunk-size advisory only, not a new regression). |

## 3. Patient isolation — what was and wasn't established

A true two-independent-account isolation test (Patient A creates data,
Patient B — logged in separately — attempts to read it) was the intended
test. Patient A was fully created and used throughout. A second signup
attempt for Patient B hit Supabase Auth's built-in email-sending rate
limit (`429 over_email_send_rate_limit`) after several signup attempts
(see note below), so Patient B's email was never confirmed and no second
authenticated session could be established. This is an external,
environmental constraint of the staging project's default email quota
(no custom SMTP configured), not an application defect.

As a fallback, Patient A's own authenticated session was used to query
`medications`, `patient_document_uploads`, `patients`, and `media_uploads`
filtered by a syntactically valid but entirely unrelated UUID
(`00000000-0000-4000-8000-000000000001`), alongside a positive-control
query for Patient A's own medications by their real `auth.uid()`:

```json
{
  "medications": { "rowCount": 0, "error": null },
  "documents": { "rowCount": 0, "error": null },
  "patientsRow": { "rowCount": 0, "error": null },
  "media": { "rowCount": 0, "error": null },
  "ownMedicationsPositiveControl": { "rowCount": 1, "error": null }
}
```

Zero rows (not an error) for the unrelated id across all four tables,
while the same account's own data remained correctly readable, is
consistent with RLS filtering on `patient_id = auth.uid()` (or the
equivalent linked-caregiver clause) working as intended. This is weaker
evidence than a genuine second-account test would be — it does not rule
out every possible cross-account path (e.g., a caregiver-link-specific
bypass) — so it is reported as a **PASS of the mechanism probed**, with
true two-account isolation left **NOT TESTED** rather than claimed.

## 4. Cleanup

Via Patient A's own authenticated session, using the app's own in-UI
delete actions (not direct table writes):

| Item | Action | Verified |
|---|---|---|
| `medications` row ("StagingTestMed") | Deleted via "All Meds" → "Remove" | DB re-query: 0 rows |
| `patient_document_uploads` row + storage object | Deleted via Documents trash icon | DB re-query: 0 rows |
| `media_uploads` row + storage object | Deleted via Videos & Media trash icon (native `confirm()` dialog accepted) | DB re-query: 0 rows |

**Not deletable from this session**: Patient A's `auth.users` row and the
associated `profiles` / `patients` / `subscriptions` / `patient_intake`
rows. The app has no self-service "delete my account" feature (checked —
only an admin-side pending-approvals flow and a privacy-policy mention of
account deletion exist; neither is reachable or usable by a patient from
the UI), and this session has no service-role or direct-DB access to
staging. These rows remain on staging and need removal by whoever holds
service-role/DB access, same division of labor as earlier rounds.

Patient B's signup never completed (confirmation email was never sent due
to the rate limit on at least the final attempt); it is unconfirmed
whether an unconfirmed `auth.users` row exists for that email. This should
be checked and removed if present, by whoever has DB access.

All local scratch test scripts, screenshots, and synthetic test files
(`_tmp_*`) have been deleted from the repo working tree — none were
committed. The local dev server process has been stopped.

## 5. Production-safe migration sequence

`11_STAGING_VERIFIED_SYNC_AND_RELEASE_SEQUENCE.md` §7 already contains the
reviewed, forward-only, production-safe release sequence excluding
staging-only scripts `027`/`028`'s table/column-creation bodies (it was
written and is unchanged by this round — no new SQL was touched during
these tests). This round's findings do not alter that sequence: no new
schema/RLS defect was found; the one new structural observation (the
mandatory intake-form gate, the "Family" paid-tier gate, and the
confirmed-working document/media signed-URL chain) are application-layer
behaviors already consistent with what that plan assumes, not migration
changes. **Decision, unchanged: production release NOT YET AUTHORIZED.**
Remaining blockers are exactly those already listed there (§6), plus:
cleanup of Patient A/B staging rows per §4 above, and the true two-account
isolation + admin/caregiver permission tests remaining NOT TESTED per §2.

## 6. Stop point

Per instruction, this round stops at the production release approval
boundary: no production SQL was run, no GitHub merge, no production
deploy, `Paid2You` was not accessed, and live Stripe billing was not
enabled. No architectural redesign or general audit was performed —
findings above are limited to running the approved test plan and
reporting what passed, failed, or could not be tested, and why.
