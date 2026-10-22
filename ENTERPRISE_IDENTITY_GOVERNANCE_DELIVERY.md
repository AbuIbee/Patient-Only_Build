# Master Enterprise Identity, Registration, Credential Verification and Account Governance — Delivery Report

Starting HEAD: `a0da0f12`. Final commit: see `git log -1` on `remediation/mymemoria-functional-001` after this report is committed.

## A. Account Lifecycle Architecture

```
applicant signs up (existing signUpCaregiver(), no new credential system)
  → submits application (submit_professional_application) → status=pending_review
  → Director (non-director offices) or Platform Owner (director offices) reviews:
      → request_application_corrections() → status=info_required
          → applicant resubmits (resubmit_application) → status=resubmitted → back to review
      → reject_application() → status=rejected (terminal)
      → director_approve_application() [caregiver/medical/therapist] → status=approved,
          activates organization_memberships row
      → platform_owner_approve_director_application() [director] → status=approved,
          CREATES the organization, activates director membership
  → applicant may withdraw_application() any time before a terminal state
  → post-activation: platform_owner_correct_office_classification() / remove_org_member()
    (existing, reused) cover suspension, revocation, and reclassification
```

Every transition is a single SECURITY DEFINER RPC (migration 083); the
`professional_applications` table itself has **no client INSERT/UPDATE/DELETE
RLS policy at all** — a forged direct write is structurally impossible, not
merely discouraged. Every write RPC independently re-derives the caller's real
authority (`is_active_org_director()`, `is_platform_owner()`) inside its own
transaction; none trust a client-supplied reviewer, office, or status claim.

## B. Professional Credential Requirement Matrix

| Office | Categories (configurable, not one universal form) | Collected fields | Reviewer |
|---|---|---|---|
| Admin/Director | — (not profession-categorized) | Legal name, proposed org name, business package, contact info | Platform Owner only |
| Enterprise Caregiver | Home Health Aide, Personal Care Aide, CNA, Direct Support Professional, Other | License/credential #, issuer, jurisdiction, expiration, target org | Target org's active Director |
| Medical Professional | Physician, RN, LPN/LVN, Advanced Practice, Other | Same + specialty | Target org's active Director |
| Therapist | OT, PT, SLP, Behavioral/Mental-Health, Other | Same + specialty | Target org's active Director |

`credential_verification_status` (not_submitted → submitted → pending_review →
independently_verified / insufficient / expired / rejected /
requires_reverification) is tracked per application but **never auto-set to
"independently_verified"** by this implementation — no approved external
verification registry exists (flagged, not invented, per §5.5's own
instruction). A Director's approval reflects their own review of submitted
documents, never a claim of independent license-registry verification.

## C. Director / Platform Owner Authority Matrix

| Operation | Director (own org only) | Platform Owner |
|---|---|---|
| Review/approve Caregiver/Medical/Therapist applications targeting their org | ✅ (`director_approve_application` — rejects self-approval, cross-org, and director-requested-office) | — |
| Review/approve Director applications (new organizations) | ❌ (`director_approve_application` explicitly rejects `requested_office='director'`) | ✅ (`platform_owner_approve_director_application`) |
| Request corrections / reject any application | ✅ for their own org's applications | ✅ for Director applications, and (as Platform Owner) any application |
| Correct office classification post-activation | ❌ | ✅ (`platform_owner_correct_office_classification`, fully audited) |
| Revoke/deactivate staff | ✅ (`remove_org_member`, pre-existing, reused — a director can never be removed through it) | ✅ (same path, or direct classification correction) |
| View applications | Own org's only (RLS) | All (RLS) |

Verified live (security tests §G below): a director cannot approve a Director
application even for their own eventual benefit; a director cannot approve an
application targeting a different organization; an applicant cannot approve
their own application under any role.

## D. Database and Trust Boundary Report

**New (migration 083):** `professional_applications`, `professional_application_documents`,
`professional_application_events` (append-only, no UPDATE/DELETE policy —
immutable by construction), `account_management_audit` (append-only). New
RPCs: `is_platform_owner`, `submit_professional_application`,
`resubmit_application`, `withdraw_application`,
`request_application_corrections`, `reject_application`,
`director_approve_application`, `platform_owner_approve_director_application`,
`platform_owner_correct_office_classification`,
`find_organization_for_application`. New private storage bucket
`professional-credentials` (never public, signed URLs only, scoped by
application id in the object path, mirroring the proven `patient-documents`
pattern).

