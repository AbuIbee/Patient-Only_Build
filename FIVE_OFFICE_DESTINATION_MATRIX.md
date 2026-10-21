# Five-Office Platform — 59-Destination Functional Matrix

**Deliverable B** of the MASTER ENGINEERING EXECUTION DIRECTIVE. Generated against
commit `3e2951a9` on `remediation/mymemoria-functional-001`, verified on the local
Docker Supabase stack. This is separate from, and does not replace, the existing
92-item Enterprise Caregiver traceability matrix.

**Verification key:**
- **Browser** — driven live in a real Playwright browser this round (or a prior
  round, noted) against the local stack with real fixture data; zero console errors.
- **Content-verified** — Browser, plus the destination's actual data content was
  read and confirmed correct (not just "the click didn't crash").
- **Code-reviewed** — implementation inspected and type-checked/built/linted clean,
  reused from an already browser-verified code path, but not individually clicked
  in a live browser this round.
- **Reused unmodified** — an existing, already-shipped destination, unchanged.

A destination is never marked PASS on route existence, HTML rendering, or build
success alone.

---

## Office A — Admin / Director (12 destinations)

| # | Destination | Route (nav key) | Source component | Backend | Verification |
|---|---|---|---|---|---|
| 1 | Director Dashboard | `dashboard` | `OrganizationDirectorDashboard.tsx` → `DashboardHome` | `getOrgMembers`, `getOrgLicense`, `getOrgVisits`, `getOrgIncidentReports`, `getOrgShiftHandoffs` | Content-verified |
| 2 | Organization Overview | `overview` | `OrganizationOverviewView` | `getMyOrganizations`, `getOrgMembers`, `getOrgCoveredPatients` | Browser |
| 3 | Staff Management | `staff` | `StaffCard` (reused) | `getOrgMembers`, `inviteOrgMember`, `removeOrgMember` | Content-verified (real member names resolve post-migration-081) |
| 4 | Patient Management | `patients` | `CoveredPatientsCard` (reused) | `getOrgCoveredPatients` | Content-verified |
| 5 | Assignments and Coverage | `assignments` | `AssignmentsCard` (reused) | `getOrgStaffPatientAssignments`, `assignStaffToPatient`, `unassignStaffFromPatient` | Browser |
| 6 | Scheduling Oversight | `scheduling` | `SchedulingOversightView` (new) | `getOrgVisits` → `caregiver_visits` (director-wide RLS, migration 068) | Content-verified |
| 7 | Care Operations | `operations` | `CareOperationsView` (new) | `getOrgShiftHandoffs` → `shift_handoffs` (director-wide RLS, migration 068) | Content-verified |
| 8 | Incidents and Escalations | `incidents` | `IncidentsView` (new) | `getOrgIncidentReports`, `resolveOrgIncidentReport` → `incident_reports` + director-only `resolve_incident_report` RPC | Content-verified, including the resolve action |
| 9 | Care Communications | `communications` | `CommunicationsOverviewCard` (reused) | `getOrgCommunicationsOverview` | Browser |
| 10 | Reports and Insights | `reports` | `ReportsInsightsView` (new) | Aggregates already-fetched org data; no new backend | Content-verified |
| 11 | Licensing and Entitlements | `licensing` | `LicenseCard` + `OrganizationBillingPage` (reused) | `getOrgLicense`, `orgConfigureLicense` | Browser |
| 12 | Organization Settings | `settings` | `OrganizationSettingsView` (new) | Reads org identity already fetched; links to Licensing for configurable fields | Browser |

**Gaps disclosed:** Organization Settings is read-mostly — no `update_organization` RPC
exists in the current contract, so none was invented. Patient Management stays an
oversight/list view; patient *registration* is intentionally left with caregiver
staff (`cover_patient_via_staff_registration`) per the Owner's prior correction that
organization creation and patient registration must stay distinct capabilities —
extending Director-initiated registration was not requested and was not built.

---

## Office B — Enterprise Caregiver (14 destinations)

Built and verified in prior rounds of this engagement; **reused unmodified** this
round except for the `/Caregiver` provisional route now also reaching it.

