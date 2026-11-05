# HCN-OFFICES-P0 — DASHBOARD-FIRST ENGINEERING EXECUTION ORDER
**Owner priority override:** 2026-11-05. **Absolute implementation priority:** functional dashboards for all professional offices. Patient account creation, dummy test provisioning and demographic edit expansion follow dashboard acceptance.

**Repository:** `AbuIbee/Patient-Only_Build`
**Implementation branch:** `feature/hcn-role-command-centers-and-fixtures-20261105`
**Production:** https://www.haneencarenetwork.com/Professional
**Related issue:** #7
**Safety:** Production contains dummy records according to owner, but role-based isolation, existing account integrity, credential checks and privacy controls remain mandatory. This order authorizes DASHBOARD development and acceptance first; it does not infer that production deployment or billing/security bypass has already occurred.

## Priority and change-control lock

| Gate | Priority | Deliverable | Stop / acceptance |
|---|---|---|---|
| **DASH-01 Director** | **P0-1** | Real Director strategic operations command center; live KPIs and click-to-filter workflows | Do not proceed to patient account seeding until every primary Director dashboard action and selected critical data feed passes |
| **DASH-02 Caregiver** | **P0-2** | Mobile-first next-action dashboard; next visits, schedule, tasks, patient briefs, safety alerts, secure messages and status of actual clock-in/out | No fake GPS/EVV/offline success; each tap must operate the real linked workflow |
| **DASH-03 Organization Owner** | **P0-3** | Separate owner multi-organization command center with license, staffing, patient and finance status appropriately bounded to owned organizations | Owner is never Platform Owner and has no global tenant access |
| **DASH-04 Medical** | **P0-4** | Licensed doctor/medical office with assigned caseload, clinical follow-ups, observations, safe documentation and messages | No prescribing/medical actions without actual credential/office authorization |
| **DASH-05 Therapist/PT** | **P0-5** | Specialist therapy session dashboard, care goals, progress, safety/handoffs and communication | Differentiate PT from mental-health therapist scope; do not expose protected psychotherapy notes |
| **DASH-06 Nutritionist** | **P0-6** | Nutrition caseload, allergy/diet care-plan review, hydration follow-up and authorized communications | Do not create a fake credentialed role or bypass Complete's three-slot entitlement |
| **PEOPLE-01 Patient information editor** | **P1 after all six dashboard gates** | Director/assigned acknowledged caregiver can view/edit authorized patient demographics; Owner can manage people in their org | Role/field matrix + immutable audit + verified identity/login email changes; no direct unrestricted client UPDATE |
| **PEOPLE-02 Staff information editor** | **P1 after dashboard gates** | Director can manage caregiver demographics; Owner can manage everyone within their owned org(s) | No role escalation; separate staff contact from Auth identity |
| **DATA-01 Bilal dummy accounts** | **P2 after dashboard gates** | 34 test Auth logins (including Owner/Director) and 12 patient subjects in production | Provision safely via Admin API, no mass emails; run only with idempotency, correct org, credential/seats/legal limits and rollbacks |
| **PATIENT-01 Full new-patient creation / proxy rollout** | **P2, after dashboard gates** | Full director intake and legal proxy account onboarding | Preserve current clinical/legal release gates |

**Enforcement:** Do not spend the next implementation increment on dummy account creation, new patient enrollment, clinician/representative seed scripts or patient creation forms. The next Codex/Claude implementation must close DASH-01 then DASH-02, not move on when only a dashboard mockup renders.

## DASH-01 Director acceptance — actual operational command center

Affected source: `src/pages/enterprise/OrganizationDirectorDashboard.tsx`, all existing org-scoped services and KPI queries, Director nav router.

1. Today's operational strip: scheduled visits, completed, in progress, missed/late, currently uncovered assignments, open incidents, current roster versus required visits. All values must come from authenticated active-org records and show as **unavailable/partial** if a query fails, never a fabricated zero.
2. **Staffing by hour**: for each hour from earliest through latest scheduled service window, compute number of required concurrent visits, assigned active caregivers, capacity gap and staff credential restrictions. Clear definition for fill rate = staffed required visit slots / total required visit slots; zero denominator displays 'Not applicable,' not 100%.
3. **At-risk operations**: missed visits, patient with no currently qualified assigned caregiver, late or unresolved incident, unreviewed care-plan change/acknowledgment, staff license/credential expiration (when actual source exists), with severity and source event time.
4. **Financial health**: verified organizational license/subscription state; show billing/claim/revenue KPIs only if a connected source actually provides them. Otherwise display 'Billing integration unavailable' with no invented dollars.
5. **Direct action**: every KPI, attention row and quick action must navigate to its relevant restricted record set, preserving correct organization, filter and browser back/forward. No decorative or inert cards.
6. **Reports**: only after operational data path works, export week's org-scoped KPI PDF/Excel with snapshot time, scope and documented calculation. Forecast only after enough validated history; do not predict from fake seed volumes.
7. **Error handling**: differentiate empty, loading, stale, inaccessible, partial and API error. In-place retry must not clear previously valid data while masquerading as success.

## DASH-02 Caregiver acceptance — mobile-first action hub