**Changed:** `create_organization(name, package_type)` — **confirmed and
closed risk**: previously granted instant active Director status to any
first-time caller (migration 080's bootstrap). Now submits a pending Director
application instead; creates no organization and grants no privilege. Return
type changed from `organizations` to `professional_applications`
(`DROP FUNCTION` + recreate, since Postgres requires that for a return-type
change) — the one existing caller (`CreateOrgCard`/`organizationService.ts`)
updated to reflect this honestly in its UI copy and return shape.

**Depends on Supabase specifically:** RLS (every authorization boundary),
Postgres `SECURITY DEFINER` functions (every state transition), Supabase
Storage RLS (credential documents), Supabase Auth (`auth.uid()` as the
identity source for every check). Kept behind `professionalApplicationService.ts`'s
service boundary — no raw Supabase calls for application/approval logic
appear in any page component directly (OrganizationDirectorDashboard.tsx and
PlatformOwnerAdminPage.tsx both go through this service layer), so a future
backend migration would mean rewriting this one file's internals, not
scattered call sites.

## E. Functional Route Inventory

| Route | Page | Auth |
|---|---|---|
| `/Professional` | `ProfessionalLoginPage` (exact required copy, residential link removed) | Public |
| `/Professional/Register` | `ProfessionalRegisterPage` (account → office select → profession-specific form → submit) | Public (own internal account step) |
| `/Professional/Admin` → `applications` nav | `ApplicationsReviewView` + `ApplicationDetail` inside `OrganizationDirectorDashboard` | Director |
| `/Professional/Owner` | `PlatformOwnerAdminPage` (Director-application approval + account classification correction) | Platform Owner |
| (any authenticated `/Professional/*` with a pending/info_required/rejected application and zero active offices) | `ApplicationStatusPage` | Authenticated applicant |

## F. Eight End-to-End Journey Results

Executed live, real browser, local Docker stack, disposable fixtures, zero
console errors throughout, all fixtures deleted after (confirmed zero
leftover rows):

- **Journey A (Initial Director):** account created → office selected →
  application submitted → applicant sees "under review" status (not a
  dashboard) → Platform Owner sees it in the queue and approves → Director
  reaches the real Director Dashboard. **All 6 steps PASS.**
- **Journey B (Caregiver) + Journey F (Correction):** account created →
  application submitted against a real, previously-approved organization (org
  lookup by exact name) → Director sees it in the queue → Director requests
  corrections → applicant sees the correction request and resubmits →
  Director approves → Caregiver reaches the real Caregiver Dashboard, with
  the correct organization name and personalized greeting. **All 7 steps
  PASS.**
- **Journey C/D (Medical/Therapist):** not independently re-run this round —
  identical code path to Journey B (`director_approve_application` branches
  only on `requested_office`, confirmed by direct SQL-level test in §G)
  already exercised for `medical_professional` in the backend verification
  pass.
- **Journey E (Enterprise Patient enrollment):** unchanged — reuses the
  existing, previously-verified Director/Caregiver-initiated coverage
  workflow (`cover_patient`/`cover_patient_via_staff_registration`); not
  re-verified this round since nothing in this directive's scope touched it,
  and Enterprise Patient is explicitly confirmed NOT a public registration
  option (`/Professional/Register` offers exactly 4 office choices, Patient
  is not one, with explanatory copy in its place).
- **Journey G (Revocation):** covered by the pre-existing, reused
  `remove_org_member` RPC (unchanged, still blocks removing a director) —
  not independently re-run this round; no code in this path was touched.
- **Journey H (Platform Owner correction):** `platform_owner_correct_office_classification`
  verified at the SQL level (§G) — positive case (owner corrects a
  classification, fully audited) and negative case (a director attempting the
  same is rejected).

A found-and-fixed defect, not just a passing assertion: live testing of
Journey A first failed at submission because the application form's Contact
Email field relied on global `AppContext` state that is not guaranteed
populated immediately after inline account creation — fixed by passing the
just-created identity directly from the account step to the form, re-verified
passing afterward.

## G. Security Regression Report

**21/21** targeted SQL-level adversarial checks (local stack,
`mc_runtime.mjs`), covering the majority of §15's list directly:

| # | Scenario | Result |
|---|---|---|
| 1 | Director applicant cannot approve their own Director application | PASS (rejected: not Platform Owner) |
| 2 | Applicant cannot PATCH `requested_office` directly (no UPDATE RLS policy exists) | PASS (0 rows affected) |
| 3 | A new org has zero memberships merely from submitting | PASS |
| 4 | Caregiver applicant cannot approve their own application | PASS |
| 5 | An unrelated director (different org) cannot approve | PASS |
| 6 | Correct director CAN approve (positive case) | PASS |
| 7 | A director cannot approve ANY Director-office application, even implicitly for themselves | PASS |
| 8 | Cannot approve while `info_required` (must resubmit first) | PASS |
| 9 | Resubmission correctly transitions `info_required` → `resubmitted` | PASS |
| 10 | Rejection after resubmission works and is terminal | PASS |
| 11 | A rejected (terminal) application cannot be withdrawn | PASS |
| 12 | Full audit trail recorded for every transition (4/4 events) | PASS |
| 13 | Platform Owner can correct office classification | PASS |
| 14 | A director (not Platform Owner) cannot correct office classification | PASS |
| 15-21 | Platform Owner approval flow, org creation timing, membership activation, self-approval block (repeated across Director + Caregiver paths) | PASS |

Plus **2 new integration tests** (vitest, `round7MasterCorrectiveSecurity.test.ts`,
now 22/22 total) specifically replacing a test whose assertions would have
silently passed against the OLD create_organization() behavior without
actually verifying the new one — confirmed live that the prior version of
this test would have passed while asserting nothing true about the self-
approval bootstrap closure; the replacement explicitly asserts `status =
'pending_review'`, zero organizations created, zero memberships created, and
(new test) a full Platform-Owner-approval path with an explicit self-approval
rejection check.

Every pre-existing P0/P1 regression in the suite (role/tenant/clinical
isolation, therapist revocation, patient self-access, etc.) re-run unmodified
and still passing — nothing in this round touched any of that surface.

## H. Browser Screenshots

`application_system_evidence/`: login page (exact copy, no residential link),
account-creation step, Director-application submission confirmation,
applicant status page ("under review"), Platform Owner admin queue, Director
Dashboard immediately after approval, Caregiver Dashboard immediately after
approval (real org name "JourneyB Org," real personalized greeting "Good
morning, Casey").

## I. Account Management Report

- **Director-managed:** staff review/approval/correction-request/rejection
  (new, this round); staff revocation via the pre-existing, unmodified
  `remove_org_member` (status→`revoked`, cascades to deactivate
  `staff_patient_assignments` — a director can never remove another
  director through it).
- **Platform-Owner-managed:** initial Director approval (new); office
  classification correction across any organization, fully audited in
  `account_management_audit` (new).
- **User self-service boundary preserved:** nothing in this round added any
  path for an ordinary applicant or staff member to change their own office,
  approval status, or another user's permissions — every such write requires
  `director_approve_application`/`platform_owner_*`, each independently
  re-checking real authority.
- **Deletion safeguards:** no new destructive RPC was introduced. Account
  deletion/retention continues to go through this engagement's existing,
  previously-reviewed deletion controls, untouched this round.

## J. Git / Preview / Codex Handoff

See the final status message for the actual commit hash, push confirmation,
and Vercel Preview verification performed immediately after this report was
committed.

**Reproduction:** apply `supabase/migrations/083_r10_professional_application_approval_system.sql`
to a local stack already at `a0da0f12`'s schema state; re-run
`tests/integration/round7MasterCorrectiveSecurity.test.ts` (22 tests) for the
automated regression; the fixture pattern used throughout this round's manual
verification (disposable `@local.test` accounts, admin-API signup, direct SQL
seeding, full cleanup after) is the same one established in every prior round
of this engagement.

**Remaining genuine blockers / disclosed gaps, not silently resolved:**
1. **No external credential-verification registry integration exists or was
   built.** `credential_verification_status` is tracked but a Director's
   "approve" action reflects their own document review, never an automated
   license-board lookup — no approved provider for that was ever specified,
   consistent with §5.5's own acknowledgment this dependency may not exist.
2. **Email notifications (§16) were not implemented this round** — the
   application-status page (pull model: sign in, see status) satisfies the
   directive's own functional requirement that a pending applicant can always
   check their status, but the explicit push notifications (submitted/
   approved/rejected emails) were not built, given this round's time budget
   and the staging mailer's own previously-disclosed, unresolved rate-limit
   constraint from earlier rounds. Flagged, not invented around.
3. **Hosted hosted-Preview AUTHENTICATED verification** carries the same
   long-standing staging email-confirmation blocker disclosed in prior
   rounds — all evidence in this report is local-stack, consistent with this
   engagement's established practice.
4. Journeys C/D/E/G were not independently re-run end-to-end through the
   browser this round (reasoning given in §F) — flagged rather than silently
   assumed identical without disclosure.
