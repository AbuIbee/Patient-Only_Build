# MMA-P1-FINAL — Five-Office Permission Matrix (Deliverable B)

Scope note, stated honestly: this matrix covers the actions most relevant
to tenant isolation, clinical authorization, and the architectural
requirements this directive specifically calls out (Organization Owner
self-assignment, APR, patient closure/archival, Platform Owner
exceptional intervention). It is not a literal enumeration of every RPC
in a 147-migration repository — where an action is omitted, that is
stated, not implied to be reconciled. Every function named below was
read from its actual, current (`CREATE OR REPLACE`-superseded) definition
in `supabase/migrations/`, not from memory of an earlier version.

Columns: Actor · Org relationship required · Functional permission ·
Patient-specific check · Tenant boundary · Licensing requirement ·
Revocation behavior · Audit · Backend enforcement point · Frontend rule.

## Director Office

| Action | Org relationship | Patient check | Tenant boundary | Licensing | Revocation | Audit | Backend | Frontend |
|---|---|---|---|---|---|---|---|---|
| `invite_org_member` | active director | n/a | `organization_id` param scopes the write | licensed_seats + per-role cap (migration 140), row-locked | revoked membership stops all org-scoped RPCs immediately (every RPC re-checks `status='active'` live, never caches) | `organization_memberships` row itself is the record | SQL `SECURITY DEFINER`, `is_active_org_director`-equivalent inline check | Director UI only renders the invite form for a director |
| `remove_org_member` | active director | n/a | org-scoped | n/a | immediate (sets `status='revoked'`) | audited (migration 084) | SQL `SECURITY DEFINER` | hidden from non-directors |
| `assign_staff_to_patient` / `unassign_staff_from_patient` | active director | target patient must be actively covered by the org | org-scoped | n/a | `unassign` sets `is_active=false`, re-checked live by `has_patient_access` et al. | — | SQL `SECURITY DEFINER`, serialized against removal (migration 095) | hidden from non-directors |
| `cover_patient` / `cover_patient_via_staff_registration` | active director (or qualifying staff for the staff-registration path) | n/a (establishes coverage) | org-scoped | capacity-checked against `covered_patient_capacity`, row-locked (migration 039 TOCTOU fix) | n/a | — | SQL `SECURITY DEFINER` | — |
| `close_patient_coverage` (new, migration 146) | **active director only** | the specific (org, patient) coverage row | exactly one row by PK — verified not to touch a second organization's coverage of the same patient | n/a | n/a (forward transition) | audited, mandatory reason+notes | SQL `SECURITY DEFINER` | not yet wired into a UI screen this session (RPC-level only) |
| `register_patient_representative` / `verify_patient_representative` / `revoke_patient_representative` (new, migration 145) | active director or caregiver (register); **director only** (verify/revoke) | org must actively cover the patient | org-scoped | active license required at registration | revoke is immediate, re-checked live | audited at every transition | SQL `SECURITY DEFINER` | not yet wired into a UI screen this session |
| `org_configure_license` | **nobody (authenticated)** — service_role only since migration 143 | n/a | n/a | n/a | n/a | — | grant-level (`REVOKE ... FROM authenticated`), confirmed at raw-SQL layer too | Director UI's "Configure" control removed; capacity CHANGES now only via `director_request_organization_amendment` → Platform Owner review |
| `director_request_organization_amendment` | active director | n/a | org-scoped | n/a | withdrawable by the requester | `organization_amendment_requests` is itself the record | SQL `SECURITY DEFINER` | still wired (`OrganizationDirectorDashboard.tsx:436`), confirmed not regressed by the `org_configure_license` lockdown |

## Caregiver Office

| Action | Org relationship | Patient check | Tenant boundary | Licensing | Revocation | Audit | Backend | Frontend |
|---|---|---|---|---|---|---|---|---|
| Patient clinical read/write (via `has_patient_access`) | active `org_role='caregiver'` membership + active `staff_patient_assignments` row | `is_authorized_for_patient` requires active membership + active coverage + active license (migration 142, this session re-verified) | enforced by the join, not by a UI filter | active license required | revoked membership or unassigned staff row removes access on the NEXT call, no caching | — | every clinical table's RLS, not a service-layer filter | `EnterprisePatientDashboard`/`PatientCareTeam` only render what the backend returns |
| `register_patient_representative` (initiate only) | active caregiver (or director) | org must cover the patient | org-scoped | active license required | n/a | audited | SQL `SECURITY DEFINER` | n/a |

## Medical Office / Therapy Office

