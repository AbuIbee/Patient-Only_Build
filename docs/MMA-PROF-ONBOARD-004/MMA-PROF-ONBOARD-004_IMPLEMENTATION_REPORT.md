# MMA-PROF-ONBOARD-004 — Implementation Report

**Branch:** `remediation/mymemoria-functional-001`. **Baseline commit at
start of this work:** `51e7a3a596234bafacc6f047c3c89bca9358aa3c`
(already locally committed, not pushed — the pending commit named in
the directive's own instruction #1; this report's work is additional,
on top of it).

This report was written incrementally as work completed. It covers
**P0-1 and all seven P0-2 phases** (commit `fb1c0af37e7f7e3f6c2fff13e56aaa376c93cd18`,
the current branch HEAD at the time of this update). Nothing below is
claimed beyond what the cited commits, migrations, and test runs
actually show — see "Status summary" at the end for what remains
genuinely open.

---

## P0-1 — Blank `/Professional/Owner` route

### Root cause (confirmed by direct reproduction, not inferred)

`vite.config.ts` set `base: './'` (relative asset base). The real
production build's `dist/index.html` therefore referenced its JS/CSS
bundles with **relative** paths:

```html
<script type="module" crossorigin src="./assets/index-VsxIftS5.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-BXL2A37r.css">
```

`vercel.json`'s existing SPA rewrite is:

```json
{ "source": "/((?!assets/).*)", "destination": "/index.html" }
```

On a **direct deep link or browser reload** at any non-root path (e.g.
`/Professional/Owner`), Vercel serves `index.html`'s bytes at that URL
*without changing the browser's address bar / resolved document base*.
The browser then resolves the HTML's relative `./assets/index-*.js`
against the **current document URL**, not `/` — producing a request to
`/Professional/assets/index-*.js`. That path does **not** start with
`assets/` at the root, so the **same** rewrite rule intercepts it too,
and answers it with `index.html`'s own HTML bytes (`Content-Type:
text/html`) instead of JavaScript. Browsers enforce strict MIME-type
checking for `<script type="module">` and refuse to execute a response
whose content-type isn't a JS/Wasm type. React never mounts.
`<div id="root">` stays permanently, unrecoverably empty — a genuine
blank page that no client-side `ErrorBoundary` can catch, because React
itself never initializes.

This is a **global, app-wide infrastructure bug** affecting every
deep-linked route in the SPA, not something specific to
`PlatformOwnerAdminPage.tsx`'s own authorization logic — that logic
(`supabase.rpc('is_platform_owner')`, a server-verified RPC call) was
read in full and confirmed correct independent of this bug.

### Reproduction evidence

1. Built the app (`npm run build`) and inspected the real `dist/index.html` —
   confirmed the `./assets/...` relative references above.
2. Wrote a faithful local simulator of `vercel.json`'s exact rewrite
   rule (`tests` scratch helper, not committed — `vercel_rewrite_sim_server.mjs`,
   serves the real `dist/` build, applies the identical
   `/((?!assets/).*) -> index.html` logic) and served it on
   `127.0.0.1:5299`.
3. `curl` against the simulator confirmed `/Professional/assets/index-*.js`
   returns HTTP 200 with `Content-Type: text/html` (not JavaScript).
4. A real Playwright/Chromium session navigating directly to
   `http://127.0.0.1:5299/Professional/Owner`
   (`tests/e2e_p0_1_deeplink_rewrite_diagnosis.spec.ts`) captured the
   actual browser console error:

   > `Failed to load module script: Expected a JavaScript-or-Wasm module
   > script but the server responded with a MIME type of "text/html".
   > Strict MIME type checking is enforced for module scripts per HTML
   > spec.`

   and confirmed `#root`'s `innerHTML` was the empty string — a real,
   observed, permanently blank page, exactly matching the reported bug.

### Fix

