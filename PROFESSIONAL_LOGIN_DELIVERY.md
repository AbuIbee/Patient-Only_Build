# Centralized Professional Login and Five Office Routes — Delivery Report

P1 corrective order. Starting HEAD `14aa6c3f`; final commit is the one this
report is committed in.

## 1. Root cause of the shared-landing-page failure

**Not a Vercel, build, or SPA-rewrite bug.** In the prior round, the four
provisional top-level paths (`/admin`, `/caregiver`, `/medical`, `/therapy`)
were deliberately implemented to reuse `BusinessLandingPage` — the existing
`/business` entry's marketing/sign-in page — as their shared, unauthenticated
pre-login screen, with office resolution only happening AFTER authentication
via `EnterpriseDashboardRouter`. That was a real design decision, documented at
the time, not an oversight — but its visible symptom is exactly what was
reported: four different URLs rendering byte-for-byte identical content before
sign-in, which reads as "the office routes don't work." `/patient` was
deliberately given NO special pre-login treatment at all (by design, to avoid
touching the live residential patient experience), so it showed the ordinary
patient landing page with no visible signal that a distinct Enterprise Patient
pathway exists.

This directive's own centralized `/Professional` entrance supersedes that
design outright, per explicit owner instruction, rather than "fixing" the old
provisional scheme in place.

## 2. Corrected route map

| Route | Unauthenticated | Authenticated |
|---|---|---|
| `/Professional` | `ProfessionalLoginPage` (new, dedicated, ent-* branded) | `ProfessionalOfficeResolver` → resolves real offices, redirects to the specific office path |
| `/Professional/Admin` | same dedicated login | Director Dashboard (if authorized) |
| `/Professional/Caregiver` | same dedicated login | Enterprise Caregiver Dashboard (if authorized) |
| `/Professional/Medical` | same dedicated login | Clinical Dashboard (if authorized) |
| `/Professional/Therapy` | same dedicated login | Therapy Dashboard (if authorized) |
| `/Professional/Patient` | same dedicated login | Enterprise Patient Dashboard (if covered) |
| `/Professional/<Office>/<nav>` | same dedicated login | that office's specific destination, nested and URL-synced |
| `/admin`, `/caregiver`, `/medical`, `/therapy` (legacy) | canonicalized to `/Professional/<Office>` via `replaceState` before paint | same as above |
| `/Patient` (singular, old top-level) | **unchanged** — ordinary residential/patient sign-in | `EnterprisePatientRouter` (unchanged): Enterprise-covered → `EnterprisePatientDashboard`, otherwise → `PatientLayout` |
| `/business` | **unchanged** — its own established `BusinessLandingPage`/no-org/residential fallback behavior | **unchanged** — `EnterpriseDashboardRouter businessWorkspace` |
| Every other existing route | **unchanged** | **unchanged** |

