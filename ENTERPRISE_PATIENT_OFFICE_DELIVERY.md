# Enterprise Patient Office — Delivery Report

Targeted corrective directive: complete Office E (Enterprise Patient) to match
the shared Enterprise visual system, without touching the other four offices.

## 1. Starting and final commit

- **Starting HEAD:** `2776549d` (verified before starting)
- **Final commit:** see `git log -1` on `remediation/mymemoria-functional-001` after this report is committed

## 2. Note on the approved design reference

The directive references "the five-office composite image supplied by the
Project Owner" with the Patient Office in its bottom-right section. No image was
received as part of this directive's message, and a fresh search of
Downloads/Desktop/Documents (by file modification time) found no new asset since
the prior round's search — only the single Caregiver-dashboard reference image
exists on disk (confirmed in an earlier round to be the same image already
matching `EnterpriseCaregiverDashboard.tsx`).

Rather than invent a design or stop entirely, this implementation worked from
the directive's own exhaustive textual specification (§4's exact header/greeting/
four-card/four-panel layout, §5's exact 10-destination list) plus the directive's
own explicit instruction to use "the same shared Enterprise visual system as the
Caregiver Office" — i.e., the already-approved, already-implemented
`EnterpriseOfficeShell`/`ent-*` design system used by Offices A, C, and D. This
is recorded as a continuing, not-yet-resolved gap: pixel-level fidelity against
the actual composite image's Patient cell has not been verified, because that
image was not available. See `FIVE_OFFICE_OWNER_DECISION_REGISTER.md` item 1,
which already covers this exact gap.

## 3. Files changed

**New files:**
- `src/pages/patient/EnterprisePatientRouter.tsx` — resolver: checks real Enterprise coverage via `is_my_enterprise_coverage_active()`, renders the new office or the existing `PatientLayout` unchanged
- `src/pages/patient/EnterprisePatientDashboard.tsx` — the new Office E, built on `EnterpriseOfficeShell`
- `src/services/enterprisePatientService.ts` — patient-self-scoped reads (org context, Enterprise care team, appointments, visits)
- `supabase/migrations/082_r9_enterprise_patient_office.sql` — 2 new patient-self RLS policies + 2 new SECURITY DEFINER RPCs

**Modified files:**
- `src/App.tsx` — `case 'patient':` now renders `EnterprisePatientRouter` instead of `PatientLayout` directly (the `isTrustedTempUserProgram` branch and the `default:` fallback are both left untouched, still `PatientLayout` directly)
- `src/pages/patient/PatientCareTeam.tsx` — extended (additively) to also show Enterprise `staff_patient_assignments`-based team members, not just residential `caregiver_patients`/`therapist_relationships` ones; reused by both the existing individual patient app and the new Office E

**Not touched at all:** `EnterpriseOfficeShell.tsx`, `ClinicalOfficeDashboard.tsx`, `OrganizationDirectorDashboard.tsx`, `EnterpriseCaregiverDashboard.tsx`, `EnterpriseDashboardRouter.tsx`, every file under `src/pages/patient/` other than the two listed above, and `PatientLayout.tsx` itself.

## 4. Patient route and navigation map

`/Patient` → `EnterprisePatientRouter` → `is_my_enterprise_coverage_active()`:

| Coverage | Renders |
|---|---|
| Not Enterprise-covered (the default — every existing user today) | `PatientLayout`, byte-for-byte unchanged |
| Actively Enterprise-covered | `EnterprisePatientDashboard` (new) |

The route itself grants nothing — confirmed live: this is a real RPC check
against the database, not a URL-based decision.

| # | Destination | Nav key | Source |
|---|---|---|---|
| 1 | My Dashboard | `dashboard` | New `DashboardHome` — 4 metrics, 4 panels |
| 2 | My Care Plan | `careplan` | New — `getPatientCarePlans` + `tasks` table (existing patient-self RLS) |
| 3 | My Appointments | `appointments` | New — `appointments` (new patient-self RLS) + `caregiver_visits` (new patient-self RLS) |
| 4 | My Health Information | `health` | New — `getPatientDiagnoses`/`getPatientAllergies`/`getPatientVitals` (existing `has_patient_access()` already includes patient-self) |
| 5 | My Medications | `medications` | Reused verbatim — `PatientMedications.tsx` |
| 6 | My Messages | `messages` | Reused verbatim — `CareConversations` |
| 7 | My Care Team | `careteam` | Reused, extended — `PatientCareTeam.tsx` (now also shows Enterprise staff) |
| 8 | My Documents | `documents` | Reused verbatim — `PatientDocuments.tsx` |
| 9 | My Preferences | `preferences` | New — `getCarePreferences`/`recordCarePreference` (existing patient-self RLS) |
| 10 | Settings & Account | `settings` | New — minimal account view, matching the pattern used for Offices A/C/D |

Every destination opens its own functional page with real backend data — none
render an identical generic panel.

## 5. Existing patient functionality preserved

