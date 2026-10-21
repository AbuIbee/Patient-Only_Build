# Five-Office Platform — Role and Authorization Matrix (Deliverable D)

Which office may Read (R) / Create (C) / Modify (M) / Approve-or-Resolve (A) /
Revoke (X) / Administer (D=director-only) each domain. Every cell below is backed
by an actual RLS policy or SECURITY DEFINER RPC — none is a frontend-only
restriction. "—" means no access; the frontend never offers the control, and the
backend independently rejects the attempt.

| Domain | Admin/Director (A) | Caregiver (B) | Medical (C) | Therapist (D) | Patient (E) |
|---|---|---|---|---|---|
| Organization creation | D (only when the caller holds zero existing active memberships anywhere — migration 080) | — | — | — | — |
| Organization settings/identity | R | — | — | — | — |
| Staff invite/remove | D (`invite_org_member`, `remove_org_member`) | — | — | — | — |
| Patient coverage (org-wide) | R | C (`cover_patient`/`cover_patient_via_staff_registration`), R (own org) | R (assigned only) | R (assigned only) | R (self only) |
| Staff-to-patient assignment | D (`assign_staff_to_patient`/`unassign_staff_from_patient`) | R (own assignments) | R (own assignments) | R (own assignments) | — |
| Diagnoses/Allergies | R (via staff visibility fix, migration 081, scoped to covered patients) | C, R (assigned) | C, R (assigned) | C, R (assigned) | R (own, read-only) |
| Medications | R (via migration 067/081) | R (assigned) | R (assigned) | R (assigned) | R (own, read-only) |
| Vitals/Assessments | — (not in Director's destination set) | C, R (assigned) | C, R (assigned) | — (not a therapist destination) | R (own) |
| Care Plans | R (aggregate, via covered patients) | C, R (assigned) | C/Approve, R (assigned) | C/Approve, R (assigned) | R (own, read-only) |
| Therapy Goals | — | R (assigned) | C, R (assigned) | C, R (assigned) | — |
| Professional/Clinical Notes | — | — (caregiver notes use a different `note_type`) | C (`clinical_observation`), R own-authored + assigned | C (`therapist_session`), R own-authored + assigned | — |
| Visits/Schedule | R (org-wide, migration 068) | C/M (`scheduleCaregiverVisit`/`startCaregiverVisit`/`endCaregiverVisit`), R (own) | R (assigned, via `appointments`) | R (assigned, via `appointments`) | R (own) |
| Shift Handoffs | R (org-wide, migration 068) + A (acknowledge) | C, R (assigned) | — | — | — |
| Incident Reports | R + **A (resolve, director-only RPC)**, org-wide | C (file), R (assigned) | — | — | — |
| Care Communications (conversations) | R (aggregate counts only — never message content for a conversation the director wasn't added to) | C/R (assigned) | C/R (assigned) | C/R (assigned) | C/R (own) |
| Credentials | R (org-wide, `get_org_staff_credentials`) + C (`record_staff_credential`) | R (own, `get_my_credentials`) | R (own) | R (own) | — |
| Documents (`patient_document_uploads`) | — (not in Director's destination set) | C/R (assigned) | R (assigned) | R (assigned) | C/R (own) |
| Licensing/Billing | D (`org_configure_license`) | — | — | — | — |
| Organization-wide profile/patient names (display only) | R (migration 081, THIS ROUND'S fix) | R (own org, pre-existing) | — | — | — |

## Isolation guarantees carried forward, re-verified this round

- **Tenant isolation**: every `_org` function takes `organization_id`/`p_org_id` and
  checks it against the caller's own `organization_memberships` row — confirmed
  live this round (an unrelated director in a second organization received zero
  rows for both the new `profiles` and `patients` policies).
- **Patient relationship isolation**: `staff_patient_assignments.is_active = true`
  is the sole basis for an individual staff member's record access; a director's
  WIDER org-level visibility (migration 068/081) is a distinct, separately-granted
  path that does not widen any individual staff member's own assignment-based
  access.
- **Clinical provenance**: `source` (`verified_source` / `caregiver_report` /
  `professional_observation`) is still set server-side by `record_patient_*` RPCs
  based on the actual caller, never settable by the client directly — unchanged by
  this round's work.
- **Director authority stays single-tenant**: `is_active_org_director(p_org_id)`
  always takes the specific org id being acted on; there is no "global director"
  concept anywhere in this schema.