`/business` was deliberately NOT turned into a redirect to `/Professional`
this round — §9 makes that explicitly optional ("may become... provided this
does not break working residential or organizational flows"), and `/business`
carries established, independently-tested fallback behavior (the no-org
honest state, the residential CaregiverPortal fallback) that a redirect could
put at risk for no required benefit. Flagged as a future option, not done.

## 3. Files changed

**New files:**
- `src/pages/professional/ProfessionalLoginPage.tsx` — dedicated sign-in page
- `src/pages/professional/ProfessionalOfficeResolver.tsx` — authenticated resolver for all 5 offices (new 5th dimension: Enterprise patient coverage, alongside the 4 organization-membership-based offices)
- `src/pages/professional/ProfessionalEntryRouter.tsx` — top-level auth gate
- `src/pages/professional/useOfficeUrlSync.ts` — reusable nested-routing hook

**Modified files:**
- `src/App.tsx` — `/Professional*` detection, legacy-alias canonicalizing redirect, wiring into `renderContent()`. `/business`'s own block is otherwise untouched.
- `src/pages/common/LoginPage.tsx` — `SignInForm` exported (no behavior change) so the new login page reuses it instead of duplicating auth logic
- `src/pages/enterprise/OrganizationDirectorDashboard.tsx` — optional `basePath` prop (default `null` = unchanged for every existing caller)
- `src/pages/enterprise/ClinicalOfficeDashboard.tsx` — optional `basePath` prop (default `null`)
- `src/pages/patient/EnterprisePatientDashboard.tsx` — optional `basePath` prop (default `null`)
- `src/pages/enterprise/EnterpriseCaregiverDashboard.tsx` — `parseEnterprisePath`/`navigateTo` generalized to an optional `basePath` prop (default `'/business'`, byte-for-byte the prior hardcoded behavior)

**Not touched at all:** `EnterpriseDashboardRouter.tsx`, `EnterprisePatientRouter.tsx`, every RLS policy, every RPC, every other page component.

## 4. Five office authorization mappings

Identical to the authorization already established and verified in prior
rounds — this directive changes ROUTING/ENTRY only, never the underlying
authorization source:

| Office | Authorized by |
|---|---|
| Admin/Director | active `organization_memberships.org_role = 'director'` row |
| Enterprise Caregiver | active `organization_memberships.org_role = 'caregiver'` row |
| Medical Professional | active `organization_memberships.org_role = 'medical_professional'` row |
| Therapist | active `organization_memberships.org_role = 'therapist'` row |
| Enterprise Patient | `is_my_enterprise_coverage_active()` (same RPC `SubscriptionContext.tsx`/`EnterprisePatientRouter.tsx` already use) |

`ProfessionalOfficeResolver` re-derives all five from these exact sources on
every mount — never from the URL, never cached. A requested office the caller
does not hold is silently NOT honored; the URL is canonicalized to whatever
office (or selector, or access-required state) the real data actually
justifies.

## 5. Login and callback behavior

- Sign-in uses the exact existing `SignInForm` (same `supabase.auth.signInWithPassword`, same `must_change_password` reload gate, same `SET_USER`/profile-lookup flow already used by `LoginPage.tsx`) — zero new credential handling.
- On success, `AppContext`'s `isAuthenticated` flips, `ProfessionalEntryRouter` re-renders into `ProfessionalOfficeResolver`, which independently fetches real authorization data and redirects to the specific office path.
- Zero offices held → `AccessRequiredState` (honest, branded, no data exposure, offers logout).
- Exactly one office → redirected straight to it.
- More than one office, none yet selected → `OfficeSelector` (full-screen choice).
- More than one office, one already selected or requested in the URL → that office renders, with a persistent switcher bar to change it.

## 6. Browser verification (local Docker stack, real disposable fixtures)

All of §10's acceptance criteria A–L executed live:

| # | Criterion | Result |
|---|---|---|
| A | Unauthenticated `/Professional` shows dedicated sign-in | PASS |
| B | Unauthenticated deep link (`/Professional/Admin/staff`) discloses nothing | PASS |
| C | Director reaches Director Dashboard | PASS |
| D | Caregiver reaches Caregiver Dashboard | PASS |
| E | Medical Professional reaches Clinical Dashboard | PASS |
| F | Therapist reaches Therapy Dashboard | PASS |
| G | Enterprise Patient reaches Patient Dashboard | PASS |
| H | Multi-office user sees a selector, can switch only among authorized offices | PASS |
| I | Nested destination navigation (`/Professional/Admin/staff`) real, refresh-safe, back-safe | PASS |
| J | Logout returns to the dedicated sign-in page | PASS |
| K | Existing residential routes (`/business`, `/`, old singular `/Patient`) still function, zero errors | PASS |
| L | A caregiver directly requesting `/Professional/Admin` is silently resolved to their OWN office, never Director Dashboard or any director-only destination | PASS |

Legacy alias confirmed live: `/admin` → address bar canonicalizes to
`/Professional/Admin` before paint, shows the dedicated login — not
`BusinessLandingPage` — directly resolving the reported defect.

Screenshots: `professional_evidence/00_login_unauthenticated.png` through
`06_multi_office_switch.png`.

## 7. Security regression

No RLS policy, RPC, or authorization check was modified this round — only
routing/entry components. The existing 21-test integration/security suite was
re-run after all changes and passed unmodified (21/21). `tsc --noEmit`,
`eslint` (0 errors), 377/377 unit tests, and the production build all clean.
Fixtures used for the live browser verification above were deleted
immediately after (confirmed zero leftover rows, including the multi-office
and Enterprise-patient fixtures).

## 8. Verified Vercel Preview

To be confirmed after this commit is pushed — see the final status message
for the actual deployment id and Ready confirmation.

## 9. Remaining genuine blockers / notes

1. **Nested routing was extended to all 5 dashboards**, including a
   generalization of `EnterpriseCaregiverDashboard.tsx`'s own pre-existing
   `/business`-specific URL sync — done carefully with a default parameter
   that preserves its exact prior behavior for every existing caller, but
   this is the one piece of shared, heavily-used code this round touched; it
   is re-verified live (criterion I) rather than merely asserted safe.
2. **`/business` was not redirected to `/Professional`** — a deliberate,
   disclosed choice per §9's own "provided this does not break working
   residential or organizational flows" caveat, not an oversight.
3. **Hosted-Preview authenticated verification** carries the same
   long-standing, already-disclosed staging email-confirmation blocker from
   prior rounds (see `FIVE_OFFICE_GIT_AND_PREVIEW_REPORT.md`) — this round's
   routing-level hosted check (legacy alias → `/Professional` canonicalization,
   reachability, zero errors) can be done without authentication; full
   authenticated hosted verification remains local-stack only until that
   blocker is resolved by the owner.