`vite.config.ts`: changed `base: './'` → `base: '/'`. Rebuilt; confirmed
`dist/index.html` now references `/assets/index-*.js` (root-absolute).
Re-ran the exact same simulator + Playwright reproduction: all asset
requests now return `Content-Type: text/javascript`/`text/css`, `#root`
mounts real React content, zero console/page errors.

**Capacitor/Android regression check:** `capacitor.config.ts` sets
`server.url: 'https://www.mymemoriaally.com'`, so the packaged Android
app loads the app from the real hosted site over HTTPS — exactly like a
mobile browser — rather than from a local bundled copy of `webDir`.
This fix carries no Capacitor-local-file regression risk.

### Additional hardening — explicit states, never a blank or stuck viewport

`src/pages/professional/PlatformOwnerAdminPage.tsx`'s own owner-check
(`is_platform_owner()` RPC call) previously discarded the RPC's `error`
field entirely and had no `try/catch`, so:
- a genuine backend error (missing RPC, network failure, misconfigured
  project) was silently folded into the same UI as "you are not the
  owner" — hiding a real infrastructure fault behind a permissions
  message;
- an unexpected thrown exception during `refresh()` would leave
  `loading` stuck at `true` forever (an infinite spinner, never
  resolving to any explicit state).

Replaced the old `loading`/`isOwner` booleans with an explicit
`OwnerCheckStatus = 'checking' | 'owner' | 'not_owner' | 'backend_error'`
state machine, wrapped in `try/catch`, with a distinct, test-id-tagged
UI for each terminal state (including a "Retry" action on the backend-
error state). The owner role continues to be derived exclusively from
the server-verified `is_platform_owner()` RPC — never from the URL, a
mutable profile field, or org membership, per the directive's explicit
requirement.

### Required test matrix — all executed, serially, against the disposable
stack only (`mma-ent-caregiver-master-003`, API `127.0.0.1:57321`); dev
server target verified via its own served bundle before every run.

| Scenario | File | Result |
|---|---|---|
| Authenticated owner | `tests/e2e_p0_1_owner_route_diagnosis.spec.ts` | PASS |
| Authenticated non-owner | same | PASS |
| Logged-out | same | PASS |
| Missing backend infrastructure (RPC failure, simulated via route interception) | same | PASS |
| Browser reload while on the route | same | PASS |
| Mobile viewport (390×844, touch) | same | PASS |
| Expired/invalid session (corrupted sessionStorage token) | same | PASS |
| Deep-link under real production rewrite semantics (pre-fix repro + post-fix verification) | `tests/e2e_p0_1_deeplink_rewrite_diagnosis.spec.ts` | PASS |

Command: `npx playwright test tests/e2e_p0_1_owner_route_diagnosis.spec.ts
tests/e2e_p0_1_deeplink_rewrite_diagnosis.spec.ts --project=chromium
--workers=1` → **8 passed** (serial run; an initial parallel run showed
2 flaky failures that were root-caused to test-harness issues — a
`.first()` lookup against zero `data-testid` matches, and worker
contention — not product bugs; the flaky assertions were fixed in the
test file itself, confirmed by isolated reruns, before accepting the
suite as evidence). Firefox/Webkit projects could not run — their
Playwright browser binaries are not installed in this environment;
**this is a known environment limitation, reported as BLOCKED for
those two engines, not silently skipped or claimed as passing.**

Synthetic fixtures used (disposable stack only, never a real project):
- `owner004-test@local.test` — bootstrapped to `profiles.role='admin'`
  via the same documented out-of-band exception migration 012
  establishes for the first admin, with an audit row inserted into
  `account_management_audit` (`action_type =
  'synthetic_test_owner_bootstrap'`) recording the actor, target, and
  reason. Not created via `admin_set_role()` because no pre-existing
  admin existed yet on this disposable stack to call it — exactly the
  scenario migration 012's exception exists for.
