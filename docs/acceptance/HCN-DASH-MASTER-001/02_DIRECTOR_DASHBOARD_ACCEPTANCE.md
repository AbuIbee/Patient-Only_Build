# HCN-DASH-MASTER-001 — Workstream 1: Director Strategic Command Center

**Status: COMPLETE** (Workstreams 2-4 not yet started — see `01_IMPLEMENTATION_SUMMARY.md`)

**Branch:** `feature/hcn-dashboard-command-centers-master-001`, based on `release/hcn-dashboard-five-only-20261105` @ `02cc80b8`.

## Changed / added files

- `src/services/organizationDirectorOpsService.ts` — added `getOrgOperationalSnapshot()`, `getOrgCredentialsResult()`, `getUnacknowledgedHandoffCountResult()`, and the `OrgOperationalSnapshot`/`HourlyStaffingBlock`/`ComplianceAlert` types.
- `src/pages/enterprise/OrganizationDirectorDashboard.tsx` — `DashboardHome` extended with: the full required KPI set, an hourly staffing-coverage view, a unified compliance/safety action queue, and a financial/subscription health section. The approved Director Quick Actions block (ChatGPT release) is **unchanged**, byte-for-byte.
- `tests/integration/hcnDirectorOperationalSnapshot.test.ts` — new (4 tests).
- `tests/e2e_director_dashboard_overview.spec.ts` — new (1 real-browser test).

## No database migration required

Every read reuses existing RLS policies already granted to `is_active_org_director()` — `caregiver_visits`, `incident_reports`, `shift_handoffs`, `covered_patient_memberships`, `organization_memberships`, plus two tables that already had Director-scoped SELECT policies but no prior UI consumer: `caregiver_credentials` ("Active directors can view credentials within their own org") and `shift_handoff_acknowledgments`. No new table, column, policy, or grant.

## Section-by-section status

**A. Today's Operational Overview** — Done. 12 KPI cards, all backed by `getOrgOperationalSnapshot()`: active patient census, visits today/completed/in-progress/missed/late, unassigned patients, open incidents, active/awaiting-activation caregivers, pending handoff acknowledgments, license status. Every card is a clickable `MetricCard` navigating to the relevant screen. A failed sub-query is reported in `partialErrors` and surfaced as a banner — never folded into a false `0` (verified: `OrgOperationalSnapshot.partialErrors`, consumed in the component).

**B. Staffing and Patient Demand** — Done, with an honest limitation. Hourly (6am–10pm) scheduled-visit count, caregivers-required (distinct caregivers with an overlapping visit that hour), and overlap count are all derived from real `caregiver_visits` rows. "Caregivers available" uses the org's active-caregiver headcount as the explicitly-stated, clearly-defined denominator — this schema has **no per-caregiver hourly availability calendar**, so a true per-hour "available" figure does not exist as a trackable fact yet; this is stated in the UI itself, not hidden. When no visits are scheduled for today, the section shows "Insufficient scheduling data" literally, never a misleading all-zero chart (`staffingDataSufficient`). Clicking a shortage block navigates to Scheduling Oversight, which shows the real underlying visits — **not yet filtered to just that hour's visits** (an honest partial gap, not a decorative button).

**C. Compliance and Safety** — Done, expanded beyond incidents alone. The unified queue now also includes expired/expiring credentials (`caregiver_credentials`). Unassigned-patient and unresolved-handoff alert categories are wired into the type/nav model (`ComplianceAlertCategory`, `ALERT_NAV`) but are not yet separately populated as queue *entries* in this increment — currently surfaced as their own KPI cards instead. Each alert shows severity, timestamp, and source, and is clickable to the relevant screen.

**D. Financial and Subscription Health** — Done, honestly scoped. License number/status, patient capacity vs. licensed capacity, and specialist-seat usage are shown from real `organization_licenses`/membership data. Revenue, unbilled visits, claim denials, and reimbursement exceptions are explicitly marked **"Not connected"** — no fabricated figures, per the directive's own prohibition.