Verified live (not asserted): an ordinary, non-Enterprise-covered patient signing
in still reaches the exact existing `PatientLayout` — same nav (Home, How I Feel,
Care Partner, Medications, Reminders, My Day, Family, Documents, More), same
"Free Plan"/"Paid Plan" labeling, zero console errors, zero visual or functional
change. `PatientLayout.tsx` itself was not edited.

## 6. Pre-existing gaps found and fixed as part of this work (inspection required
   by the directive's own §6 before writing navigation)

Before writing any new navigation, the existing patient-self RLS surface was
inspected directly (not assumed). Two confirmed gaps were found and closed,
narrowly:

1. `appointments` had caregiver- and staff-based SELECT policies but no
   patient-self policy — a patient could never read their own appointments row.
2. `caregiver_visits` had caregiver-self and director-org policies but no
   patient-self policy.

Both fixed with the exact minimal `patient_id = auth.uid()` shape already
established by migration 004 for medications/tasks/mood_entries/the `patients`
table itself — not a new pattern, the same one extended to two tables it had
never reached.

Two new, narrow SECURITY DEFINER RPCs were added rather than broad new `profiles`/
`organizations` RLS grants, reusing `is_patient_enterprise_covered()` (already the
single source of truth `is_my_enterprise_coverage_active()` relies on) so this
can never disagree with what `SubscriptionContext.tsx` already shows a patient.

A third defect was found during live verification, not inspection: `state.patient`
(used for the greeting's display name) is only ever populated by `PatientLayout`'s
own mount effect, which this office never renders — the greeting silently showed
the account's raw `profiles.first_name` placeholder instead of the patient's real
preferred name. Fixed with a small, local, additive fetch of the `patients` row
(already patient-self readable) inside `EnterprisePatientDashboard` itself.

## 7. Functional test results (local Docker Supabase stack)

- Regular (non-Enterprise) patient: reaches unchanged `PatientLayout`, zero errors. ✅
- Enterprise-covered patient (real fixture "Evelyn"): all 10 destinations clicked through live, zero errors, real data confirmed at each (real appointment "Cardiology Follow-up", real care plan text, real diagnosis "Mild hypertension", 2 real assigned staff, 2 real outstanding tasks). Greeting correctly reads "Good evening, Evelyn." using the patient's real preferred name. ✅
- Director office (unrelated, pre-existing office): re-verified live, all 12 destinations still present, zero errors — confirms no regression from this round's changes. ✅

## 8. Backend and security test results

4/4 targeted checks, run live against the local stack with the Enterprise-patient
fixture's own token:

| Check | Result |
|---|---|
| `get_my_enterprise_organization()` returns exactly the caller's own org, nothing else | PASS |
| Patient cannot read another patient's row via `/rest/v1/patients` | PASS |
| Patient cannot read `organization_memberships` directly (director/staff-only data) | PASS |
| `get_my_enterprise_care_team()` returns only this patient's own assigned staff | PASS |

Plus the full existing regression gate, re-run after all changes: `tsc --noEmit`
(clean), `eslint` (0 errors), 377/377 unit tests, 21/21 integration tests
(unaffected, confirming no regression to the existing security test suite),
production build (clean).

## 9. Visual regression results for the four unchanged offices

Director office re-screenshotted live and confirmed structurally and visually
identical: all 12 destinations present, same visual system, zero errors. No
source file belonging to any of the other three offices (Caregiver, Medical,
Therapist) or their shared shell was modified this round — confirmed by `git
diff --stat`, not merely asserted — so no regression is possible there by
construction, and a live spot-check on one of the four (Director) was performed
as the directive requires.

## 10. Responsive verification

| Viewport | Horizontal overflow | Notes |
|---|---|---|
| 1440px desktop | None | `patient_office_evidence/02_desktop_1440.png` |
| 1024px tablet | None | `patient_office_evidence/03_tablet_1024.png` |
| 768px tablet | None | `patient_office_evidence/04_tablet_768.png` |
| 390px mobile | None | `patient_office_evidence/05_mobile_390.png` |
| 320px narrow mobile | None | `patient_office_evidence/06_mobile_320.png` |

All 10 destinations remain reachable via the mobile drawer at 390px (screenshot:
`07_mobile_390_drawer.png`), matching the same drawer pattern already
proven for Offices A/C/D.

## 11. Remaining discrepancies

1. **Pixel-level fidelity against the actual approved composite image is
   unverified** — the asset was not supplied and could not be located (§2
   above). The implementation follows the directive's own detailed textual
   layout spec and reuses the already-approved shared visual system instead.
2. **"My Health Information" is read-only** — the directive does not specify
   patient-editable health records, and none was built; this matches the pattern
   used for the equivalent destinations in Offices C/D.
3. `is_my_enterprise_coverage_active()` fails closed (defaults to the existing
   `PatientLayout`) on any RPC error — intentional, but means a transient network
   error would briefly show the old experience instead of the new one rather than
   an error state; judged acceptable given this is the safer failure direction for
   a patient-safety application.