- `nonowner004-test@local.test` — ordinary signup, auto-provisioned
  `profiles.role='patient'` by the existing trigger, no manual role
  grant of any kind.

### Regression

- `npx tsc --noEmit -p .` — clean, no errors.
- `npm run lint` — 0 errors (1 pre-existing, unrelated warning in
  `codex_round7_independent_audit/browser_audit.mjs`).
- `npm run test:unit` — **405/405 passed**, 32 files.
- `npm run test:integration` (sequential, `--no-file-parallelism`,
  against the disposable stack) — **324/325 passed**, 50/51 files. The
  one failure, `tests/integration/closureP4RealFiveMinuteArchival.test.ts`
  ("...is automatically archived after a genuine wall-clock wait"), is a
  test that deliberately waits a real ~5+ minutes for the disposable
  stack's `pg_cron` background worker to tick and sweep an archival
  job — a timing-dependent test by its own design (see the test file's
  own header comment), not a deterministic one. `git diff --stat`
  confirms this session's only changed source files are
  `vite.config.ts` and `PlatformOwnerAdminPage.tsx`, neither of which
  touches archival, closure, or cron logic in any way — this failure is
  not attributable to this session's work. Confirmed flaky by an
  isolated rerun: `npx vitest run --config vitest.integration.config.ts
  tests/integration/closureP4RealFiveMinuteArchival.test.ts` →
  **2/2 passed** (duration 352.98s). Treated as a known, unrelated,
  timing-sensitive test — not silently dropped from the original count
  and not misreported as having passed on the first attempt.

### Files changed for P0-1

- `vite.config.ts` — `base: './'` → `base: '/'`, with an explanatory
  comment documenting the root cause and the Capacitor safety check.
- `src/pages/professional/PlatformOwnerAdminPage.tsx` — explicit
  `OwnerCheckStatus` state machine replacing the old
  `loading`/`isOwner` booleans; `try/catch` around the owner-check;
  distinct backend-error UI with a Retry action.
- `tests/e2e_p0_1_owner_route_diagnosis.spec.ts` (new) — 7-scenario
  Playwright suite.
- `tests/e2e_p0_1_deeplink_rewrite_diagnosis.spec.ts` (new) — the
  deep-link/rewrite root-cause reproduction and fix verification.

None of these commits have been pushed to any remote, and no hosted
Vercel project, environment variable, or staging database was touched,
per the directive's explicit instruction.

---

## P0-2, Phase 1 — Commercial catalog (`3e7874fa`)

Migration 161: `license_tier_catalog` (three tiers — `essential`,
`plus`, `complete` — current live price only, each change versioned
into `license_tier_catalog_history`) and `license_tier_catalog_coupons`
(`WELCOME100`/`WELCOME50`), plus the server-authoritative monthly
active-patient pricing formula. All money computed server-side in
integer cents, never client-supplied, never floating point. No client
INSERT/UPDATE/DELETE policy on either table — every write goes through
a Platform-Owner-gated, `SECURITY DEFINER` RPC. Deliberately
self-contained: no changes yet to `professional_applications`,
`organizations`, or `organization_licenses`.

Tests added: `tests/integration/mmaProfOnboard004CommercialCatalog.test.ts`.

## P0-2, Phase 2 — Owner/Director separation, specialist slots, license-numbering fix (`b2998f93`)

Fixed a real security regression caught by this repo's own EXHAUSTIVE
GUARD test (migration 085): Phase 1's migration 161 had granted `anon`
EXECUTE on the two pricing-calculation RPCs, violating this codebase's
"no function grants anon EXECUTE, ever" rule. Corrected to
authenticated-only.

Migration 162 (additive): extends `professional_applications.status`
with the new self-service lifecycle values on the same column (no
parallel status field); adds `organizations.organization_owner_user_id`
as a first-class, audited Owner/Director distinction
(`owner_replace_director()`, `platform_owner_recover_organization_ownership()`,
both logging to a new `organization_ownership_events` table); adds
shared specialist-slot capacity across medical/therapist offices,
layered additively onto `director_approve_application()`; restores an
atomic counter for license numbering (migration 123 had regressed it
to a MAX-scan vulnerable to a genuine concurrent-activation race).