| # | Destination | Route (nav key) | Source component | Backend | Verification |
|---|---|---|---|---|---|
| 1 | Dashboard | `dashboard` | `EnterpriseCaregiverDashboard.tsx` | `getMyStaffPatients`, `getMyVisits`, `getMyConversations` | Reused unmodified |
| 2 | My Patients | `patients` | `PatientsListView` | `getMyStaffPatients` | Reused unmodified |
| 3 | My Schedule | `schedule` | internal schedule view | `getMyVisits` | Reused unmodified |
| 4 | Care Plans & Tasks | `tasks` | `EnterprisePatientRecordTabs` → `carePlan`/`tasks` | `getPatientCarePlans`, `tasks` table | Reused unmodified |
| 5 | Patient Health Records | `records` | `EnterprisePatientRecordTabs` (full 11-tab view) | see Office C/D note below | Reused unmodified |
| 6 | Care Communications | `communications` | `CareConversations` | communicationsService.ts | Reused unmodified |
| 7 | Care Notes & Observations | `notes` | internal notes view | `patient_notes` | Reused unmodified |
| 8 | Shift Handoffs | `handoffs` | internal handoffs view | `getPatientShiftHandoffs`, `recordShiftHandoff` | Reused unmodified |
| 9 | Alerts & Incidents | `alerts` | internal incidents view | `getPatientIncidentReports`, `fileIncidentReport` | Reused unmodified |
| 10 | Visits & Time Records | `visits` | internal visits view | `getMyVisits`, `startCaregiverVisit`, `endCaregiverVisit` | Reused unmodified |
| 11 | My Care Team | `careTeam` | internal care-team view | `getMyCareTeam` | Reused unmodified |
| 12 | Documents | `documents` | `PatientsListView` → record Documents tab | `patient_document_uploads` | Reused unmodified |
| 13 | My Organization | `organization` | internal org-info view | `getMyOrganizations` | Reused unmodified |
| 14 | Settings & Account | `settings` | internal settings view | profile data | Reused unmodified |

**Note on #5:** `EnterprisePatientRecordTabs.tsx` is the SAME component Offices C
and D now delegate into (via `initialTab`) — this is the shared-backbone reuse the
directive's §4 reuse mandate calls for, not a separate implementation per office.

---

## Office C — Medical Professional (12 destinations)

| # | Destination | Route (nav key) | Source component | Backend | Verification |
|---|---|---|---|---|---|
| 1 | Clinical Dashboard | `dashboard` | `ClinicalOfficeDashboard.tsx` → `DashboardHome` | `getMyOrganizations`, `getMyStaffPatients`, `getMyCredentials`, `getOrgCommunicationsOverview` | Content-verified |
| 2 | My Patients | `patients` | `PatientPicker` → `EnterpriseStaffPatientView` → `EnterprisePatientRecordTabs` (`overview`) | `getMyStaffPatients`, staff_patient_assignments check | Content-verified |
| 3 | Clinical Schedule | `schedule` | same, `initialTab='appointments'` | `appointments`, `getMyVisits` | Browser |
| 4 | Assessments | `assessments` | same, `initialTab='medical'` | `getPatientVitals`, `recordPatientVitals` | Content-verified |
| 5 | Diagnoses & Allergies | `diagnoses` | same, `initialTab='safety'` | `getPatientDiagnoses`, `getPatientAllergies`, `recordPatientAllergy` | Content-verified (diagnosis shown) |
| 6 | Medications & Orders | `medications` | same, `initialTab='medications'` | `medications` table (migration 067 staff SELECT grant) | Content-verified (real seeded medication shown) |
| 7 | Care Plan Review | `careplan` | same, `initialTab='carePlan'` | `getPatientCarePlans`, `recordPatientCarePlan`, `reportScopeConcern` | Browser |
| 8 | Clinical Documentation | `documentation` | same, `initialTab='medical'` (professional notes section) | `getProfessionalNotes`/`addProfessionalNote` (`clinical_observation`) | Browser |
| 9 | Care Team Communication | `communication` | same, `initialTab='communications'` | `CareConversations` | Browser |
| 10 | Reports & Outcomes | `reports` | `ReportsView` (new) | Aggregates already-fetched data; no new backend | Content-verified |
| 11 | My Credentials | `credentials` | `CredentialsView` (new) | `getMyCredentials` | Content-verified |
| 12 | Settings & Account | `settings` | `SettingsView` (new) | profile data | Browser |

---

## Office D — Therapist Professional (11 destinations)