Affected source: `src/pages/enterprise/EnterpriseCaregiverDashboard.tsx` and visit/tasks/incidents/conversation services.

1. Top screen prioritizes urgent patient safety warnings, pending challenge acknowledgments, next scheduled visit, overdue tasks and new care-team messages; use actual assigned patient data only. Avoid organization finance and dense administrative charts.
2. Next-visit tile displays patient, local start/end, state, exact visit ID and address only when authorized; tap **Open Patient**, **Open Schedule**, **Call Office / Secure Message** and one-tap navigation to address if available. If unscheduled, do not imply a visit is due.
3. Visit verification displays true current backend `scheduled/in_progress/completed` state, actual clock-in/out action and receipt, location permission and required EVV evidence; never mark GPS verified without user consent and verified evidence. Retain applicable non-GPS exception path.
4. Task list shows visit-specific required items with patient-scoped care-plan context, due time, one-tap completion and server-receipted audit. Unauthorized task change fails. Medication reminders are not prescribing/administration authority.
5. Clinical notes, incident reports and care updates use actual authenticated writes. `Offline` status is not offline persistence: only claim offline-capable when encrypted durable draft queue, replay/idempotency, conflict resolution and explicit backend acknowledgment are tested.
6. Secure messaging: send, receive, read/acknowledge real patient-scoped messages without SMS/cross-patient leaks.
7. **Mobile accessibility:** test actual browser at widths 320, 375, 390, 430 and 768; 44×44px minimum interactive target, no horizontal scrolling, keyboard/screen-reader focus, high contrast, urgent alert prominence.
8. A caregiver sees *only* assigned and currently authorized patients; no patient creation action or organization-wide personnel list.

## DASH-03 to DASH-06 office acceptance

- **Organization Owner:** dedicated role overview, verified organization/site switcher, staffing, licensed seats, subscriptions/payment exceptions, agreements, compliance, Patients & Staff Management shortcuts; owner-only tenant scope and no Platform Owner privilege.
- **Medical:** assigned-patient clinical worklist, verified alerts and observations, clinical documentation, medication review ONLY if integrated and authorized, care-team conversations, credential warning. Explicit unavailable data state.
- **Therapist/PT:** session schedule, therapy goals, authorized patient progress data, documentation backlog and patient-scoped messages; separate specialty permissions.
- **Nutritionist:** diet/allergy/hydration-specific caseload and care-team messages, pending review and functional restrictions; do not activate without approved specialty entitlement.

All offices share audited, typed data-fetch primitives but not the same unfiltered screen, permissions or misleading metrics. The patient portal is **excluded** from this dashboard project and will later adopt the approved My Memoria Ally-inspired patient UX within Haneen's own identity and patient-subject authorization.

## Secondary scope — deferred but not abandoned

1. **Patient demographics:** owner within org can view/edit every person's authorized non-credential identity/contact details; Director can edit staff and patient details within org; active acknowledged caregiver can edit authorized demographic/contact details of their assigned patient. Sensitive legal name, DOB, verified login email and credential information require additional confirmation and auditing. This does not take precedence over dashboards.
2. **Dummy trial:** Latest instruction supersedes V4 exclusion. The Bilal test includes **Owner and Director**, giving 34 login targets: 1 Owner, 1 Director, 4 caregivers, 4 specialists, 12 independently authenticated patient candidates and 12 responsible persons. Use production as authorized synthetic environment, optionally no-email Auth Admin provisioning with secure passwords; **no direct SQL insertion into auth.users**, false clinician credentials, fake healthcare proxy legal verification, uncontrolled user email or secret logging.
3. **Clinical and specialty dependencies:** Acknowledgment and healthcare-proxy activation remain independent authorization gates; Complete specialist seat limit is 3 against desired 4. Dashboard review must not inadvertently authorize a fourth seat.

## EXACT EXECUTION / TEST GATES

**Implement in sequence:** DASH-01 -> independent Director browser+RBAC test -> DASH-02 -> independent Caregiver mobile and role test -> DASH-03 -> DASH-04 -> DASH-05 -> DASH-06. Only then enter PEOPLE-01/02 and DATA-01/PATIENT-01. For each gate, deliver commit SHA, changed files/functions, source query/aggregation formulas, authenticated real role evidence, error/empty-state tests, accessibility results and rollback instructions.

**Stop affected work on:** any wrong-patient or wrong-tenant PHI, destructive migration, false reported operational/financial metrics, fabricated EVV/clinical record, unauthorized role access, unverified patient proxy, credential falsehood, or rejected automated security test.

**Release:** Production dashboard deployment after successful typecheck/lint/unit/integration, independent direct-JWT RLS negative tests, authenticated browser/mobile acceptance and owner's deployment approval. Do not label current quick-action-navigation increment as a completed dashboard.

**Codex handoff:** Audit the live role dashboards and current feature-branch increment; implement DASH-01 and DASH-02 with real authenticated data and tested drilldowns before touching any patient account seeding. Continue DASH-03..06 as distinct role experiences. Report exact defects, implementation SHAs, tests that prove acceptance, and GO/NO-GO. Avoid generic planning text in place of changed code.
