# Five-Office Platform — Implementation Inventory (Deliverable C)

## Commits this engagement phase (newest first, on `remediation/mymemoria-functional-001`)

| Commit | Summary |
|---|---|
| `4b42471e` | Office switcher for users holding multiple offices |
| `e144facd` | Deliverable B — 59-destination functional matrix |
| `3e2951a9` | Office A (Admin/Director) rebuilt on the approved visual system, 12 destinations; director profile/patient visibility RLS fix (migration 081) |
| `a7c18b63` | Offices C/D (Medical/Therapist) built; provisional `/Admin` `/Caregiver` `/Medical` `/Therapy` routes |
| `78cc9855` | (prior phase) Owner Correction: org creation restricted to Director-only |

## Files changed or added this phase

**New files:**
- `src/pages/enterprise/EnterpriseOfficeShell.tsx` — shared sidebar/header/mobile-drawer shell
- `src/pages/enterprise/ClinicalOfficeDashboard.tsx` — Offices C/D
- `src/services/organizationDirectorOpsService.ts` — Office A's org-wide reads
- `supabase/migrations/081_r8_director_profile_and_patient_visibility.sql`
- `FIVE_OFFICE_DESTINATION_MATRIX.md`, `FIVE_OFFICE_ARCHITECTURE_REPORT.md`,
  `FIVE_OFFICE_ROLE_AUTHORIZATION_MATRIX.md`, `FIVE_OFFICE_SECURITY_REGRESSION_REPORT.md`
  (this and the three preceding documents — Deliverables A/B/D/G)

**Modified files:**
- `src/App.tsx` — provisional five-office routes, reusing the existing resolver
- `src/pages/enterprise/EnterpriseDashboardRouter.tsx` — office switcher; `ClinicalOfficeDashboard` wired in place of `StaffCaseloadDashboard`
- `src/pages/enterprise/OrganizationDirectorDashboard.tsx` — rewritten onto the shared shell, 12 destinations
- `src/pages/enterprise/EnterprisePatientRecordTabs.tsx` — additive `initialTab` prop
- `src/pages/enterprise/EnterpriseStaffPatientView.tsx` — comment correction only (no behavior change)
- `src/services/patientClinicalRecordService.ts` — added `getPatientMedications()`

**Deleted files:**
- `src/pages/enterprise/StaffCaseloadDashboard.tsx` — superseded, confirmed unused

## Reused, unmodified services/components (no new code)

`organizationService.ts` (all pre-existing exports), `enterpriseCaregiverWorkToolsService.ts`,
`professionalNotesService.ts`, `communicationsService.ts`, `CareConversations.tsx`,
`EnterpriseCaregiverDashboard.tsx` (Office B, entirely untouched), `PatientLayout.tsx`
(Office E, entirely untouched), `StaffCard`/`CoveredPatientsCard`/`AssignmentsCard`/
`LicenseCard`/`CommunicationsOverviewCard`/`OrganizationBillingPage`/`CreateOrgCard`
(all pre-existing, inside `OrganizationDirectorDashboard.tsx`).

## New backend surface (migration 081 only)

Two new SELECT RLS policies, no new tables, no new RPCs:
1. `profiles` — visible to an active org director sharing an active organization
   membership with the target user.
2. `patients` — visible to an active org director of an org with an active
   `covered_patient_memberships` row for that patient.

Both close a confirmed pre-existing defect (director-scoped embedded-select joins
silently returning null names) rather than grant new authority — the director
could already retrieve the same names through `get_org_members()`'s RPC.

## Architectural decisions made, with rationale

1. **One shared shell (`EnterpriseOfficeShell`), not five.** Extracted from the
   already-proven Caregiver dashboard pattern rather than duplicated per office.
2. **`EnterpriseCaregiverDashboard.tsx` NOT refactored onto the new shell.**
   Large, already shipped, already independently verified; forcing a refactor for
   visual consistency alone risked regressing working functionality for no
   functional gain. Flagged as a deferred decision (Deliverable J).
3. **One shared `ClinicalOfficeDashboard`, parameterized by role, for Offices C/D**,
   rather than two near-duplicate components — mirrors the pre-existing
   `StaffCaseloadDashboard` pattern at much higher fidelity, resolving the
   §4-reuse-vs-§9/§10-richness tension identified early in this work.
4. **Patient-record destinations reuse `EnterprisePatientRecordTabs` via
   `initialTab`**, rather than building separate flat pages per destination —
   avoids five parallel re-implementations of an already-correct, already-tested
   11-tab clinical record view.
5. **Office E reused entirely unmodified.** See Deliverable A §5 and Deliverable J
   for the blocked-verification reasoning (missing five-office composite image).
6. **Office switcher is session-local state, not persisted.** No requirement calls
   for cross-session persistence, and persisting a "last selected office" would be
   a new piece of client-trusted state with no corresponding backend concept —
   avoided as unnecessary surface.