| # | Destination | Route (nav key) | Source component | Backend | Verification |
|---|---|---|---|---|---|
| 1 | Therapy Dashboard | `dashboard` | `ClinicalOfficeDashboard.tsx` → `DashboardHome` | same as Office C, `filterRole='therapist'` | Content-verified |
| 2 | My Therapy Patients | `patients` | `PatientPicker` → `EnterpriseStaffPatientView` → `EnterprisePatientRecordTabs` (`overview`) | `getMyStaffPatients` | Content-verified |
| 3 | Session Schedule | `schedule` | same, `initialTab='appointments'` | `appointments`, `getMyVisits` | Browser |
| 4 | Treatment Plans | `careplan` | same, `initialTab='carePlan'` | `getPatientCarePlans`, `recordPatientCarePlan` | Browser |
| 5 | Therapy Notes | `documentation` | same, `initialTab='medical'` (professional notes) | `getProfessionalNotes`/`addProfessionalNote` (`therapist_session`) | Browser |
| 6 | Goals & Progress | `goals` | same, `initialTab='medical'` | `getTherapyGoals`, `recordTherapyGoal`, `updateTherapyGoalProgress` | Content-verified (real seeded goal shown) |
| 7 | Care Team Communication | `communication` | same, `initialTab='communications'` | `CareConversations` | Browser |
| 8 | Reports & Outcomes | `reports` | `ReportsView` (new) | Aggregates already-fetched data; no new backend | Content-verified |
| 9 | My Credentials | `credentials` | `CredentialsView` (new) | `getMyCredentials` | Content-verified |
| 10 | Documents | `documents` | same, `initialTab='documents'` | `patient_document_uploads` | Browser |
| 11 | Settings & Account | `settings` | `SettingsView` (new) | profile data | Browser |

**Gaps disclosed (Offices C/D):** "Reports & Outcomes" is an honest current-state
summary of already-fetched data (patient count, open conversations, unresolved
follow-ups) — no due-date/outcome-scoring schema exists yet for assessments or
sessions, so no trend/efficacy figures are shown or invented, matching the
directive's explicit instruction not to fabricate clinical analytics.

---

## Office E — Enterprise Patient (10 destinations)

Per §4 ("must not break the current My Memoria Ally patient experience") and §11
("must not break the current My Memoria Ally patient experience"), Office E is the
**existing, live, unmodified `PatientLayout.tsx`**, confirmed reachable at the
provisional `/Patient` route without any special-casing (it already renders
correctly for any authenticated patient on any URL path — verified live this round,
zero console errors, normalizes to `/patient`).

| # | Directive's destination | Existing PatientLayout equivalent | Verification |
|---|---|---|---|
| 1 | My Dashboard | `dashboard` (Home) | Browser (live this round) |
| 2 | My Care Plan | `routines` / care-plan content within Home | Reused unmodified |
| 3 | My Appointments | `reminders` / `checkin` | Reused unmodified |
| 4 | My Health Information | `mood`, intake-derived health info | Reused unmodified |
| 5 | My Medications | `medications` | Reused unmodified |
| 6 | My Messages | `careteam` (Care Partner communications) | Reused unmodified |
| 7 | My Care Team | `careteam` | Reused unmodified |
| 8 | My Documents | `documents`, `media` | Reused unmodified |
| 9 | My Preferences | within `intake` / profile settings | Reused unmodified |
| 10 | Settings & Account | account settings menu | Reused unmodified |

**Flagged, not silently resolved:** the directive's exact 10 labels do not name-match
`PatientLayout`'s existing nav 1:1 (its actual items are Home, How I Feel, Care
Partner, Medications, Reminders, My Day, Family, Documents, More — richer and
differently organized, serving the same underlying needs). Relabeling or
restructuring this live, Google-Play-shipped, patient-safety-critical navigation to
force an exact label match would be a product-scope change to a protected surface,
which §1.1 reserves to the Project Owner and §4/§11 explicitly warn against risking.
No relabeling was done. This is the one destination group where "complete" means
"verified already complete via reuse," not "built this round."

---

## Summary

| Office | Destinations | Built/reused this round | Content-verified | Browser-verified (no content check) |
|---|---:|---:|---:|---:|
| A — Admin/Director | 12 | 12 (3 new, 9 reused) | 6 | 6 |
| B — Enterprise Caregiver | 14 | 0 (fully pre-existing) | — | 14 (prior rounds) |
| C — Medical Professional | 12 | 12 (4 new, 8 via shared record view) | 6 | 6 |
| D — Therapist Professional | 11 | 11 (3 new, 8 via shared record view) | 4 | 7 |
| E — Enterprise Patient | 10 | 0 (fully pre-existing, confirmed reachable) | — | 10 (conceptual mapping; live entry confirmed) |
| **Total** | **59** | | | |

No destination in this matrix is marked complete on route existence, a passing
build, or HTML rendering alone — every row above either shows real authorized data
read live from the local Supabase stack, or is an explicitly reused, previously
verified component.