| Action | Org relationship | Patient check | Tenant boundary | Licensing | Revocation | Audit | Backend | Frontend |
|---|---|---|---|---|---|---|---|---|
| Clinical authorship (`is_medical_professional_for_patient`/`is_therapist_for_patient`) | active `org_role` match + active staff assignment, **or** an active Organization Owner capability grant for that exact role (new, migration 144) | active coverage + active license required in both paths | the Owner-grant path is explicitly scoped per-organization, verified by test against a second org owned by the same person | active license required | immediate on revocation (membership, assignment, or capability grant) | capability-grant path audited (migration 144); staff-assignment path is not separately audited beyond the membership/assignment rows themselves | SQL `SECURITY DEFINER` boolean helpers, consumed by every clinical table's RLS | — |
| `is_professional_staff_for_patient` | delegates to the two functions above | same | same | same | same | — | SQL, routed through the safe per-role checks (migration 142 fix, beyond the hosted migration) | — |

## Patient Office (including Authorized Patient Representative)

| Action | Org relationship | Patient check | Tenant boundary | Licensing | Revocation | Audit | Backend | Frontend |
|---|---|---|---|---|---|---|---|---|
| Ordinary Patient Office access, self | n/a (`p_user_id = p_patient_id`) | identity match only | n/a | n/a (consumer-pattern self access; Enterprise coverage layered separately) | n/a | — | `is_authorized_for_patient`'s first OR-branch | — |
| **APR access** (new, migration 145) | representative's own account, linked via `patient_representatives.status='active'` | the representative's org must still actively cover the patient (re-checked live) | representative is scoped to exactly the one patient they were enrolled for, by a partial unique index (`one_active_per_patient`) | active license required | revocation (`revoke_patient_representative`) removes access on the next call; patient record is never deleted | every registration/verification/revocation/replacement is audited | `is_authorized_for_patient`'s new OR-branch | not yet wired into a UI screen this session (RPC-level only); clinical tables inherit access automatically since they already gate on `has_patient_access`, and already separate `patient_id` (subject) from `author_id`/`created_by` (actor, migration 070) |
| Clinical authorship via APR | **none** — deliberately not wired into `is_medical_professional_for_patient`/`is_therapist_for_patient` | — | — | — | — | — | — | 7.4: "must not perform internal Director administration" / must not receive staff clinical authorship |

## Cross-cutting: Platform Owner

| Action | Relationship required | Audit | Backend | Frontend |
|---|---|---|---|---|
| `is_platform_owner()` / `admin_set_role()` | `profiles.role IN ('admin','superadmin')`, column-level write-locked (migration 012) — not user-editable | role changes themselves are the record; first-admin bootstrap is explicitly out-of-band, documented, not a defect | SQL column grants + `SECURITY DEFINER` | Admin Center only |
| `admin_set_organization_license_status` (exceptional intervention) | admin/superadmin | **fixed this session (migration 147)** — now writes a full before/after audit row; previously wrote none | SQL `SECURITY DEFINER` | staging/admin-triggered only, confirmed not a production-facing control |
| `place_patient_legal_hold` / `release_patient_legal_hold` (new, migration 146) | admin/superadmin only | audited at both transitions | SQL `SECURITY DEFINER` | not yet wired into a UI screen this session |
| `platform_owner_create_prospect`/`_create_quote`/`_approve_director_application` etc. (MMA-ENT-SALES series) | admin/superadmin | `professional_applications`/`account_management_audit` | SQL `SECURITY DEFINER` | Platform Owner console |

## Cross-cutting: Organization Owner (new, migration 144)

| Action | Relationship required | Patient check | Tenant boundary | Audit | Backend | Frontend |
|---|---|---|---|---|---|---|
| `org_owner_self_assign_capability` / `org_owner_revoke_own_capability` | `organizations.owner_user_id = auth.uid()` for the target org only | capability grant alone is insufficient — the authorization helpers additionally require active coverage + active license | verified by test: the same person owning two organizations only gains access within the org the grant names | every self-assign/revoke audited | SQL `SECURITY DEFINER` | not yet wired into a UI screen this session (RPC-level only) |

## Known incompleteness, stated plainly

- Four of this session's new RPC groups (patient closure, APR enrollment,
  Organization Owner self-assignment, legal holds) are backend-complete
  and tested but **have no UI screen wired to them yet** — Package 1's
  directive emphasizes database/authorization architecture; frontend
  integration for these specific new flows is unfinished and listed as
  remaining work, not implied to exist.
- This matrix does not re-walk every pre-existing RPC from migrations
  001-141 individually (e.g. every conversation/message/document
  function) — those are covered by this repository's existing,
  substantial integration test suite (43 files, 292 tests) rather than
  re-derived here from scratch.