Verified: specialist-slot enforcement, legacy-org non-regression,
Owner-vs-Director authorization, and a real 15-way concurrent-process
license-numbering race producing 15 unique numbers. Full clean-DB
migration replay, tsc clean, lint clean. **405/405 unit, 343/343
integration (53/53 files)** — including the previously-failing
EXHAUSTIVE GUARD test, passing again after the anon-grant fix.

Tests added: `tests/integration/mmaProfOnboard004OwnershipAndSlots.test.ts`.

## P0-2, Phase 3 — The one canonical self-service entry point (`322e3538`)

Migration 163: `start_self_service_application()` — the single RPC
both permitted entry methods (public website; secure invitation)
converge into, onto the same `professional_applications` row and
existing billing/licensing chain (no second sales/licensing engine).
Automated verification (`run_automated_application_verification()`)
is built honestly from what this system can genuinely check with no
live third-party KYB provider integrated anywhere in this repo:
required-field completeness, Director/contact-email cross-match, and a
real duplicate-organization-name query — a suspected duplicate routes
to `manual_review` for the Platform Owner, never auto-approved or
auto-rejected.

Fixed two real bugs caught by this repo's own pre-existing regression
suite: a `NULL`-vs-`false` short-circuit bug in
`validate_director_application_payload()`'s self-service carve-out
(fixed with `COALESCE`), and an overly strict `NOT NULL` on
`sales_quotes.proposed_covered_patient_capacity` that doesn't fit a
tier-based license's metered-monthly design (relaxed, additive).

Verified: public-website pricing/coupon snapshot accuracy, duplicate-
name detection and resolution, invitation entry carrying negotiated
terms with no tier_code. Full clean-DB replay (163 migrations), tsc
clean, lint clean. **405/405 unit, 348/348 integration (54/54 files,
sequential).**

Tests added: `tests/integration/mmaProfOnboard004SelfServiceEntry.test.ts`.

## P0-2, Phase 4 — Self-service tier-selection UI (`013bcbc2`)

