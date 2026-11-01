# 09 — Three-tier enterprise acceptance

New test: `tests/integration/hcnP0ThreeTierEnterpriseAcceptance.test.ts` (8/8 passing). Synthetic accounts in the disposable, local-only test environment -- never production, never the owner's persistent database.

## Setup

Three organizations under Bilal as **Organization Owner** (`organizations.created_by`, confirmed live via `get_organization_owner()`) -- **never Platform Owner** (confirmed live: `profiles.role` is neither `admin` nor `superadmin`):

- Al-Noor Essential (0 specialist slots, the real `license_tier_catalog` value)
- Al-Noor Plus (1)
- Al-Noor Complete (3)

Each: one Director, five caregivers, three patients -- the directive's own named headcount, provisioned directly (bypassing the full onboarding ceremony, which Phases B/E/G already separately verify) so this test's subject is the three-tier acceptance scenario itself. Bilal additionally holds a real `caregiver` office membership in each organization (Owner status alone does not grant conversation participation -- confirmed by this engagement's own prior finding in `package1OrgOwnerSelfAssignment.test.ts`).

## Results

| Test | Result |
|---|---|
| Bilal is the real Owner of all three; not a Platform Owner | **PASS** |
| **Essential**: a medical_professional application is denied outright | **PASS** |
| **Essential**: Bilal, Director, and a caregiver exchange authorized messages | **PASS** |
| **Plus**: accepts exactly one specialist, denies a second | **PASS** |
| **Plus**: Bilal, Director, caregiver, and the one specialist exchange authorized messages | **PASS** |
| **Complete**: accepts exactly three specialists in any medical/therapist mix, denies a fourth | **PASS** |
| **Complete**: Bilal, Director, caregiver, and all three specialists exchange authorized messages | **PASS** |
| Organization isolation holds across all three -- no caregiver's `get_my_organizations()` leaks another tier's org; direct REST cross-org patient reads return empty | **PASS** |

Specialist approval for every tier reused the real end-to-end path (`submit_professional_application` -> `record_credential_verification` -> `director_approve_application`) -- the exact mechanism Phase E already proved enforces the combined specialist-slot cap -- re-exercised here inside a fully-staffed organization (1 director + 5 caregivers + 3 patients), not a minimal fixture, confirming the cap holds under realistic organizational load, not just in a bare-minimum test setup.

## Historical requirement reconciliation (92 caregiver requirements / 60 destinations / 25 communications requirements)

**Not performed this pass.** These historical documents exist in this repository (`docs/acceptance/ENTERPRISE_MASTER_CLOSURE_REGISTER.md`, `MMA_ENT_CAREGIVER_D02_COMPLETE_ACCEPTANCE.md`, and related CSVs) but a line-by-line reconciliation of all ~177 historical line items against the current codebase state is a substantial, dedicated undertaking in its own right -- not something this pass's acceptance demonstration can stand in for. Per the directive's own explicit instruction ("do not claim those requirements pass merely because the three demonstration journeys work"), this is stated plainly here rather than implied or skipped silently: **the three-tier acceptance above demonstrates the specific capacity/isolation/messaging properties it set out to prove; it is not a substitute for, and does not close, the separate historical 92/60/25 reconciliation.**

## Status: **PASS** for the acceptance demonstration itself, exactly as specified (three real tiers, correct headcounts, correct specialist boundaries, correct isolation, Bilal correctly scoped as Organization Owner only). Historical requirement reconciliation remains open and unattempted, honestly disclosed above rather than assumed closed.
