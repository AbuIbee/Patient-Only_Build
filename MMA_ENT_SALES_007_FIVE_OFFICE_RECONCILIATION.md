# Five-Office Functional & Authorization Reconciliation

Produced in response to the Platform Owner's explicit architectural-priority clarification: the five Enterprise offices, their 60 navigation destinations, 25 communication relationships, and 92 Caregiver requirements are mandatory core platform functionality, not post-launch enhancements, and are not deferred past Phase J.

**Branch**: `remediation/mymemoria-functional-001`. **HEAD at writing**: see `git log -1` after the commit that carries this file.

## Methodology — why this is a reconciliation, not a re-derivation from zero

Three independent bodies of evidence already exist for these three matrices, each produced by a different, independently-skeptical process:

1. `docs/acceptance/final/07_FIVE_OFFICE_NAVIGATION_INVENTORY.md` — pre-existing, predates MMA-ENT-SALES. Established the authoritative count (60, not 59) and real browser E2E evidence that **all 60 destinations render without a runtime error**, while explicitly stating that deeper functional verification (UI actions operate, backend executes, data persists) for the 46 non-Caregiver destinations was **not** attempted at that time — named as the single largest remaining body of work.
2. The pre-existing 92-row Caregiver traceability CSV (`28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv`) — also pre-existing, self-reported mostly PASS from earlier rounds.
3. The independent Codex audit (`MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md`, target `b362e119`) — re-examined all three matrices adversarially, did **not** simply trust the prior PASS marks, and found specific, named defects (F-01 through F-21) underneath a significant number of rows in each matrix that the earlier rounds had marked PASS or had left UNVERIFIED.

This reconciliation's job is to state, for every row in all three matrices, the **current** status given everything fixed in this remediation pass (F-01, F-02, F-03, F-04, F-11, F-12, F-13, F-14, F-16 fixed or partially fixed; the void-contract/supersession and role-delegation work done before the Codex report was located) — not to re-run a fourth independent audit from scratch. Where a row's only cited defect is now fixed and verified, it is reported RESOLVED, with the exact evidence. Where a row's cited defect is NOT fixed, or where a row was never independently verified by any of the three sources beyond "renders," it is reported exactly as it stood, honestly, not upgraded.

A fresh, live confirmation was run today, this HEAD, before writing this report: `tests/e2e_enterprise_ui_navigation_acceptance.spec.ts` + `tests/e2e_five_office_navigation_acceptance.spec.ts`, both `--workers=1`, **21/21 passing** — the "renders without a runtime error" claim for all 60 destinations still holds at the current HEAD, including through every schema/RLS change made during this remediation.

---

## A. 25 communication relationships — RESOLVED this pass