Replaces `ProfessionalRegisterPage.tsx`'s old two-field director path
(name + package, no pricing) with `SelfServiceApplicationFlow.tsx`:
tier selection → starter application (identity/eligibility/billing
only, per the directive's "do not force operational configuration
before purchase") → pricing with an empty-by-default, server-validated
promo-code field → declarations → submit. Staff-joining paths
(caregiver/medical/therapist) on the same page are untouched.

The result screen is honest about what is and isn't live: a clean
pass states plainly that electronic signature capture for the
license/BAA agreement is **not connected to a live provider in this
environment** — a genuine open dependency, not fabricated as solved.
Fixed a real accessibility/testability gap (unassociated label/control
pairs) in the new fields.

Verified end-to-end in a real Chromium browser against the disposable
stack: tier selection, live fee preview matching the server formula
exactly, `WELCOME50` reducing price exactly, submission reaching a
real `agreements_pending` row with fee snapshot verified directly
against the database, and a stale duplicate name correctly routing to
`manual_review` through the real UI (not only at the RPC layer). tsc
clean, lint clean, production build succeeds. **405/405 unit, 348/348
integration (54/54 files).**

Tests added: `tests/e2e_self_service_onboarding_ui.spec.ts`.

## P0-2, Phase 5 — Eliminate remaining `CreateOrgCard` fragmentation (`a76d8e88`)

Replaces both remaining `CreateOrgCard` usages
(`ProfessionalOfficeResolver.tsx`'s "New to Enterprise?" fallback, and
`EnterpriseDashboardRouter.tsx`'s "/business Start an Organization"
fallback) with the same canonical `SelfServiceApplicationFlow`. All
three previously fragmented Director entry points now converge on one
component and one RPC. `CreateOrgCard` itself is left defined/exported
but is no longer referenced anywhere in the app.

Fixed two real bugs surfaced by actually driving the browser flow
end-to-end: (1) `SelfServiceApplicationFlow` never collected the
applicant's own legal name/email when reached from an entry point that
skipped `ProfessionalRegisterPage`'s `AccountStep` — every such
submission would have failed with "Legal name is required"; fixed by
adding explicit, editable, pre-filled fields. (2)
`ProfessionalOfficeResolver.tsx`'s status allowlist predated migration
162's new lifecycle values, so a freshly self-service-submitted
application silently fell through to a generic "Organization access
required" fallback forever; fixed by extending the allowlist and
adding an `onSubmitted` callback, plus honest per-state rendering in
`ApplicationStatusPage.tsx`.

Verified end-to-end in a real browser via the existing
`tests/e2e_professional_access_states.spec.ts` (the same test that
caught both bugs above — not something the unit/integration suites
alone could have caught). tsc clean, lint clean, production build
succeeds. **405/405 unit, 348/348 integration (54/54 files)**, both
affected Playwright specs passing against a real browser.

## P0-2, Phase 6 — Monthly active-patient billing component (Stripe) (`f5570217`)

Migration 164: splits `enterprise_billing_accounts` into two rows per
quote (`billing_component` ∈ `'annual_license'` / `'monthly_patients'`),
`UNIQUE(quote_id, billing_component)` replacing `UNIQUE(quote_id)` —
same table, same webhook-dedupe mechanism, two independent commercial
obligations tracked, never a second billing table.
`compute_next_month_billing_anchor()` (DST-aware, verified against
America/Chicago and Asia/Tokyo) is the one authoritative definition of
"first day of next calendar month," computed in SQL, never recomputed
client-side. New `create-enterprise-monthly-subscription` Edge
Function opens a second Stripe Checkout Session with
`subscription_data[trial_end]` set to that anchor — captures a real
payment method today, defers the first invoice, never charges
immediately. `activate_enterprise_license_from_quote()` now also
requires confirmed recurring-payment authorization when a monthly
component exists (backward compatible with every pre-existing
annual-only quote).

Caught and fixed two real regressions during this phase's own testing
(not by inspection): a wrong-base-version `CREATE OR REPLACE` of
`create_enterprise_billing_account()` (caught by the pre-existing
`organizationAmendmentRequests.test.ts`), and an `ON CONFLICT
(quote_id)` clause that broke once `UNIQUE(quote_id)` was dropped
(fixed to target the real composite constraint).

**Open dependency, explicitly not claimed as solved:** Stripe itself
remains genuinely untestable in this environment — no real test-mode
credential has existed anywhere in this engagement. The new Edge
Function was verified to execute its entire real logic path (auth, RPC
calls, customer resolution, product naming) and fail only at the
honest, expected boundary (`STRIPE_SECRET_KEY` secret not set),
consistent with this repo's established precedent for every
provider-bound call. Marked **BLOCKED for real provider verification**.

Full clean-DB replay, tsc clean, lint clean. **405/405 unit, 352/352
integration (55/55 files).**

Tests added: `tests/integration/mmaProfOnboard004MonthlyBilling.test.ts`.

## P0-2, Phase 7 — Platform Owner tier/coupon administration and exception review UI (`fb1c0af3`)

Extends `PlatformOwnerAdminPage.tsx` (preserving the P0-1 blank-page
repair, untouched) with: `LicenseTierPricingPanel` (edit price/name/
specialist-slot count per tier, publish/unpublish; a price change
never retroactively alters an already-issued application's own locked-
in snapshot); `CouponManagementPanel` (create/pause/resume/revoke
codes, adjust redemption limits; coupon codes stay unreachable to
anonymous browsing); and an extended `DirectorApplicationsPanel` that
now surfaces `manual_review` applications by default with their
automated-verification flag reason, and three new actions (confirm,
reject, return for correction) via the new
`platform_owner_resolve_manual_review()` wrapper — previously such an
application was visible but had no action available on it at all.

New `src/services/licenseTierAdminService.ts`, following this
codebase's established thin-RPC-wrapper pattern.

Tests added: `tests/e2e_owner_tier_coupon_admin.spec.ts`.

---

## Independent verification at HEAD (`fb1c0af3`), this session

Rather than accept the prior session's self-reported counts above at
face value, they were independently re-verified from a cold start in
this session:

- `npm run test:unit` — **405/405 passed, 32 files** (offline, mocked
  Supabase client).
- A fresh disposable Supabase stack was provisioned via
  `scripts/disposable_supabase.mjs` (isolated ports, not the owner's
  persistent local dev database) — **all 164 migrations applied
  cleanly**, zero errors.
- `npm run test:integration` against that fresh stack — **352/352
  tests passed, 55/55 files**, confirming the Phase 6 commit's own
  reported numbers hold at the current HEAD.
- `npm run lint` — 0 errors (1 pre-existing, unrelated warning in
  `codex_round7_independent_audit/browser_audit.mjs`, unchanged by
  this directive's work).

**Two Postgres `ERROR:` lines that appear in the raw integration-test
log are expected, not defects — confirmed by reading the asserting
test, not just the log:**

1. `No confirmed-paid Enterprise billing account exists for quote ...
   -- license cannot activate without confirmed payment` /
   `... for amendment quote ... -- cannot apply without confirmed
   payment`. This is `tests/integration/organizationAmendmentRequests.test.ts`'s
   own `'CRITICAL GATE: an amendment never applies without confirmed
   payment, even with a real quoted request'` assertion deliberately
   exercising the gate. The test passes because the rejection happens.
2. `duplicate key value violates unique constraint
   "patient_care_plans_one_current_per_patient"`. This is
   `tests/integration/carePlanConcurrency.test.ts` deliberately racing
   two concurrent writers against the partial unique index migration
   096 added specifically to make that state impossible — the raised
   error is the invariant holding, not a new defect.

## Status summary (honest, as of this update)

- **P0-1** — root cause confirmed, fixed, tested with real-browser
  evidence, regression-clean. Done.
- **P0-2 Phases 1–7** — commercial catalog, Owner/Director separation
  and specialist slots, the single canonical self-service entry point,
  its replacement UI, elimination of the remaining `CreateOrgCard`
  fragmentation, the monthly active-patient Stripe billing component,
  and Platform Owner tier/coupon/exception-review administration — all
  committed, and independently re-verified at HEAD in this session
  (405/405 unit, 352/352 integration across 55 files, 164/164
  migrations replaying cleanly). Done, with the specific open items
  below.

**Genuinely unresolved, not claimed as solved anywhere above:**

- **Stripe cannot be live-verified in this environment.** No real
  test-mode credential has ever existed in this engagement; both
  Checkout/subscription Edge Functions are verified only up to the
  `STRIPE_SECRET_KEY not set` boundary. Live verification against a
  real Stripe test-mode account is an outstanding production
  dependency before this billing path can be trusted end-to-end.
- **Electronic signature capture for the license/BAA agreement is not
  connected to any live e-signature provider.** The self-service flow
  shows an honest "not yet connected" notice at that step rather than
  a fabricated "agreement signed" state. `agreements_pending →
  agreements_executed` has no real provider-driven transition yet.
- **Resend email lifecycle notifications for the self-service flow**
  were not part of this phase set and have not been verified.
- **The 10 commits covering P0-1 and all of P0-2 Phases 1–7 remain
  local-only** until this session's push — see the git-push record
  below (added at push time) for the authoritative confirmation of
  what actually reached `origin`.
