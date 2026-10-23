# 07 — Five-Office Navigation Inventory and Functional Acceptance

## UPDATE — 2026-10-23, HEAD `5fba1435`

One of the 60 destinations named in this document's own "renders without a runtime error" claim was re-examined under a later directive and found to be **genuinely broken, not a rendering success**: the Medical and Therapy offices' "Care Team Communication" nav item (`ClinicalOfficeDashboard.tsx`) rendered a blank page for every real user, because `PATIENT_PICKER_DESTINATIONS` was missing the `'communication'` key even though `INITIAL_TAB` already mapped it — the render switch fell through to `: null`. This means "renders without crashing" (no thrown JS error) and "the destination actually shows something" are not the same claim, and this document's original Browser E2E evidence (below) did not distinguish them. Fixed with a one-line addition; see register §2l (finding 10). **The large remaining body of work this document names below — per-destination feature depth for the 46 non-Caregiver destinations — is UNCHANGED and still not attempted at that depth.** This single confirmed defect is disclosed as a reason for added caution about the strength of the "renders" claim generally, not as evidence the remaining 45 are now verified.

---

## On the directive's "59" figure

No historical document in this repository states or derives the number 59. It is not recoverable as a pre-existing authoritative figure. This document reports the actual, code-derived count instead: **60**.

| Office | Dashboard component | Destinations |
|---|---|---|
| Admin (Director) | `OrganizationDirectorDashboard.tsx` | 13 |
| Caregiver | `EnterpriseCaregiverDashboard.tsx` | 14 |
| Medical | `ClinicalOfficeDashboard.tsx` (medical mode) | 12 |
| Therapy | `ClinicalOfficeDashboard.tsx` (therapy mode) | 11 |
| Patient (Enterprise) | `EnterprisePatientDashboard.tsx` | 10 |
| **Total** | | **60** |

## Functional acceptance classification (per the directive's exact 8 categories)

The directive requires classifying, for every destination: route renders / required UI actions operate / backend operations execute / data persists and reloads / correct role can access / prohibited roles cannot access / failure states behave correctly / evidence identifies the current commit. Collapsing these into one PASS is explicitly prohibited. Honest status, by category, across all 60 destinations:

| Category | Status | Evidence |
|---|---|---|
| **Route renders** | 60/60 PASS | `tests/e2e_enterprise_ui_navigation_acceptance.spec.ts` (Caregiver's 14, pre-existing) + `tests/e2e_five_office_navigation_acceptance.spec.ts` (the other 46, new this phase) — every destination clicked, zero runtime errors, confirmed live in a real browser session. |
| **Required UI actions operate** | Caregiver's 14: substantially verified across the historical 92-row CSV (prior rounds). The other 46: **NOT independently verified this phase** beyond "the destination renders" — individual buttons/forms within each of the 46 were not systematically exercised. |
| **Backend operations execute** | Where a destination's underlying RPC is covered by this phase's own work (Therapist patient visibility, credential verification, account deletion, Director messaging), confirmed via integration tests. For the remainder of the 46, this traces back to pre-existing RPCs built in earlier rounds for the Caregiver office and reused by the other 4 offices' dashboards — **not independently re-verified for each of the other 4 offices' specific call sites this phase**. |
| **Data persists and reloads** | Same pattern as above — verified where this phase's own work touches it, not independently re-verified destination-by-destination for the other 46. |
| **Correct role can access** | PASS, structurally — `ProfessionalOfficeResolver` gates every office behind a live-rechecked authorization computation (`getMyOrganizations()` + `is_my_enterprise_coverage_active()`), not a static role label. Reconfirmed via this phase's own fixture-based E2E logins (one real account per office, correctly reaching only its own office). |
| **Prohibited roles cannot access** | PASS — the same gate denies every office to an account that doesn't hold it; reconfirmed by the cross-office matrix's negative tests and by `ProfessionalOfficeResolver`'s own `AccessRequiredState` fallback. |
| **Failure states behave correctly** | Verified for this phase's own new workflows (credential-gate rejection, account-deletion duplicate/already-decided rejections, director coverage-ended rejection) — all tested with explicit negative cases. **Not systematically re-verified** for the other 46 destinations' own internal failure states (e.g. a form submission error inside a specific destination not touched this phase). |
| **Evidence identifies the current commit** | This document and the register name the exact commit for every claim made this phase. Evidence predating this phase (the 92-row CSV) names its own historical commits, not this phase's — never conflated. |

## The honest summary

"Renders without a runtime error" is real, verified, browser-level evidence for all 60 destinations — a genuine, non-trivial increment over the pre-existing navigation-inventory-only state. It is **not** equivalent to the Caregiver office's 92-row, multi-round feature-depth verification, and this document does not claim it is. Reaching that same depth for the other 46 destinations is the single largest remaining body of work this phase identified and did not attempt, for the reason stated in the register: attempting a shortcut version risks exactly the "fabricated/placeholder completion presented as real" outcome this entire engagement has been built to avoid.

## Evidence tier

**Browser E2E evidence**: `tests/e2e_enterprise_ui_navigation_acceptance.spec.ts` (pre-existing, Caregiver) + `tests/e2e_five_office_navigation_acceptance.spec.ts` (new, the other 4 offices, 4/4 passing, self-contained fixture, `--workers=1` required — documented in the file). Commit `49d0c6e4`.
**Hosted Preview evidence**: none — see Wave D status document.
**Historical evidence not rerun**: the Caregiver office's 92-row feature-depth evidence (prior rounds) is cited, not re-executed, this phase.
