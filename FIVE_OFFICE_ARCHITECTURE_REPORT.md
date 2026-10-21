# Five-Office Platform — Architecture and Authorization Report (Deliverable A)

Commit `4b42471e` on `remediation/mymemoria-functional-001`, continuing through this
round's additional commits (see Deliverable I for the final commit list).

## 1. The office-context model (§6)

Six concepts are kept independent throughout this implementation, never conflated
into one role flag:

| Concept | Where it lives | Example |
|---|---|---|
| Authenticated identity | `auth.users` / `profiles` | `auth.uid()` |
| Office eligibility | `organization_memberships.org_role` (director/therapist/medical_professional/caregiver), or `profiles.role = 'patient'` for Office E, or `profiles.role = 'admin'` for the unrelated platform superadmin panel | a row existing at all |
| Organization membership | `organization_memberships.status = 'active'` | the same row's status column |
| Patient assignment / relationship | `staff_patient_assignments` (staff offices), `covered_patient_memberships` (org-wide coverage), `caregiver_patients` (residential) | a separate table per relationship type, never inferred from office eligibility |
| Feature-specific permission | individual RLS policies and SECURITY DEFINER RPCs (e.g. `is_active_org_director()`, the `note_type`-gated `patient_notes` policies, `resolve_incident_report`'s director-only check) | enforced server-side, independent of what the frontend shows |
| Current organizational/patient context | component-local React state (`organizationId` props, `openPatient` state) — never a global "current office" flag persisted anywhere the backend trusts | `ClinicalOfficeDashboard`'s `openPatient` state |

No destination in any office infers organization membership from the mere existence
of a patient record, and no destination infers clinical/professional authority from
which office tab the frontend happens to be showing — every data read and write
still goes through the same RLS/RPC layer regardless of which office UI reached it.

## 2. Office resolution (how a signed-in user ends up on an office)

`EnterpriseDashboardRouter.tsx` is the single resolver for every org-based office
(A/B/C/D). It:

1. Loads the real `organization_memberships` rows for the signed-in user
   (`getMyOrganizations()`), never caching or trusting a client-asserted role.
2. Computes `availableOffices` — every office the user currently, actively holds.
3. Resolves a default via priority order (director > therapist > medical >
   caregiver) — unchanged behavior for the overwhelming majority of users who hold
   exactly one office.
4. If the user holds more than one, shows the office switcher (added this round);
   selecting a pill only changes which already-authorized branch renders — it does
   not call any new backend function and confers no new privilege.
5. Provisional routes `/Admin`, `/Caregiver`, `/Medical`, `/Therapy` (and the
   existing `/business`) all enter this exact same resolver with
   `businessWorkspace={true}` — none of them independently decides which office to
   show. Typing `/Medical` with no `medical_professional` membership does not grant
   Medical access; the resolver still falls through to whatever office (or
   no-organization state) the user's real memberships justify.

Office E (Patient) is resolved entirely separately, by the pre-existing
`state.selectedRole === 'patient'` switch in `App.tsx` — unchanged, and
deliberately NOT routed through the organization resolver, since a patient has no
`organization_memberships` row at all.

The platform superadmin panel (`AdminLayout`, `profiles.role = 'admin'`) is a THIRD,
unrelated resolution path, also unchanged. See §4 below for why `/Admin` (the
five-office provisional path) does not collide with it.

## 3. Shared presentation foundation

`EnterpriseOfficeShell.tsx` (new this round) is the single shared shell — sidebar,
header, mobile drawer, logout — used by Offices A, C and D. Office B
(`EnterpriseCaregiverDashboard.tsx`) implements the identical visual pattern
independently (it predates the shell and was not refactored onto it this round, to
avoid risking regression in a large, already-verified, already-shipped component —
see Deliverable J for this as a flagged, deferred decision). Office E does not use
this shell at all (see §5).

Within each office, destinations reuse components wherever a suitable one already
exists:
- `EnterprisePatientRecordTabs.tsx` (the 11-tab patient record: Overview, Medical,
  Medications, Tasks, A–G, Care Plan, Appointments, Documents, Safety,
  Communications, Timeline) now backs Office B's "Patient Health Records" AND
  Office C's five record-reading destinations AND Office D's four record-reading
  destinations, via an `initialTab` prop added this round — one implementation,
  three offices, not three parallel builds.
- `StaffCard`, `CoveredPatientsCard`, `AssignmentsCard`, `LicenseCard`,
  `CommunicationsOverviewCard`, `OrganizationBillingPage` (all pre-existing) back
  seven of Office A's twelve destinations unchanged.
- `CareConversations` backs the "Care Team/Care Communications" destination in
  every office that has one.

## 4. Admin/Director vs. platform superadmin — reviewed and confirmed non-conflicting

Flagged in a prior round's report and re-reviewed per this round's explicit
instruction. Two genuinely different concepts share the English word "Admin":

- **Platform superadmin** (`profiles.role = 'admin'`): global, cross-organization
  authority — `AdminLayout`, `src/pages/admin/*`, `src/pages/admin/accountTypes.ts`.
  Managed by `profiles.role`, never by `organization_memberships`.
- **Organization Director** (five-office "Office A"): authority scoped to exactly
  one organization — `organization_memberships.org_role = 'director'`. A director's
  `profiles.role` stays `'caregiver'` (confirmed in `EnterpriseDashboardRouter.tsx`'s
  own header comment, unchanged from prior rounds): "profiles.role stays
  'caregiver' for every one of these people... organization authority is entirely
  additive, read fresh from organization_memberships on every load, never cached in
  the global account role."

Confirmed this round, not merely asserted: `isFiveOfficeRoute` in `App.tsx` only
intercepts rendering when `state.selectedRole === 'caregiver'`. A real platform
superadmin (`selectedRole === 'admin'`) hitting `/Admin` falls through the
five-office block untouched and still reaches the ordinary
`switch(state.selectedRole)` → `<AdminLayout />`. No new route, policy, or RPC
grants director authority to a superadmin or superadmin authority to a director.
The only residual issue is the shared English word in the URL/menu vocabulary,
which is a naming question for the Owner/Senior Architect, not an authorization
defect — restated in Deliverable J.

## 5. Office E — deliberate reuse, not a parallel build

Office E is `src/pages/patient/PatientLayout.tsx`, completely unmodified. This was
a deliberate architectural decision, not an oversight:

- §4/§11 of the governing directive explicitly require that the existing, live,
  Google-Play-shipped patient experience must not be broken, and that greenfield
  rebuilding is prohibited where a production-capable implementation exists.
- §5 requires inspecting the actual "approved five-office composite design"
  containing all five dashboards before claiming visual fidelity. That asset has
  been searched for again this round (every `.png`/`.jpg` under the user's
  Downloads folder, by modification date) and still cannot be located — only the
  single Caregiver-dashboard reference image exists on disk
  (`ChatGPT Image Oct 21, 2026, 04_35_31 PM.png`, confirmed in a prior round to
  match `EnterpriseCaregiverDashboard.tsx` pixel-for-pixel in structure).
- Restyling `PatientLayout.tsx` onto the `ent-*` forest-green/cream palette without
  that reference would mean inventing a patient-facing visual design never actually
  approved by the owner, on a surface explicitly called out as protected. That is a
  real risk this report declines to take speculatively.

This is recorded as a **blocked verification**, not a silent gap: Office E's visual
alignment with the other four offices cannot be completed or honestly verified
until the owner supplies the actual five-office composite image, or explicitly
approves proceeding without it. See Deliverable J.

What WAS done and verified this round: confirmed `/Patient` reaches the real,
live `PatientLayout` with zero special-casing and zero console errors (Deliverable
F), and that none of this round's five-office routing changes alter its behavior in
any way — `isFiveOfficeRoute`'s regex deliberately excludes `/patient`.

## 6. Components introduced this round

| File | Role |
|---|---|
| `src/pages/enterprise/EnterpriseOfficeShell.tsx` | Shared sidebar/header/mobile-drawer shell for Offices A, C, D |
| `src/pages/enterprise/ClinicalOfficeDashboard.tsx` | Office C (Medical) + Office D (Therapist), role-parameterized |
| `src/services/organizationDirectorOpsService.ts` | Org-wide reads for Office A (visits, incidents, handoffs) |
| `src/services/patientClinicalRecordService.ts` (`getPatientMedications`) | Added read for the existing `medications` table |
| `src/pages/enterprise/OrganizationDirectorDashboard.tsx` | Rewritten in place onto the shell + 12 destinations |
| `src/pages/enterprise/EnterpriseDashboardRouter.tsx` | Office switcher added; resolver logic otherwise unchanged |
| `src/pages/enterprise/EnterprisePatientRecordTabs.tsx` | `initialTab` prop added (additive, backward compatible) |
| `supabase/migrations/081_r8_director_profile_and_patient_visibility.sql` | Director-scoped `profiles`/`patients` SELECT RLS (see Deliverable G) |

`src/pages/enterprise/StaffCaseloadDashboard.tsx` was deleted — superseded by
`ClinicalOfficeDashboard.tsx`, confirmed unused by any remaining import or test.