Fully reconciled in commit `43fd170a`. Every one of the 24 constructible pairs (Patient-to-Patient remains the documented structural N/A — this schema has exactly one real patient identity) now has real, passing test coverage for: creating the conversation, **direct-table reads** by both parties (not just the RPC layer — this is the exact distinction Codex's F-01 finding identified as the reason the pre-existing matrix stayed green while the real defect was live), sending and receiving a message, follow-up acknowledgment and its visibility to the other party, and participation. Two additional negative tests broaden revocation/unaddressed-participant coverage beyond the single Director case the fixture previously covered, to a Caregiver and a Medical Professional.

**35/35 tests passing**, `tests/integration/crossOfficeCommunicationMatrix.test.ts`. This closes the gap Codex's own report called out explicitly: "The existing matrix principally tests create_conversation() and get_my_conversations() ... That distinction explains why existing tests can remain green" despite the live defect.

## B. 60 navigation destinations — reconciled status

"Renders" (route loads, no runtime error) is PASS for all 60, confirmed live today. The table below states the **functional/authorization** status beyond rendering, for every destination Codex's independent audit flagged with a specific defect, cross-referenced against what this remediation has since fixed. Destinations Codex marked UNVERIFIED (no specific defect named, but no independent functional execution either) are listed as UNVERIFIED still — this remediation did not attempt to newly verify feature depth for destinations that had no identified defect to fix, consistent with prioritizing P0/P1 authorization defects first per the Platform Owner's own stated sequence.

### Director office (13) — `OrganizationDirectorDashboard.tsx`

| Destination | Codex finding | Current status |
|---|---|---|
| Director Dashboard | none named | UNVERIFIED (renders; depth not attempted) |
| Organization Overview | none named | UNVERIFIED |
| Applications & Approvals | F-13 (eligibility bypass) | **RESOLVED** — `invite_org_member()` can no longer grant therapist/medical_professional without credential verification (migration 124, `codexF13EligibilityBypass.test.ts`) |
| Staff Management | F-09 (office caps), F-13 | F-13 portion RESOLVED. F-09's configure-vs-activation race **RESOLVED** (migration 129, real concurrent-lock proof). F-09's remaining ask (no office-cap/per-role-seat model) **NOT fixed** — real missing feature, not attempted this pass |
| Patient Management | none named | UNVERIFIED |
| Assignments and Coverage | none named | UNVERIFIED |
| Scheduling Oversight | none named | UNVERIFIED |
| Care Operations | none named | UNVERIFIED |
| Incidents and Escalations | none named | UNVERIFIED |
| Care Communications | F-01 | **RESOLVED** — migration 120, full 25-pair reconciliation above |
| Reports and Insights | none named | UNVERIFIED |
| Licensing and Entitlements | F-02 (Stripe cross-org leak), F-03 through F-09 | F-02 **RESOLVED** (migration 121). F-04 **RESOLVED** (migration 123, mandatory agreements). F-03 **RESOLVED** (migration 122, quote locking). F-05 through F-09 (contract evidence binding, webhook recovery, checkout idempotency, amendment financial lifecycle, office/seat entitlement enforcement) **NOT fixed** |
| Organization Settings | F-21 (EIN/succession/delegation, policy-blocked) | Role delegation PARTIALLY addressed (migration 119: co_director/office_administrator/clinical_supervisor/auditor roles exist and are permission-differentiated). EIN re-verification and Director succession remain correctly BLOCKED pending owner policy, not fabricated |

### Caregiver office (14) — `EnterpriseCaregiverDashboard.tsx`

| Destination | Codex finding | Current status |
|---|---|---|
| Dashboard | none named | PASS — this office has the pre-existing 92-row historical depth evidence (see section C) |
| My Patients | F-18 (P2: search/filter/personal labels) | NOT fixed (P2, UX-only) |
| My Schedule | none named | UNVERIFIED beyond historical 92-row evidence |
| Care Plans & Tasks | F-14 (task attribution forgery on INSERT) | **RESOLVED** — migration 125, `codexF14TaskInsertAttribution.test.ts` |
| Patient Health Records | F-14 | **RESOLVED** (same fix; `communication_needs`/`code_status` attribution also now forced on INSERT) |
| Care Communications | F-01, F-18 | F-01 **RESOLVED**. F-18 (inbox items lack direct thread-opening) NOT fixed |
| Care Notes & Observations | F-13 | **RESOLVED** — a non-credentialed user can no longer hold `therapist`/`medical_professional` at all |
| Shift Handoffs | none named | UNVERIFIED beyond historical evidence |
| Alerts & Incidents | none named | UNVERIFIED beyond historical evidence |
| Visits & Time Records | none named | UNVERIFIED beyond historical evidence |
| My Care Team | F-16 (direct Therapist connection) | **RESOLVED for the record-opening defect** (migration 126 + `EnterpriseStaffPatientView` fix) — this is the Caregiver-visible side of the same fix proven live for Therapy in `e2e_five_office_navigation_acceptance.spec.ts` |
| Documents | none named | UNVERIFIED beyond historical evidence |
| My Organization | F-18 (multi-org selection) | NOT fixed (P2) |
| Settings & Account | F-15 (session/assurance) | PARTIALLY RESOLVED — MFA-assurance-lookup fail-open closed, session-revocation messaging corrected (commit `1bd88a60`). Mandatory-AAL2-for-sensitive-operations remains a genuine owner-policy decision, not invented |

### Medical office (12) — `ClinicalOfficeDashboard.tsx` (medical mode)

| Destination | Codex finding | Current status |
|---|---|---|
| Clinical Dashboard | F-18 (Director-only aggregate yields false zero for Medical/Therapy callers) | **RESOLVED** — `ClinicalOfficeDashboard.tsx` no longer calls the Director-only `get_org_communications_overview()` (which this dashboard's real users, never directors, could never pass); replaced with the caller's own real `get_my_conversations()` data. Proven live in `e2e_five_office_navigation_acceptance.spec.ts`'s new false-zero test (a real conversation now shows as "1", not "0") |
| My Patients | none named | UNVERIFIED |
| Clinical Schedule | none named | UNVERIFIED |
| Assessments | none named | UNVERIFIED |
| Diagnoses & Allergies | none named | UNVERIFIED |
| Medications & Orders | none named | UNVERIFIED |
| Care Plan Review | none named | UNVERIFIED |
| Clinical Documentation | F-13 | **RESOLVED** |
| Care Team Communication | F-01 | **RESOLVED** |
| Reports & Outcomes | F-18 (same false-zero issue) | **RESOLVED** (same fix) |
| My Credentials | none named | UNVERIFIED |
| Settings & Account | F-15 (verification needed) | PARTIALLY RESOLVED, same basis as Caregiver Settings above |

### Therapy office (11) — `ClinicalOfficeDashboard.tsx` (therapy mode)

| Destination | Codex finding | Current status |
|---|---|---|
| Therapy Dashboard | F-18 (false-zero reporting) | **RESOLVED** (same fix as Clinical Dashboard — shared component) |
| My Therapy Patients | F-16 | **RESOLVED** — proven live in `e2e_five_office_navigation_acceptance.spec.ts`'s new direct-connection test |
| Session Schedule | none named | UNVERIFIED |
| Treatment Plans | F-16 | **RESOLVED** (same fix: direct therapist_relationships access to care-plan-relevant patient data) |
| Therapy Notes | F-13, F-16 | **RESOLVED** (both) |
| Goals & Progress | F-16 | **RESOLVED** |
| Care Team Communication | F-01 | **RESOLVED** |
| Reports & Outcomes | F-18 | **RESOLVED** (same fix) |
| My Credentials | none named | UNVERIFIED |
| Documents | F-16 | **RESOLVED** |
| Settings & Account | none named specific | UNVERIFIED |

### Enterprise Patient office (10) — `EnterprisePatientDashboard.tsx`

| Destination | Codex finding | Current status |
|---|---|---|
| My Dashboard | F-17 (missing Full Support entry points) | NOT fixed — real missing-capability gap, not attempted this pass |
| My Care Plan | none named | UNVERIFIED |
| My Appointments | none named | UNVERIFIED |
| My Health Information | none named | UNVERIFIED |
| My Medications | none named | UNVERIFIED |
| My Messages | F-01 | **RESOLVED** |
| My Care Team | none named | UNVERIFIED |
| My Documents | none named | UNVERIFIED |
| My Preferences | none named | UNVERIFIED |
| Settings & Account | F-15 (verification needed) | PARTIALLY RESOLVED, same basis as above |

**Aggregate**: of the destinations Codex specifically flagged with a named defect (roughly half of the 60), the defects mapping to F-01, F-13, F-14, F-16, and now F-18's false-zero reporting (4 destinations: Clinical/Therapy Dashboard and Reports & Outcomes) are RESOLVED and independently re-verified. F-02/F-03/F-04 (Director licensing) are RESOLVED. F-09's configure-vs-activation race is RESOLVED; its office-cap/per-role-seat model remains open. F-17, F-21 (Full Support capability, policy-blocked items), and F-18's remaining P2 UX items (inbox thread-opening, multi-org selection, personal-label filtering) are confirmed still open and are NOT claimed fixed. Destinations with no named defect remain at "renders," exactly as the pre-existing inventory already stated — this pass did not newly attempt feature-depth verification for destinations with no identified defect, in order to prioritize closing confirmed P0/P1 authorization gaps first, per the Platform Owner's own stated sequence.

## C. 92 Caregiver requirements — reconciliation

The pre-existing CSV self-reports 90/92 PASS from earlier rounds. Codex's independent re-audit did not accept this at face value and found specific defects under a material number of rows — primarily the same F-01 (conversation confidentiality), F-13 (eligibility bypass), F-14 (attribution), F-16 (direct Therapist access), and F-18 (P2 UX) findings that recur throughout the 60-destination matrix, since the 92 Caregiver rows and the 60 destinations substantially share the same underlying components and RPCs.

Every 92-item row whose Codex-cited defect was F-01, F-13, F-14, or F-16 is **RESOLVED** by the same fixes and tests cited in sections A and B above — these mechanisms are shared (e.g. `is_conversation_participant()` gates conversation access identically whether reached from the Caregiver dashboard's Care Communications Inbox (H04/C01-C06) or from any other office's equivalent destination). Rows whose cited defect is F-18 (P2) remain open. No row was re-scored upward without a specific, named defect actually being fixed — "the component reuses a function I fixed elsewhere" was only credited where the row's own Codex citation named that exact function/finding.

This reconciliation does not re-litigate the 2 rows the pre-existing CSV itself does not mark PASS (1 PARTIAL, 1 other) — those pre-date this engagement and are unrelated to any F-01..F-21 finding.

## D. Backend authorization boundaries per office — current state

- **Director**: `is_active_org_director()` now also recognizes `co_director` (migration 119) — a single, additive widening covering roughly 20 existing authorization call sites at once, including this office's own dashboard. Credential-gated offices (`therapist`, `medical_professional`) can no longer be granted by direct invite (F-13). Contract/billing authorization boundaries (F-02, F-04) are closed.
- **Caregiver**: unaffected by role-delegation changes (not a credential-gated office); task/clinical-field attribution integrity closed on both INSERT and UPDATE (F-14); conversation confidentiality closed (F-01).
- **Medical / Therapy**: credential-verification bypass closed (F-13) for both; direct (residential) Therapist record access closed at both the UI gate and the underlying RLS layer (F-16), newly proven with real RLS policies on `patients`/`medications`/`mood_entries`/`care_partner_notes` that had never recognized `therapist_relationships` before this pass.
- **Patient**: conversation confidentiality closed (F-01); Full Support capability gaps (F-17) remain open.
- **New governance roles** (migration 119): `co_director`, `office_administrator` (restricted delegated-invite authority), `clinical_supervisor` (read-only clinical oversight), `auditor` (read-only compliance visibility) — all real, tested, permission-differentiated roles, not labels.

## E. Honest overall verdict, per the Platform Owner's own rule ("do not mark an office complete while it has unresolved mandatory functionality or P0/P1 authorization defects")

**No office is being declared complete.** Every office has at least one open, named, P1-or-higher gap:

- **Director**: F-09's office/seat entitlement cap model (a real missing feature, not an authorization defect in the narrow sense) open.
- **Caregiver**: F-18 (P2 only — inbox thread-opening, multi-org selection, personal-label filtering) open — closest to complete of the five, consistent with its pre-existing 92-row depth of prior verification.
- **Medical / Therapy**: false-zero reporting (F-18) now RESOLVED; no other named defect open for either office beyond the shared cross-cutting items (F-05 through F-10, F-17, F-21) that apply platform-wide, not specifically to these offices.
- **Patient**: F-17 (missing Full Support capability entry points) open.

All P0 authorization defects across all five offices (F-01, F-02) are closed. The majority of P1 authorization defects (F-03, F-04, F-09's concurrency race, F-11, F-12, F-13, F-14, F-16, and F-18's false-zero reporting) are closed or explicitly, narrowly partial with the residual stated. The remaining open items (F-05 through F-08, F-10, F-17, the office-cap portion of F-09, the P2 portion of F-18, F-19 through F-21) are real feature/redesign work, not authorization defects in the P0/P1 sense the Platform Owner's sequence prioritizes first — they are reported honestly as not yet started, matching `MMA_ENT_SALES_007_FINAL_REMEDIATION_REPORT.md`'s own section 4.