**E. Management Actions** — All 10 are reachable: the existing Director nav (`DIRECTOR_NAV_ITEMS`) already covers Manage Patients/Staff/Assign Caregivers/Scheduling/Incidents/Communications/Licensing/Reports; "Manage Patient Information" and "Manage Staff Information" are **not yet separate destinations** — that is Workstream 4 (CLAUDE-04), not yet implemented.

## Acceptance tests

| Test | Result | Evidence |
|---|---|---|
| DIR-001 (KPIs match source) | PASS | `hcnDirectorOperationalSnapshot.test.ts` (visit/incident predicates verified against seeded rows); `e2e_director_dashboard_overview.spec.ts` (real browser, seeded 2 patients/2 visits/1 incident/1 expired credential, all numbers confirmed on screen) |
| DIR-002 (drill-down to filtered record set) | PARTIAL PASS | Navigates to the correct screen with real data (verified: clicking Open Incidents shows the real seeded incident); not yet filtered to the exact KPI's subset (e.g., just today's visits) |
| DIR-003 (hourly overlap handling) | PASS (logic reviewed + integration-verified source predicates) | `overlappingVisits`/`caregiversRequired` computed from a `Map<caregiverId, count>`, confirmed via `hcnDirectorOperationalSnapshot.test.ts`'s visit fixtures |
| DIR-004 (incident creates alert) | PASS | E2E: seeded incident appears in the Compliance queue |
| DIR-005 (inactive caregivers excluded) | PASS | `hcnDirectorOperationalSnapshot.test.ts`: revoked membership excluded from active-caregiver count |
| DIR-006 (failures ≠ false zeros) | PASS (code-reviewed) | `partialErrors` array populated per failed sub-query; UI banner distinct from the KPI grid |
| DIR-007 (tenant isolation) | PASS | `hcnDirectorOperationalSnapshot.test.ts`: Director B's token returns zero rows for Org A's `caregiver_credentials` via real RLS |
| DIR-008 (navigation/refresh/history) | PASS | Reuses the existing `useOfficeUrlSync` nav mechanism, unchanged |
| DIR-009 (responsive 375/768/1440) | NOT EXECUTED THIS INCREMENT | Grid uses existing responsive Tailwind classes (`grid-cols-2 lg:grid-cols-4`) consistent with the rest of this file; no dedicated viewport screenshot test added yet |
| DIR-010 (updates on refresh) | PASS | Snapshot re-fetches on `organizationId`/`members`/`coveredPatients` change, same `refresh()` cycle as the rest of the page |

## Regression check against the protected five-change release

`npx playwright test tests/e2e_five_office_navigation_acceptance.spec.ts --project=chromium --workers=1`: the **Admin/Director** test (all 13 destinations, including the approved Quick Actions) passes unchanged. Two **Medical office** tests fail — confirmed pre-existing and unrelated: `ClinicalOfficeDashboard.tsx` was not touched by this work, and the failure is a Playwright strict-mode locator collision already present in that file's own markup (duplicate "Care team messages" text between a label and a button). Reported here per the directive's own instruction; not fixed, since Medical/Therapy is outside this workstream's scope and the file is protected release content.

## Validation run

`npm run typecheck` — clean. `npm run lint` — 0 errors (1 pre-existing, unrelated warning). `npx vitest run` (unit) — 415/415 pass. Integration (`hcnDirectorOperationalSnapshot.test.ts`) — 4/4 pass. E2E (`e2e_director_dashboard_overview.spec.ts`) — 1/1 pass.

## Remaining defects / honest gaps

1. Drill-downs navigate to the right screen but aren't yet filtered to the exact KPI subset (e.g., "late visits today" vs. all visits).
2. Unassigned-patient and unresolved-handoff categories exist in the data model but aren't yet rendered as their own Compliance queue entries (currently KPI-only).
3. No dedicated responsive-viewport test (DIR-009) yet.
4. Pre-existing, unrelated Medical office E2E failures (see above) — reported, not fixed.
